// middleware initialization (excluding authentication)
const express = require('express')
const app = express() 
app.use( express.json() ) // allow json-encoded bodies in requests (typically for POST/PATCH/DELETE etc.)  
app.use( express.urlencoded({extended: true}) ) // allow url-encoded bodies in requests, {extended: true} allows nested objects while {extended: false} allows only string or array values in the req.body's key-value pairs
// return 404 & prevents 403 from authenticateUser for missing routes
app.use( (req, res, next) => expressRoutes.indexOf(req.path) === -1 ? res.status(404).send({error: true, message: `Error: '${req.path}' route does not exist`}) : next() ) 

// development/production/test config initialization
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

			app.listen(port, () => console.log(`Node app for icw listening on port ${port} in ${environment}`)) // successfully connected to mongodb, start node app
		}
	})
}

// will actually log error to file in future versions
function logError(error, res) // If an undefined result is returned from mongo operations in express routes logErrror() will be called with an undefined error
{ 
	console.log(error) 
	res.status(500).send({error: true, message: 'Error: Something went wrong with the database or server. The error has been logged.'})
}

// custom authentication middleware (must app.use( authenticateUser() ) after app.use( cors() ) to avoid error)
app.use( authenticateUser ) 
function authenticateUser(req, res, next)
{
	// whitelist routes that do not require authentication
	let whitelistedRoutes = ['/', '/api/v1/', '/api/v1/signup', '/api/v1/login', '/api/v1/logout', '/api/v1/test' ] 
	if ( ( whitelistedRoutes.indexOf( req.path ) !== -1 ) || ( req.path === '/api/v1/tests' && req.query.requiresAuthentication !== 'true' ) ) // Array.indexOf() return -1 if item is not in array
		next() // skip authentication
	else
		verifyUserSession(req.headers.session)

	function verifyUserSession(session)
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
					next() // authentication successful, move on to route
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

// -- express routes --
app.get('/', (req, res) => // will serve react app
{
	res.send({message: `Success! This route will serve icw's react app in the future`})
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
			res.send( result )
	} )
})
app.post('/api/v1/tests', (req, res) => // test mongodb - add a test to database's 'test' collection
{
	if ( !req.body || !req.body.message )
		res.status(400).send({error: true, message: `Creating a test requires the following valid fields: 'message'`})
	else
		globalDatabase.collection('tests').insert({message: req.body.message}, (err, result) =>
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
		res.status(400).send({error: true, message: `Error: /api/v1/signup requires valid fields: 'email', 'password'`})
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

							globalDatabase.collection('users').insertOne({email: req.body.email, password: hash, createdAt: Date.now(), session: { sessionId, expiresAt } }, (err, result) =>
							{
								if (err || !result)
								{
									err ? logError(err, res) : logError('No error, but did not return result from /signup when creating a new user.', res)
									res.status(422).send({error: true, message: 'Error: Could not create user'})
								}
								else
									res.send({message: `Success: Created user with email '${req.body.email}'`, session: { sessionId, expiresAt, userId: result.ops[0]._id } })
							})  
						}
				}) 
		})
})
app.post('/api/v1/login', (req, res) => // current implementation of authentication only allows one device/browser to be logged in at a time
{
	if ( !req.body || !req.body.email || !req.body.password )
		res.status(400).send({error: true, message: `Error: /api/v1/login requires valid fields: 'email', 'password'`})
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
								res.send({message: `Success: Logged in user with email '${req.body.email}'`, session: {...session, userId} })
						}) 							
					}					
				})
		})
})
app.post('/api/v1/logout', (req, res) =>
{
	if ( !req.body || !req.body.sessionId || !req.body.userId )
		res.status(400).send({error: true, message: `Error: /api/v1/logout requires valid fields: 'sessionId', 'userId'`})
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

const expressRoutes = app._router.stack.filter(r => r.route).map(r => r.route.path) // must be defined after express route handlers