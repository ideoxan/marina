
//
//                                            ,,                                                   
//        `7MMM.     /MMF`                    ''                               /VV***V\            
//          MMMb    dPMM                                                       FV    VF            
//          M YM   ,M MM   ,6"Yb.  `7Mm,od8 `7MM  `7MMpMMMb.  ./6"Yb.          \VF$NVV/            
//          M  Mb  M' MM  8)   MM    MM' '"   MM    MM    MM  8)   MM            *$M               
//          M  YM.P'  MM   ,pm9MM    MM       MM    MM    MM   ,pm9MM     /FV*\  *$M:  /*VF\       
//          M  `YM'   MM  8M   MM    MM       MM    MM    MM  8M   MM     \*MV:  *$M:  :FM/        
//        .JML. `'  .JMML.`Moo9^Yo..JMML.   .JMML..JMML  JMML.`Moo9^Yo,     \*VV*VMMV*V*/          
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


/* ---------------------------------------------------------------------------------------------- */
/*                                     WEBSOCKET SEVER HANDLER                                    */
/* ---------------------------------------------------------------------------------------------- */
// The connection event is fired each time someone connects to the WS sever
io.on('connection', async (socket) => {
    /* ------------------------------------ Connection Variables -------------------------------- */
    // These are just some constants that persist the connection (useful for stuff like the database
    // collection name or the lifetime of all containers)
    const constants = {
        containerCollection: 'containers',
        taskNamePrefix: 'clean-container-',
        containerLifetime: 60*60*1000
    }
    // Basic information used to identify containers. Set upon initialization 
    let containerInstance = {
        id: null,                                               // The ID (short hash)
        tty: null,                                              // TTY interface (see node-pty)
        expires: -1,                                            // Lifetime expiry date
        path: ''                                                // The lesson path used
    }
    // Output of all commands run (in which a return is needed)
    let commands = {
        run: null                                               // docker run/start commands
    }
    // User data (UID, username, etc) used for user identification/authentication
    let user

    /* --------------------------------------- Initialization ----------------------------------- */
    // This socket call initializes the above variables to setup the connection properly
    socket.on('init', (data) => {
        user = data.user                                        // Sets up the user
        containerInstance.path = data.path                      // Sets the path of the lesson
    })

    /* -------------------------------- Client Connection Ready Event --------------------------- */
    // This socket event is called when the client is ready to talk with the docker instance. It can
    // only be called  once and should be used after the "init" event has been called. This builds,
    // spawns, and sets up the docker instance to be used.
    socket.on('ready', async (data) => {
        // Informs the client via the terminal that the sandbox container is being set up
        socket.emit('stdout', 'Spawning Sandbox Instance...\r\n')

        // Attempts to find if there is a container already assigned to this user
        // TODO: Check if there is already one setup on the path. If there is one assigned to the user but not the path, kill it. If there is not one at all, create a new one. Otherwise, stop the instance and restart it
        let container = await Containers.findOne({uid: user.uid}) || null
        if (container) {
            // If the container exists, just start it using it's ID
            commands.run = await exec(`docker start ${container.containerID}`)
            // Also remove the scheduled removal of the container.
            // TODO: check if the removal is actually scheduled before removing
            scheduler.remove({name: constants.taskNamePrefix + container.containerID})
        } else {
            // Otherwise, just start a new container with the marina-docker base image
            // TODO: use paths to create new images
            commands.run = await exec('docker run -d -t marina-docker')
        }

        // Start connecting to the container instance
        socket.emit('stdout', 'Connecting to Sandbox Instance...\r\n')
        // Grabs the ID of the container from the output
        containerInstance.id = commands.run.stdout.toString().substring(0, 12)
        // Sets the TTY interface that will be listened to and sent to/from the user. Executes bash
        // so the user can get access to the command line and pipes the output.
        containerInstance.tty = pty.spawn('docker', ['exec', '-it', containerInstance.id, '/bin/bash'], {})

        // Check if the container exists yet or not
        if (container) {
            // Sets the expire time to negative (this is used to reduce queries when expires > -1).
            // This also ensures that the server won't be shut down while the user is still in the
            // container. This also ensures that a custom epoch can be used and that time can equal
            // to 0.
            containerInstance.expires = -1
            container.expires = containerInstance.expires
            await container.save()                              // Saves the new expire time
        } else {
            // Otherwise, create a new document in the DB for the container
            container = await Containers.create({
                uid: user.uid,                                  // Saves the User's ID
                containerID: containerInstance.id,              // Saves the container ID
                lessonPath: containerInstance.path,             // Saves the lesson path
                expires: -1                                     // Saves a placeholder for the time
            })
        }

        socket.emit('stdout', 'Connected.\r\n')

        // This is called whenever the CLI on the container emits STDOUT/STDERR
        containerInstance.tty.onData((data) => {
            socket.emit('stdout', data)                         // Sends it to the client
        })
        
        // This is called whenever the client sends data to the container instance via STDIN
        socket.on('stdin', (data) => {
            containerInstance.tty.write(data)                   // Sends it to the container
        })
    
        // TODO: Fix issue where disconnect handler is not fired because it is not registered yet (out of scope)
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
