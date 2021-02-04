const http = require('http')

const util = require('util')

const exec = util.promisify(require('child_process').exec)

const pty = require('node-pty')



const server = http.createServer().listen(42550, () => {
    console.log('Marina Online')
    console.log('Serving Requests out of ' + 42550)
})
const io = require('socket.io')(server, {
    cors: {
        origin: true,
        methods: ['GET', 'POST', 'PUT', 'DELETE'],
        credentials: true
    }
})



io.on('connection', async (socket) => {
    await exec('docker build --tag marina-docker .')

    socket.emit('stdout', 'Spawning Sandbox Instance...\r\n')
    let containerRun = await exec('docker run -d -t marina-docker')

    socket.emit('stdout', 'Connecting to Sandbox Instance...\r\n')
    const CONTAINER_ID = containerRun.stdout.toString().substring(0, 12)
    const terminal = pty.spawn('docker', `exec -it ${CONTAINER_ID} /bin/bash`, {})
    socket.emit('stdout', 'Connected.\r\n')

    terminal.onData((data) => {
        socket.emit('stdout', data)
    })

    socket.on('stdin', (data) => {
        terminal.write(data)
    })

    socket.on('disconnect', async (reason) => {
        await exec(`docker stop ${CONTAINER_ID}`)
        await exec(`docker rm ${CONTAINER_ID}`)
        terminal.kill()
    })
})