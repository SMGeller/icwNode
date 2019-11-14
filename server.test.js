// *Note: Tests are in need of async functionality. Timers are a sub-optimal way of waiting for the app to initialize before running tests and an async method of getting information from a response body and then using it in another request body is needed (/logout needs sessionId & userId from /login response body)
// run all .test.js files with the "npm test" command, refer to https://facebook.github.io/jest/docs/en/getting-started.html to run specific tests or for more info on configuration
// Starting the express app with app.listen(), creating a test data (users, courses, etc) in the database should all return their own Promise. beforeAll() should await the successful async resolve from each
const request = require('supertest') // used to make http requests with express app in test suite
const app = require('./server.js')
const MongoClient = require('mongodb').MongoClient
const bcrypt = require('bcrypt') // used for hashing passwords
const uuidv1 = require('uuid/v1') // generates unique UUIDs to use as session ids
let config = null
try { config = require('./.config.js') } // load config with sensitive data ()
catch(e) {
	if ( e instanceof Error && e.code === 'MODULE_NOT_FOUND' )
		console.log('Could not find a .config.js in root directory, using a default development config')
}
let saltRounds // more config variables will be added to the test suite in the future
if (config)
		saltRounds = config.saltRounds
else
	saltRounds = 12

const databaseName = 'icwDevelopment'
const mongoUrl = `mongodb://localhost:27017/${databaseName}`

let testTeacherUser = {email: 'testTeacherEmail', password: 'testTeacherEmail'} // create a test teacher user in database during initialization for use in tests
let testTeacherUserSessionCookie // describe() runs before beforeAll(), cookie must be declared outside describe() scope

let testStudentUser = {email: 'testStudentEmail', password: 'testStudentEmail'} // create a test teacher user (shares test teacher password so bcrypt only has to hash one password)
let testStudentUserSessionCookie  

let testCourse = { name: 'Test Course - Used For Testing', items: [] } // create test course during initialization for use in tests
let testCourseItemId = uuidv1()

