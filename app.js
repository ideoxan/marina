const express = require('express')
const http = require('http')

const util = require('util')

const exec = util.promisify(require('child_process').exec)

const pty = require('node-pty')



const app = express()
const server = http.createServer(app).listen(42550, () => {
    console.log('Marina Online')
    console.log('Serving Requests out of ' + 42550)
})
const io = require('socket.io')(server)



app.use('/modules/', express.static('./node_modules'))



app.get('/', (req, res) => {
    res.sendFile(__dirname + '/views/terminal.html')
})

io.on('connection', async (socket) => {
    socket.emit('stdout', 'Building Sandbox Image...')
    socket.emit('stdout', '\t(1/6) Loading Sandbox Configuration...')
    socket.emit('stdout', '\t(2/6) Pulling Image...')
    socket.emit('stdout', '\t(3/6) Creating User...')
    socket.emit('stdout', '\t(4/6) Adding Dependencies and Packages...')
    socket.emit('stdout', '\t(5/6) Cleaning Up...')
    socket.emit('stdout', '\t(6/6) Exporting...')

    socket.emit('stdout', 'Spawning Sandbox Instance...')
    let containerRun = await exec('docker run -d -t marina-docker')
    if (containerRun.stderr) return socket.emit('stderr', 'Spawn Failed. Exiting.')

    socket.emit('stdout', 'Connecting to Sandbox Instance...')
    const CONTAINER_HASH = containerRun.stdout.toString().substring(0, 12)
    const terminal = pty.spawn('docker', `exec -it ${CONTAINER_HASH} /bin/bash`, {})
    socket.emit('stdout', 'Connected.')

    terminal.onData((data) => {
        socket.emit('stdout', data)
    })

    socket.on('stdin', (data) => {
        terminal.write(data)
    })

    socket.on('disconnect', async (reason) => {
        await exec(`docker stop ${CONTAINER_HASH}`)
        terminal.kill()
    })
})
