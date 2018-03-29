// middleware initialization (excluding authentication)
const express = require('express')
const app = express() 
app.use( express.json() ) // allow json-encoded bodies in requests (typically for POST/PATCH/DELETE etc.)  
app.use( express.urlencoded({extended: true}) ) // allow url-encoded bodies in requests, {extended: true} allows nested objects while {extended: false} allows only string or array values in the req.body's key-value pairs
app.use( express.static('build') ) // serve static files from react build
// return 404 & prevents 403 from authenticateUser for missing routes
app.use( (req, res, next) => checkIfRouteExists(req, res, next) ) 

// development/production/test config initialization
app.serverInit = false // used to check initialization in tests
let config = null
try { config = require('./.config.js') } // load config with sensitive data ()
catch(e) {
	if ( e instanceof Error && e.code === 'MODULE_NOT_FOUND' )
		console.log('Could not find a .config.js in root directory, using a default development config')
}
let port, environment, mongoUrl, saltRounds, databaseName // config variables
if ( config && config.isConfigEnabled ) // setup config from .config.js, cors is disabled in non-default config
{
	port = config.port
	environment = config.environment
	databaseName = config.databaseName
	mongoUrl = config.mongoUrl
	saltRounds = config.saltRounds
}
else // use default development config
{
	const cors = require('cors')
	app.use( cors() ) // allow cors in default development environment
	port = 8000
	environment = 'development'
	databaseName = 'icwDevelopment'
	mongoUrl = `mongodb://localhost:27017/${databaseName}`
	saltRounds = 12
}

// mongodb initialization 
const MongoClient = require('mongodb').MongoClient
const ObjectId = require('mongodb').ObjectId // _id field auto-generated in mongo documents uses ObjectId 
const mongod = require('mongod') // mongo daemon
const mongoServer = new mongod(27017)
const bcrypt = require('bcrypt') // used for hashing passwords
const uuidv1 = require('uuid/v1') // generates unique UUIDs to use as session ids
mongoServer.open( err =>
{
	if (err)
		console.log('Error opening mongo server (mongo daemon could already be running):', err)
	else
		console.log('Successfully opened mongo server')
		
		console.log('Connecting to mongodb...')
		connectToMongoDb() // assume mongod is already running if mongo server cannot be opening and connect to mongodb regardless of mongoServer.open() result
})
let globalDatabase = null // global variable allowing express routes to interact with database 
function connectToMongoDb()
{
	MongoClient.connect(mongoUrl, (err, databases) =>
	{
		// mongo 3.4 actually returns databases object containing dbs (including the database name used in mongoUrl)  
		if ( err )
			throw err // should implement a way to catch this in future 
		else
		{
			globalDatabase = databases.db(databaseName)
			console.log(`Success! Connected to '${mongoUrl}'`)

			app.listen(port, () => // successfully connected to mongodb, start node app
			{
				console.log(`Node app for icw listening on port ${port} in ${environment}`) 
				app.serverInit = true // used to check express app has started in tests
			} ) 
		}
	})
}

// will actually log error to file in future versions
function logError(error, res) // If an undefined result is returned from mongo operations in express routes logErrror() will be called with an undefined error
{ 
	console.log(error) 
	res.status(500).send({error: true, message: 'Error: Something went wrong with the database or server. The error has been logged.'})
}

// send 404 error if express route handler does not exist for request url
checkIfRouteExists = (req, res, next) =>
{
	for ( let i in expressRoutes ) // this should be expanded when routes with multiple params are added
		if ( expressRoutes[i].indexOf(':') !== -1 && expressRoutes[i].substring(0, expressRoutes[i].indexOf(':') ) === req.path.substring(0, expressRoutes[i].indexOf(':') ) ) 
	 		return next() // temporary method to handle dynamic routes (express routes with params such as /api/v1/course/:courseId)

	if ( expressRoutes.indexOf(req.path) === -1 && true )
		res.status(404).send({error: true, message: `Error: '${req.path}' route does not exist`}) // route does not exist, send 404 error
	else 
		next() // route exists, allow request
}

