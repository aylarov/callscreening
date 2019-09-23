'use strict';
var http = require('http')
var express = require('express')
var app = express()
var server = http.createServer(app)
var io = require('socket.io')(http).listen(server)
var session = require('express-session')({
    secret: 'secret cat',
    resave: true,
    saveUninitialized: true
})
var sharedsession = require('express-socket.io-session')

var PORT = process.env.PORT || 3000
var sockets = {}

app.use(session)
io.use(sharedsession(session))

io.on('connection', function(socket){
    if (socket.handshake.session.callee === undefined) {
        socket.disconnect(true)
    } else {
        sockets[socket.handshake.session.callee] = socket
        socket.emit('data:'+socket.handshake.session.callee, { session: socket.handshake.session.callee });
    }
});

app.use((req, res, next) => {
    let allowedOrigins = [
        'http://localhost:8080', 
        'http://127.0.0.1:8080',
        'http://localhost',
        'http://127.0.0.1'
    ];
    let origin = req.headers.origin;
    if(allowedOrigins.indexOf(origin) > -1){
        res.setHeader('Access-Control-Allow-Origin', origin);
    }
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept')
    res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,PATCH,OPTIONS')
    res.header('Access-Control-Allow-Credentials', true)
    if (req.method === 'OPTIONS') {
        res.sendStatus(200)
    } else {
        next()
    }
})

app.post('/setCallee', (req,res) => {
    let callee = req.query.callee
    if (callee === undefined || callee === null) res.json({"error":true})
    else {
        req.session.callee = callee
        res.json({"result": true})
    }
})

app.get('/getCallee', (req, res) => {
    res.json({callee: req.session.callee})
})

app.post('/dialogflowResult', (req, res) => {
    if (sockets[req.query.callee] !== undefined) {
        let socket = sockets[req.query.callee]
        socket.emit('data:'+req.query.callee, { result: req.query.data } )
        res.json({ result: true })
    } else res.json({ result: false })
    
})

server.listen(PORT, () => {
    console.log('CallScreening-backend is listening on port %s.', PORT)
})