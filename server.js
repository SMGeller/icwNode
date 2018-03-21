// middleware initialization
const express = require('express');
const path = require('path');
const mongo = require('mongodb');
const mongoose = require('mongoose');
const session = require('express-session');
const passport = require('passport');

const app = express()
app.use( express.json() ) // allow json-encoded bodies in requests (typically for POST/PATCH/DELETE etc.)
app.use( express.urlencoded({extended: true}) ) // allow url-encoded bodies in requests, {extended: true} allows nested objects while {extended: false} allows only string or array values in the req.body's key-value pairs
app.use( express.static('build') ) // serve static files from react build
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

mongoose.connect(mongoUrl).then(
	() => {console.log("Successfully connected to mongoDB database")},
	(err) => {console.log(err)}
);

// Express Session
app.use(session({
  secret: 'secret',
	saveUninitialized: false,
	resave: false,
	cookie: { secure: true }
}));

// Passport Init
app.use(passport.initialize());
app.use(passport.session());

// will actually log error to file in future versions
function logError(error, res) {
	console.log(error)
	res.status(500).send({error: true, message: 'Error: Something went wrong with the database or server. The error has been logged.'})
}

//****** Routing
var users = require('./routes/users.routes');
app.use('/users', users);

app.get('/', (req, res) => {
	if (req.session.visitCount) {
		req.session.visitCount++;
		res.setHeader('Content-Type', 'text/html');
		res.write('<p>views: ' + req.session.visitCount + '</p>');
		res.end();
	}
	else {
			req.session.visitCount = 1;
			res.send("Success! This route will serve icw's react app in the future");
	}
});

// test routes
app.get('/test', (req, res) => {
	res.send({message: `Success! from /test on port ${port} in ${environment}.`});
});

app.get('/api/v1/test', (req, res) => {
	res.send({message: `Success! from version 1 of the api. ( /api/v1/test ) `})
});

app.get('/api/v1/tests', (req, res) => // test mongodb - return all documents in 'tests' collection
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

app.listen(port, () => console.log(`Node app for icw listening on port ${port} in ${environment}`)) // successfully connected to mongodb, start node app