// custom authentication middleware (must app.use( authenticateUser() ) after app.use( cors() ) to avoid error)
app.use( authenticateUser ) 
function authenticateUser(req, res, next)
{
	let whitelistedRoutes = ['/', '/api/v1/', '/api/v1/signup', '/api/v1/login', '/api/v1/logout', '/api/v1/test'] // whitelist routes that do not require any authentication
	let teacherRoleRequiredRoutes = [{path: '/api/v1/courses', methods: ['POST']}, {path: '/api/v1/courses/', methods: ['POST']}] // routes that require role of 'teacher' or above (admin > teacher > student)

	if ( ( whitelistedRoutes.indexOf( req.path ) !== -1 ) || ( req.path === '/api/v1/tests' && req.query.requiresAuthentication !== 'true' ) ) // Array.indexOf() return -1 if item is not in array
		next() // skip authentication
	else if ( isThisRoleRequired(teacherRoleRequiredRoutes, req, 'teacher') ) // check if route requires 'teacher' role or above
		verifyUserSession(req.headers.session, 'teacher')
	else
		verifyUserSession(req.headers.session, null) // regular authentication (no role specified)

	function verifyUserSession(session, roleRequired)
	{
		let sessionId = parseValueFromCookie(session, 'sessionId')
		let userId = parseValueFromCookie(session, 'userId')

		if ( !ObjectId.isValid(userId) ) // verify userId is of valid format for ObjectId, otherwise ugly 500 error will be returned to client
			return res.status(403).send({error: true, message: `Error: Could not authenticate user with invalid userId format ('${userId}') and sessionId '${sessionId}' `})

		globalDatabase.collection('users').findOne({_id: ObjectId(userId), 'session.sessionId': sessionId }, (err, result) =>
		{
			if ( err || !result )
				res.status(403).send({error: true, message: `Error: Could not authenticate user with userId '${userId}' and sessionId '${sessionId}' `})
			else
			{
				if ( Date.now() > result.session.expiresAt ) // session was valid, but is now expired. user most log back in
					res.status(401).send({error: true, message: 'Error: Your session has expired due to inactivity. Please log back in.'})
				else // session is valid & has not yet expired
				{
					// refresh session expiration to last an hour from now (date of last backend operation)
					let now = new Date()
					let expiresAt = now.setHours( now.getHours() + 1 )  // session expires in 1 hour 
					globalDatabase.collection('users').update( {_id: ObjectId(userId), 'session.sessionId': sessionId}, {$set: { 'session.expiresAt': expiresAt } }, (error, updateExpirationResult) =>
					{
						if (error)
							logError(`Error refreshing session for userId '${userId}' using sessionId '${sessionId}' ` + error, res)
					})
					if ( result.role === 'admin' || result.role === roleRequired || !roleRequired  ) // authenticated if user is an admin, has correct role, or no role is required
						next() // authentication successful, move on to route
					else
						res.status(403).send({error: true, message: `Error: You do not have the role required to perform this action.`})
				}
			}
		})		

	}
}
function parseValueFromCookie(cookieString, key) // helper function extracts values from a cookie string format, e.g. parseValueFromCookie('key1=value1; key2=value2;', 'key1') would return value1   
{
	let keyPortionOfString = RegExp("" + key + "[^;]+").exec(cookieString) // get key followed by anything other than semicolon
	return decodeURIComponent(!!keyPortionOfString ? keyPortionOfString.toString().replace(/^[^=]+./, '') : '') // return everything after equal sign, otherwise return empty string
}
function isThisRoleRequired(thisRoleRequiredRoutes, req, role)
{
	for ( let i in thisRoleRequiredRoutes )
		if ( thisRoleRequiredRoutes[i].path === req.path && thisRoleRequiredRoutes[i].methods.indexOf(req.method) !== -1 ) // check if route requires a role of teacher or higher for the HTTP method used
			return true // teacher role is required
	return false // else teacher role is not required
}

// -- express routes --
app.get('/', (req, res) => // will serve react app
{
	res.sendFile( __dirname + '/index.html')
})

// test routes
app.get('/api/v1/test', (req, res) =>
{
	res.send({message: `Success! from version 1 of the api. ( /api/v1/test ) `})
})
app.get('/api/v1/tests', (req, res) => // test mongodb - return all documents in 'tests' collection, can toggle requiresAuthentication to test authentication
{
	globalDatabase.collection('tests').find( {}, {fields: { _id: 0 } } ).toArray( (err, result) => // return all tests but exclude their _id fields
	{
		if ( err )
			logError(err, res)
		else
			res.send(result)
	} )
})
app.post('/api/v1/tests', (req, res) => // test mongodb - add a test to database's 'test' collection
{
	if ( !req.body || !req.body.message )
		res.status(400).send({error: true, message: `Creating a test requires the following valid fields in request body: 'message'`})
	else
		globalDatabase.collection('tests').insert({message: req.body.message, createdAt: Date.now()}, (err, result) =>
		{
			if (err)
				logError(err, res)
			else
				res.status(201).send({message: `Success: Test created with message '${req.body.message}'`})
		})
}) 

