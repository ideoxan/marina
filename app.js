const express = require('express')
const http = require('http')

const pty = require('node-pty')



const app = express()
const server = http.createServer(app).listen(42550, () => {
    console.log('Marina Online')
    console.log('Serving Requests out of ' + 42550)
})
const io = require('socket.io')(server)



app.get('/', (req, res) => {
    res.sendFile(__dirname + '/views/terminal.html')
})

io.on('connection', (socket) => {
    const CONTAINER_NAME = 'sharp_cray'
    const terminal = pty.spawn('docker', `exec -it ${CONTAINER_NAME} /bin/bash`, {})
    console.log('Connecting to Remote Sandbox Instance...')

    terminal.onData((data) => {
        socket.emit('stdout', data)
    })

    socket.on('stdin', (data) => {
        terminal.write(data)
    })

    socket.on('disconnect', (reason) => {
        terminal.kill()
        console.log('Dismounting Remote Sandbox Instance...')
    })
})
