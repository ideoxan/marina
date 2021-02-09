const http = require('http')

const util = require('util')
const exec = util.promisify(require('child_process').exec)
const pty = require('node-pty')
const { v4: uuidv4 } = require('uuid')
const MSM = require('mongo-scheduler-more')
const mongoose = require('mongoose')
const Containers = require('./models/Containers')



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
const db = mongoose.connect('mongodb://localhost:27017/ix', {
    useNewUrlParser: true,                      // Required
    useUnifiedTopology: true                    // Required
})
const scheduler = new MSM('mongodb://localhost:27017/ix', {
    pollInterval: 60000
})
exec('docker build --tag marina-docker .')


io.on('connection', async (socket) => {
    const uid = 'abc123'
    const lessonPath = '/'

    socket.emit('stdout', 'Spawning Sandbox Instance...\r\n')

    let dockerRun
    let container = await Containers.findOne({uid: uid, lessonPath: lessonPath}) || null
    if (container) {
        dockerRun = await exec(`docker start ${container.containerID}`)
        scheduler.remove({name: 'clean-container-' + container.containerID})
    } else {
        dockerRun = await exec('docker run -d -t marina-docker')
    }

    socket.emit('stdout', 'Connecting to Sandbox Instance...\r\n')
    const CONTAINER_ID = dockerRun.stdout.toString().substring(0, 12)
    const terminal = pty.spawn('docker', ['exec', '-it', CONTAINER_ID, '/bin/bash'], {})


    if (container) {
        container.expires = -1
        await container.save()
    } else {
        container = await Containers.create({
            uid: uid,
            containerID: CONTAINER_ID,
            lessonPath: lessonPath,
        })
    } 

    socket.emit('stdout', 'Connected.\r\n')

    terminal.onData((data) => {
        socket.emit('stdout', data)
    })

    socket.on('stdin', (data) => {
        terminal.write(data)
    })

    socket.on('disconnect', async (reason) => {
        await exec(`docker stop ${CONTAINER_ID}`)

        const expiresTime = Date.now() + (60 * 60 * 1000)
        container.expires = expiresTime
        await container.save()

        await scheduler.schedule({
            name: 'clean-container-' + CONTAINER_ID,
            after: new Date(expiresTime),
            collection: 'containers',
            data: {}
        })

        terminal.kill()

        scheduler.on('clean-container-' + CONTAINER_ID, async (event, doc) => {
            await exec(`docker rm ${CONTAINER_ID}`)
            
            Containers.deleteOne({containerID: CONTAINER_ID}, (err) => {
                if (err) console.log(err)
            })
        }) 
    })
})