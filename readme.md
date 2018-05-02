This is the Node app for the IT/CS Workshop at University of Florida. Serves the frontend (React) app from https://icw.cise.ufl.edu

Start the app in development with "npm start".
The "npm start" command will install all dependencies, start a mongo server if one is not already running, and start the app if the local machine has valid versions of npm, node, and mongodb installed. 

# General Documentation
An understanding of the basics of [Node](https://nodejs.org/en/docs), [Express](https://expressjs.com), and [MongoDB](https://docs.mongodb.com) are critical to understanding this application.

## Default Configuration
Default configuration is defined in server.js. In lieu of a .config.js the app will start at "localhost:8000" and use a mongo database located at "localhost:27017/icwDevelopment". Configuration can be modified by editing .config.js (more info located in the Production section of this readme).

## Versioning/Notes
(Passing with node v8.10.0, express v4.16.3, npm v5.6.0, mongo v3.4.0 (Build tests should be added in later versions). 

## Tests
Run the [Jest](https://facebook.github.io/jest/) test suite with 'npm test'. The test suite uses the "icwDevelopment" mongo database and currently lacks some configuration. All tests are currently located in server.tests.js.
The test suite may have its own database & environment in the future. 

## Authentication
Custom authentication middleware is used that checks the 'Session' field in each HTTP request for a valid user and session id. Some routes are whitelisted while others required a valid session or even a valid session and a specific user role (such as "teacher"). 

## MongoDB
The mongo database is interfaced through the use of a global variable called "globalDatabase" defined during MongoClient initialization. "icwDevelopment" is the default mongo database used by this app.

## Projects/Articles vs. Courses & Course Items
The api defines Projects and its sub-items as courses and courseItems. Courses have nested courseItems in the backend of type 'lesson' or 'quiz'. A courseItem may also include a sub-courseItem, which is used to represent a topic and its subtopic.

## Production
Running this app in production version of this app requires the inclusion of .config.js file in the root directory. This file holds config variables that are sensitive and is therefore ignored by .gitignore. 
An example .config.js is as follows (includes all config variables):
```javascript
// export config variables
exports.isConfigEnabled = true // false enables default development configuration with CORS-enabled, true disables CORS and uses config variables defined in this file  
exports.environment = 'production' // production/development/test
exports.port = 8080
exports.saltRounds = 14 // cost factor of bcrypt hashing
exports.databaseName = 'nameOfMyDatabase' // used by MongoClient and in mongoUrl
exports.mongoUrl = `mongodb://localhost:27017/${databaseName}` // contains database user info (this is sensitive data!)
```

## System Administrator/Server Notes
The icw.cise.ufl.edu computer currently runs Ubuntu 16.04 LTS. Much of the configuration was setup using DigitalOcean documentation regarding node/express/mongo configuration on Ubuntu: https://www.digitalocean.com/community/tutorials/how-to-set-up-a-node-js-application-for-production-on-ubuntu-16-04. [PM2](http://pm2.keymetrics.io/) runs the node app on port 8002 for the [Nginx](https://www.nginx.com/) reverse proxy to https.icw.cise.ufl.edu. (SSL certificate self-generated and managed using [Certbot](https://www.digitalocean.com/community/tutorials/how-to-secure-nginx-with-let-s-encrypt-on-ubuntu-16-04)). MongoDB runs as a daemon as configured per DigitalOcean documentation: https://www.digitalocean.com/community/tutorials/how-to-install-and-secure-mongodb-on-ubuntu-16-04.