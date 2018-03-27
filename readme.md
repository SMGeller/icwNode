This is the React app for the IT/CS Workshop at University of Florida. 
https://icw.cise.ufl.edu

Start the app in development with "npm start".
The "npm start" command will install all dependencies, start a mongo server if one is not already running, and start the app if the local machine has valid versions of npm, node, and mongodb installed. 
(Passing with mongo v3.4.0, node v8.10.0, npm v5.6.0, mongo v3.4.0 -> Build tests will be added in later versions.) 
Run the test suite with "npm test". The test suite uses the "icwDevelopment" mongo database and currently lacks some configuration. 
The test suite may have its own database & environment in the future. 


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