
//
//                                            ,,                                                   
//        `7MMM.     ,MMF'                    db                               /VV***V\            
//          MMMb    dPMM                                                       FV    VF            
//          M YM   ,M MM   ,6"Yb.  `7Mb,od8 `7MM  `7MMpMMMb.   ,6"Yb.          \VF$NVV/            
//          M  Mb  M' MM  8)   MM    MM' "'   MM    MM    MM  8)   MM            *$M               
//          M  YM.P'  MM   ,pm9MM    MM       MM    MM    MM   ,pm9MM     /FV*\  *$M:  /*VF\       
//          M  `YM'   MM  8M   MM    MM       MM    MM    MM  8M   MM     \*MV:  *$M:  :FM/        
//        .JML. `'  .JMML.`Moo9^Yo..JMML.   .JMML..JMML  JMML.`Moo9^Yo.     \*VV*VMMV*V*/          
//                                                                                                 
//         For Ideoxan                                                                             
//                                                                                                 
// A Websocket server that leverages Docker to provide interactive user terminals in the browser.
// It maintains an active websocket connection to the browser (client) and sends/receives tty I/O
// from the docker instance. Marina acts like a middleman between the client and container,
// providing user authentication, container usage timeouts, and container clean ups. Marina is vital
// to ensuring that users have an interactive, but secure workspace on Ideoxan.com
//

/* ---------------------------------------------------------------------------------------------- */
/*                                             MODULES                                            */
/* ---------------------------------------------------------------------------------------------- */
/* -------------------------------------- WebSocket Server -------------------------------------- */
const socketIO                  = require('socket.io')

/* ------------------------------------- MongoDB (Database) ------------------------------------- */
const mongoose = require('mongoose')
const Containers = require('./models/Containers')

/* --------------------------------------- Task Scheduler --------------------------------------- */
const MSM = require('mongo-scheduler-more')

/* -------------------------------------- Execution And TTY ------------------------------------- */
const util = require('util')
const exec = util.promisify(require('child_process').exec)
const pty = require('node-pty')

/* ------------------------------------------ Utilities ----------------------------------------- */
const { v4: uuidv4 } = require('uuid')



/* ---------------------------------------------------------------------------------------------- */
/*                                  CONSTANTS AND INITIALIZATIONS                                 */
/* ---------------------------------------------------------------------------------------------- */
/* -------------------------------------- WebSocket Server -------------------------------------- */
// This sets up the Websocket server (using the socket.io package).
const PORT = 42550                                              // Port the ws server will run on
const socketOpts = {                                            // Server options
    cors: {
        origin: true,
        methods: ['GET', 'POST', 'PUT', 'DELETE'],
        credentials: true
    }
}
const io = socketIO(socketOpts).listen(PORT)                   // Opens the server on the PORT

/* ------------------------------------- MongoDB (Database) ------------------------------------- */
// Connects to the local or internet database (I suggest local btw) using valid mongo uri. Uses
// Mongoose drivers for Mongo DB
mongoose.connect('mongodb://localhost:27017/ix', {
    useNewUrlParser: true,                      // Required
    useUnifiedTopology: true                    // Required
})

/* --------------------------------------- Task Scheduler --------------------------------------- */
// This task scheduler is powered by the mongo-scheduler-more package. It polls the database every
// 60 seconds (1 minute) to check if a task is to be completed. The interval for polling is quite
// large to reduce load on the database and encourage subsequent overlapping calls to the DB.
const scheduler = new MSM('mongodb://localhost:27017/ix', {
    pollInterval: 60000
})

/* -------------------------------------- Base Image Setup -------------------------------------- */
// This runs the docker build command to build the base image of marina. The dockerfile for the
// base image can be found under the root directory. It is tagged "marina-docker" so it can be
// easily targeted. It also overrides any existing base image tagged with "marina-docker". The
// marina base image is based off of the ubuntu-latest image. In reality, any other image could be
// used but Ubuntu was chosen due to its ease of use and appeal to beginners. 
exec('docker build --tag marina-docker .')


io.on('connection', async (socket) => {
    const constants = {
        containerCollection: 'containers',
        taskNamePrefix: 'clean-container-',
        containerLifetime: 60*60*1000
    }
    let containerInstance = {
        id: null,
        tty: null,
        expires: -1,
        path: ''
    }
    let commands = {
        run: null
    }
    let user

    socket.on('init', (data) => {
        user = data.user
        containerInstance.path = data.path
    })
    socket.on('ready', async (data) => {
        socket.emit('stdout', 'Spawning Sandbox Instance...\r\n')

        let container = await Containers.findOne({uid: user.uid}) || null
        if (container) {
            commands.run = await exec(`docker start ${container.containerID}`)
            scheduler.remove({name: constants.taskNamePrefix + container.containerID})
        } else {
            commands.run = await exec('docker run -d -t marina-docker')
        }

        socket.emit('stdout', 'Connecting to Sandbox Instance...\r\n')
        containerInstance.id = commands.run.stdout.toString().substring(0, 12)
        containerInstance.tty = pty.spawn('docker', ['exec', '-it', containerInstance.id, '/bin/bash'], {})


        if (container) {
            containerInstance.expires = -1
            container.expires = containerInstance.expires
            await container.save()
        } else {
            container = await Containers.create({
                uid: user.uid,
                containerID: containerInstance.id,
                lessonPath: containerInstance.path,
            })
        }

        socket.emit('stdout', 'Connected.\r\n')

        containerInstance.tty.onData((data) => {
            socket.emit('stdout', data)
        })

        socket.on('stdin', (data) => {
            containerInstance.tty.write(data)
        })
    
        socket.on('disconnect', async (reason) => {
            await exec(`docker stop ${containerInstance.id}`)
    
            containerInstance.expires = Date.now() + constants.containerLifetime
            container.expires = containerInstance.expires
            await container.save()
    
            await scheduler.schedule({
                name: constants.taskNamePrefix + containerInstance.id,
                after: new Date(containerInstance.expires),
                collection: constants.containerCollection,
                query: {
                    expires: {$gt: -1}
                },
                data: {}
            })
    
            containerInstance.tty.kill()
    
            scheduler.on(constants.taskNamePrefix + containerInstance.id, async (event, doc) => {
                await exec(`docker rm ${containerInstance.id}`)
                
                Containers.deleteOne({containerID: containerInstance.id}, (err) => {
                    if (err) console.log(err)
                })
            }) 
        })
    })
})
