// *Note: Tests are in need of async functionality. Timers are a sub-optimal way of waiting for the app to initialize before running tests and an async method of getting information from a response body and then using it in another request body is needed (/logout needs sessionId & userId from /login response body)
// run all .test.js files with the "npm test" command, refer to https://facebook.github.io/jest/docs/en/getting-started.html to run specific tests or for more info on configuration
const request = require('supertest')
const app = require('./server.js')

beforeAll( async (done) => // verify app.listen() has been called (and mongdb has been connected to by express) before running tests
{ 
	let checkAppInitialization = setInterval( () => 
	{ 
		if ( app.serverInit )
		{
			clearInterval(checkAppInitialization)
			done() // start tests, app has initializated
		} 
	}, 100 ) // every .1s
})

test('Test test', () => expect( 1 + 1 ).toBe(2) ) // example test (included as this test should always pass)

// Suite: test express test routes 
describe('Fetches test express routes', () =>
{
	test('GET /api/v1/test', () => 	(
		 request(app).get('/api/v1/test').then( response => expect(response.body).toEqual({"message":"Success! from version 1 of the api. ( /api/v1/test ) "}) )
	) )
	test('GET /api/v1/tests', () => (
		request(app).get('/api/v1/tests').then( response => expect(response.statusCode).toBe(200) )
	) )	
	test('POST /api/v1/tests', () => ( // *tba: ideally the added test in mongoDb from this test should be cleared automatically
		request(app).post('/api/v1/tests').send({message: "This is a test-generated test message (Currently have to be removed manually from mongo shell)"}).then( response => expect(response.statusCode).toBe(201) )
	) )
	test('GET /api/v1/nonExistentRoute', () => (
		request(app).get('/api/v1/nonExistentRoute').then( response => { /*console.log('response from test:', response);*/ expect(response.statusCode).toBe(404) } )
	) )	
})

// Suite test login/logout/signup routes (jest test are sequential so user will be created (if they do not already exist) before /login & /logout tests run)
describe('Fetches login/logout/signup routes', () =>
{
	let sessionId, userId // values are returned from /api/v1/login test and then used in /api/v1/logout test
	global.testGlobal = 'myTestGlobalValue'

	test('POST /api/v1/signup', () => (
		 request(app).post('/api/v1/signup').send({email: 'testEmail', password: 'testPassword'}).then( response => 
		 {
		 	//console.log('login response.body:', response.body)
		 	expect([200, 409]).toContain(response.statusCode) 
		 }
		 ) 
	) )
	
	test('POST /api/v1/login', () => {
		request(app).post('/api/v1/login').send({email: 'testEmail', password: 'testPassword'}).then( response => expect(response.statusCode).toBe(200) ) 
	} )

	// logout need a way to access sessionId & userId returned from /api/v1/login 
	// test('POST /api/v1/logout', () => 		
	// (
	// 	request(app).post('/api/v1/logout').send({sessionId, userId}).then( response => 
	// 	{ 
	// 		expect(response.statusCode).toBe(200) 
	// 	})
	// ) )

})

afterAll( () => { console.log('You must close the express app manually. (Press Ctrl+C)'); } ) // *tba: ideally express app should should automatically after tests are run