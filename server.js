const express = require('express')
const app = express()

// these will depend on config initialization in the future
const cors = require('cors')
app.use( cors() )
let port = 8000
let environment = 'development'

app.listen(port, () => console.log(`Node app for icw listening on port ${port} in ${environment}`))

app.get('/', (req, res) =>
{
	res.send({message: `Success! This route will serve icw's react app in the future`})
})

app.get('/test', (req, res) =>
{
	res.send({message: `Success! from /test on port ${port} in ${environment}`})
})