beforeAll( async (done) => // verify app.listen() has been called (and mongodb has been connected to by express) before running tests
{ 
	let checkAppInitialization = setInterval( () => 
	{ 
		if ( app.serverInit ) // app.listen() has started http server
		{
			clearInterval(checkAppInitialization)

			MongoClient.connect(mongoUrl, (err, databases) =>
			{
				if (err)
					console.log(`Error: Could not connect to ${mongoUrl} in pre-tests initialization: ${err}`)
				else
				{
					globalDatabase = databases.db(databaseName)
					bcrypt.hash(testTeacherUser.password, saltRounds, (error, hash) =>
					{
						if (err)
							console.log('Could not hash password in test suite initialization')
						else
						{
							// create test teacher user
							testTeacherUser.hashedPassword = hash //
							globalDatabase.collection('users').insertOne({role: 'teacher', email: testTeacherUser.email, password: testTeacherUser.hashedPassword, createdAt: Date.now(), 
								session: {sessionId: uuidv1(), expiresAt: Date.now() + 3600000} }, (testTeacherError, testTeacherResult) => // session expires in 1 hour
							{
								if (testTeacherError)
									console.log(`Error: Could not insert testTeacherUser: ${testTeacherError}`)
								else
								{
									testTeacherUser.session = {userId: testTeacherResult.ops[0]._id, sessionId: testTeacherResult.ops[0].session.sessionId, expiresAt: testTeacherResult.ops[0].session.expiresAt }
									testTeacherUserSessionCookie = `sessionId=${testTeacherUser.session.sessionId}; userId=${testTeacherUser.session.userId};` // this may remove the need for exposing global testTeacherUser variable

									// create test student user
									globalDatabase.collection('users').insertOne({role: 'student', email: testStudentUser.email, password: testTeacherUser.hashedPassword, createdAt: Date.now(), 
										session: {sessionId: uuidv1(), expiresAt: Date.now() + 3600000}, completedCourseItems: [] }, (testStudentErr, testStudentResult) => // session expires in 1 hour
									{
										if (testStudentErr)
											console.log(`Error: Could not insert testStudentUser: ${testStudentErr}`)
										else
										{
											testStudentUser.session = {userId: testStudentResult.ops[0]._id, sessionId: testStudentResult.ops[0].session.sessionId, expiresAt: testStudentResult.ops[0].session.expiresAt }
											testStudentUserSessionCookie = `sessionId=${testStudentUser.session.sessionId}; userId=${testStudentUser.session.userId};` // this may remove the need for exposing global testStudentUser variable

											// create test course
											globalDatabase.collection('courses').insertOne({name: testCourse.name, items: [], createdAt: Date.now()}, (testCourseError, testCourseResult) =>
											{
												if (testCourseError)
													console.log(`Error: Could not insert testCourse ${testCourseError}`)
												else
												{
													testCourse._id = testCourseResult.ops[0]._id
												
													// add test course item to course
													let testCourseItem = {id: testCourseItemId, type: 'lesson', title: 'Test Course Item (Lesson)', content: '<h1>Test Course Item Lesson Header Here</h1>', createdAt: Date.now()} 
													globalDatabase.collection('courses').update({_id: testCourse._id}, {$addToSet: {items: testCourseItem} }, (updateError, updateResult) =>
													{
														if (updateError)
															console.log(`Error: Could not insert test courseItem into course '${testCourse.name}'`)
														else
															testCourse.items.push(testCourseItem)
													})
												}
											})
											done() // start tests, app has initializated
										}
									}) 
								}
							})
						}
					})
				}
			})
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
		request(app).post('/api/v1/tests').send({message: "This is a test-generated test message"}).then( response => expect(response.statusCode).toBe(201) )
	) )
	test('GET /api/v1/nonExistentRoute', () => (
		request(app).get('/api/v1/nonExistentRoute').then( response => { /*console.log('response from test:', response);*/ expect(response.statusCode).toBe(404) } )
	) )	
})

// Suite: test login/logout/signup routes (jest test are sequential so user will be created (if they do not already exist) before /login & /logout tests run)
describe('Fetches login/logout/signup routes', () =>
{
	let sessionId, userId // values are returned from /api/v1/login test and then used in /api/v1/logout test

	test('POST /api/v1/signup', () => (
		 request(app).post('/api/v1/signup').send({email: 'testStudentEmail', password: 'testStudentPassword'}).then( response => expect([200, 409]).toContain(response.statusCode) ) 
	) )
	
	test('POST /api/v1/login', () => {
		request(app).post('/api/v1/login').send({email: testTeacherUser.email, password: testTeacherUser.password}).then( response => expect(response.statusCode).toBe(200) ) 
	} )

	// logout needs a way to access sessionId & userId returned from /api/v1/login 
	// test('POST /api/v1/logout', () => 		
	// (
	// 	request(app).post('/api/v1/logout').send({sessionId, userId}).then( response => 
	// 	{ 
	// 		expect(response.statusCode).toBe(200) 
	// 	})
	// ) )

})

// Suite: test express routes involving courses (which have courseItems nested)
describe('Fetches courses routes', () =>
{
	let announcementContent = 'Please bring your own laptop for presentations. They begin in room A101 at 7:30pm this Wednesday.'
	
	test('POST /api/v1/courses', () => ( // create a course
		request(app).post('/api/v1/courses').set('Session', testTeacherUserSessionCookie).send({name: 'Test Course 2'})
			.then( response => expect([200, 409]).toContain(response.statusCode) )
	) )
	test('GET /api/v1/courses', () => ( // get all courses 
		request(app).get('/api/v1/courses').set('Session', testTeacherUserSessionCookie).then( response => expect(response.body.length).toBeGreaterThanOrEqual(1) )
	) )
	// this test needs async code to access the courseId from the response.body in GET /api/v1/courses  
	test(`POST /api/v1/courses/${testCourse._id}`, () => // post a new courseItem (announcement) to existing course
	(
		request(app).post(`/api/v1/courses/${testCourse._id}`).set('Session', testTeacherUserSessionCookie)
			.send({type: 'announcement', title: 'Project Presentation 2 This Week', content: announcementContent})
			.then( response => expect(response.statusCode).toBe(200) )
	) )

	test(`PATCH /api/v1/courses/${testCourse._id}`, () => // edit existing courseItem
	{
		let courseItem = {type: 'lesson', courseItemId: testCourse.items[0].id, content: '<h1>Edit CourseItem Test Header Here</h1>'}
		
		return request(app).patch(`/api/v1/courses/${testCourse._id}`).set('Session', testTeacherUserSessionCookie)
			.send(courseItem).then( response => expect(response.statusCode).toBe(200) )
	} ) 

	test(`POST /api/v1/courses/${testCourse._id}/${testCourseItemId}`, () => // add sub course item (course item with parent course item)
	{
		let courseItem = {type: 'lesson', title: 'Test Sub Course Item', content: `<h1>Sub Course Item For Course Item with id '${testCourse.items[0].id}'</h1>`}

		return request(app).post(`/api/v1/courses/${testCourse._id}/${testCourse.items[0].id}`).set('Session', testTeacherUserSessionCookie)
			.send(courseItem).then( response => expect(response.statusCode).toBe(200) )
	} )
})

describe('Fetches users routes', () =>
{
	test(`GET /api/v1/users (as student)`, () => // student should be denied permission to GET /users
	(
		request(app).get(`/api/v1/users`).set('Session', testStudentUserSessionCookie).then( response => expect(response.statusCode).toBe(403) )
	) )

	test(`GET /api/v1/users (as teacher)`, () => // 'teacher' can fetch all users
	(
		request(app).get('/api/v1/users').set('Session', testTeacherUserSessionCookie).then( response => expect(response.body.length).toBeGreaterThanOrEqual(1) )
	) )

	test(`POST /api/v1/users/completedCourseItems`, () => // complete course item as student
	{
		return request(app).post(`/api/v1/users/completedCourseItems`).set('Session', testStudentUserSessionCookie).send({courseItemId: testCourse.items[0].id})
			.then( response => expect(response.statusCode).toBe(200) )
	} )	

	test(`PATCH /api/v1/users/role`, () => ( // change test student role to 'teacher'
		request(app).patch(`/api/v1/users/role`).set('Session', testTeacherUserSessionCookie).send({userId: testStudentUser.session.userId, role: 'teacher'})
			.then( response => expect(response.statusCode).toBe(200) )
	) )
})

afterAll( () => 
{ 
// clean up test suite's database operations
	globalDatabase.collection('users').remove({$or: [ {email: testTeacherUser.email}, {email: 'testStudentEmail'} ] }, (err, result) => // remove test users from db
	{
		if (err)
			console.log('Could not remove testTeacherUsers from database')
	})
	globalDatabase.collection('courses').remove({$or: [{name: testCourse.name}, {name: 'Test Course 2'}] }, (err, result) => // remove test courses from db
	{
		if (err)
			console.log('Could not remove testCourse from database')
	})
	globalDatabase.collection('tests').remove({message: 'This is a test-generated test message'}, (err, result) => // remove test courses from db
	{
		if (err)
			console.log('Could not remove testCourse from database')
	})	
	console.log('You must close the express app manually. (Press Ctrl+C)') // *tba: ideally express app should should automatically after tests are run 
}) 