// login/logout/signup
app.post('/api/v1/signup', (req, res) =>
{
	if ( !req.body || !req.body.email || !req.body.password )
		res.status(400).send({error: true, message: `Error: /api/v1/signup requires valid fields in request body: 'email', 'password'`})
	else
		bcrypt.hash( req.body.password, saltRounds, (error, hash) => 
		{
			if (error)
				logError(error, res)
			else	// create user with session that expires in 1 hour (assuming user with email does not already exist)
				globalDatabase.collection('users').findOne({email: req.body.email}, (findOneError, findOneResult) => // check that email is not taken by existing user
				{
					if (findOneError)
						logError( findOneError, res )
					else 
						if (findOneResult) // user with email already exists 
							res.status(409).send({error: true, message: `Error: The email '${req.body.email}' is already in use by an existing user.`})
						else // email available, create user
						{
							let expiresAt = new Date().setHours( new Date().getHours() + 1 )
							let sessionId = uuidv1() // gener

							globalDatabase.collection('users').insertOne({role: 'student', email: req.body.email, password: hash, createdAt: Date.now(), session: { sessionId, expiresAt } }, (err, result) =>
							{
								if (err || !result) // signup creates 'student' user, for now an user must have their role updated from mongo shell
								{
									err ? logError(err, res) : logError('No error, but did not return result from /signup when creating a new user.', res)
									res.status(422).send({error: true, message: 'Error: Could not create user'})
								}
								else
									res.send({message: `Success: Created user with email '${req.body.email}'`, session: { sessionId, expiresAt, userId: result.ops[0]._id, role: result.ops[0].role } })
							})  
						}
				}) 
		})
})
app.post('/api/v1/login', (req, res) => // current implementation of authentication only allows one device/browser to be logged in at a time
{
	if ( !req.body || !req.body.email || !req.body.password )
		res.status(400).send({error: true, message: `Error: /api/v1/login requires valid fields in request body: 'email', 'password'`})
	else
		globalDatabase.collection('users').findOne({email: req.body.email}, (err, result) =>
		{
			if (err || !result)
				err ? logError(err, res) : res.status(401).send({error: true, message: `Error: Invalid email/password`}) // could not find user
			else
				bcrypt.compare(req.body.password, result.password, (error, compareResult) =>
				{
					if ( error || !compareResult ) // handle both cases: bcrypt threw unexpected error OR user exists, but client-provided password is wrong
						error ? logError(error, res)  : res.status(401).send({error: true, message: `Error: Invalid email/password`}) 
					else // passwords match, login user (use result._id from findOne() since the _id field is indexed)
					{
						let userId = result._id
						let now = new Date()
						let session = { sessionId: uuidv1(), expiresAt: now.setHours( now.getHours() + 1 ) } // session expires in 1 hour 
						  
						globalDatabase.collection('users').update({_id: result._id}, {$set: { session } }, (updateError, updateResult) => // generate new session for user (result._id is already an ObjectId) 
						{
							if (updateError || !updateResult)
								logError(updateError, res)
							else
								res.send({message: `Success: Logged in user with email '${req.body.email}'`, session: {...session, userId, role: result.role} })
						}) 							
					}					
				})
		})
})
app.post('/api/v1/logout', (req, res) =>
{
	if ( !req.body || !req.body.sessionId || !req.body.userId )
		res.status(400).send({error: true, message: `Error: /api/v1/logout requires valid fields in request body: 'sessionId', 'userId'`})
	else
	{
		if ( !ObjectId.isValid(req.body.userId) ) // verify userId is of valid format for ObjectId, otherwise ugly 500 error will be returned to client
			return res.status(403).send({error: true, message: `Error: Could not authenticate user with invalid userId format ('${userId}') and sessionId '${sessionId}' `})
		
		globalDatabase.collection('users').update({_id: ObjectId(req.body.userId), 'session.sessionId': req.body.sessionId}, {$set: { 'session.sessionId': null, 'session.expiresAt': null } }, (err, result) =>
		{
			if (err)
				logError(err, res)
			else
				res.send({message: `Success: You have logged out`, invalidatedSessionId: req.body.sessionId})
		})
	}
})

// courses
app.get('/api/v1/courses', (req, res) => // get courses
{
	globalDatabase.collection('courses').find({}).toArray( (err, result) =>
	{
		if (err)
			logError(err)
		else
			res.send(result)
	})
}) 
app.post('/api/v1/courses', (req, res) => // create new course
{
	if ( !req.body || !req.body.name )
		res.status(400).send({error: true, message: `Error: /api/v1/courses requires valid fields in request body: 'name'`})
	else
		globalDatabase.collection('courses').insertOne({name: req.body.name, items: [], createdAt: Date.now() }, (err, result) =>
		{
			if (err)
				logError(err)
			else
				res.send({message: `Success: Course '${req.body.name}' created`})
		})
})
app.post('/api/v1/courses/:courseId', (req, res) =>
{
	if ( !req.params.courseId || !req.body || !req.body.type || !req.body.title || !req.body.content || !ObjectId.isValid(req.params.courseId) )
		res.status(400).send({error: true, message: `Error: /api/v1/courses/:courseId requires valid fields in request body: 'type', 'title', 'content' and a valid :courseId in url`})
	else
		globalDatabase.collection('courses').update({_id: ObjectId(req.params.courseId) }, 
			{$addToSet: { items: {id: uuidv1(), type: req.body.type, title: req.body.title, content: req.body.content, createdAt: Date.now()} } }, (err, result) =>
		{
			if (err)
				logError(err)
			else
				res.send({message: `Success: Added '${req.body.type}' to course with id '${req.params.courseId}'`})
		})
})

const expressRoutes = app._router.stack.filter(r => r.route).map(r => r.route.path) // must be defined after express route handlers
module.exports = app // default export is express app