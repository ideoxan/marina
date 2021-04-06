
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
const mongoose                  = require('mongoose')
const Containers                = require('./models/Containers')

/* --------------------------------------- Task Scheduler --------------------------------------- */
const MSM                       = require('mongo-scheduler-more')

/* -------------------------------------- Execution And TTY ------------------------------------- */
const util                      = require('util')
const exec                      = util.promisify(require('child_process').exec)
const pty                       = require('node-pty')

/* ------------------------------------------ Utilities ----------------------------------------- */
const { v4: uuidv4 }            = require('uuid')
const os                        = require('os')
const chalk                     = require('chalk')
const {generateSlug}              = require('random-word-slugs')



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

/* ------------------------------------- Server Online Alert ------------------------------------ */
console.log('Marina Docker Online')

/* ------------------------------------ Connection Variables -------------------------------- */
// These are just some constants that persist the connection (useful for stuff like the database
// collection name or the lifetime of all containers)
const constants = {
    containerCollection: 'containers',                      // Name of the DB collection
    taskNamePrefix: 'clean-container-',                     // Prefix for container task names
    containerLifetime: /* 60*60* */1000,                          // The max lifetime of a container
    maxMem: 32,                                             // Maximum allocated memory (in MB)
    maxCPUPercent: 1                                        // Maximum CPU usage
}



/* ---------------------------------------------------------------------------------------------- */
/*                                     WEBSOCKET SEVER HANDLER                                    */
/* ---------------------------------------------------------------------------------------------- */
// The connection event is fired each time someone connects to the WS sever
io.on('connection', async (socket) => {
    
    // Basic information used to identify containers. Set upon initialization 
    let containerInstance = {
        id: null,                                               // The ID (short hash)
        tty: null,                                              // TTY interface (see node-pty)
        expires: -1,                                            // Lifetime expiry date
        path: '',                                               // The lesson path used
        type: 'nodejs',
        name: ''
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
        
        // Informs the client via the terminal that the instance is being built
        socket.emit('stdinfo', formatSysMessage('Building Sandbox Instance...'))

        // Builds the appropriate image for the current lesson
        await buildLessonImage(socket, containerInstance.type)

        // Informs the client via the terminal that the sandbox container is being set up
        socket.emit('stdinfo', formatSysMessage('Spawning Sandbox Instance...'))

        // Attempts to find if there is a container already assigned to this user
        let container = await Containers.findOne({uid: user.uid}) || null

        if (container && container.name) containerInstance.name = container.name
            else containerInstance.name = generateSlug(3, { format: 'kebab' })

        containerInstance.id = await spawnContainer(socket, container, containerInstance)
        if (container && container.containerID !== containerInstance.id) {
            try {
                await exec(`docker stop -t 0 ${container.containerID}`)
            } catch (err) {
                console.log('Error upon stopping container. Sustaining.')
            }
            // Removes the docker container
            try {await exec(`docker rm ${container.containerID}`)}catch(err){}
            // Deletes the entry in the database
            Containers.deleteOne({containerID: container.containerID}, (err) => {
                if (err) console.log(err)
            })
            container = null
        }

        // Start connecting to the container instance
        socket.emit('stdinfo', formatSysMessage('Connecting to sandbox instance...'))
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
            container.socketID = socket.id
            await container.save()                              // Saves the new data
        } else {
            // Otherwise, create a new document in the DB for the container
            container = await Containers.create({
                uid: user.uid,                                  // Saves the User's ID
                containerID: containerInstance.id,              // Saves the container ID
                lessonPath: containerInstance.path,             // Saves the lesson path
                socketID: socket.id                             // Saves the socket id
            })
        }

        socket.emit('stdinfo', formatSysMessage('Connected.') + '\r\n')

        // This is called whenever the CLI on the container emits STDOUT/STDERR
        containerInstance.tty.onData(_stdout(socket))           // Sends it to the client
        
        // This is called whenever the client sends data to the container instance via STDIN
        socket.on('stdin', _stdin(containerInstance.tty))       // Sends it to the container
    
        // This is called whenever the client disconnects. This can be the result of a forceful
        // disconnection from the server (via a socket#disconnect call), a disconnect call fired
        // manually from the client, a failure to respond to sequential heartbeats, a network
        // error, a timeout, a change in connection, etc.
        // TODO: Fix issue where disconnect handler is not fired because it is not registered yet (out of scope)
        socket.on('disconnect', async (reason) => {
            // Stops the docker instance immediately. It will gracefully shutdown using SIGTERM but
            // after a grace period (default of 10 seconds) it will send SIGKILL which will
            // forcefully terminate the process
            try {
                await exec(`docker stop -t 0 ${containerInstance.id}`)
            } catch (err) {
                console.log('Error upon stopping container. Sustaining.')
            }
            
            // Sets the expire time of the container to the time now plus the lifetime of the
            // container (default: 60 minutes or 60*60*1000 ms)
            containerInstance.expires = Date.now() + constants.containerLifetime
            container.expires = containerInstance.expires
            await container.save()                              // Saves the new changes to the DB
            // Creates a new task to delete both the database instance and the container
            await scheduler.schedule({
                // Sets the task name to the prefix and the container ID
                name: constants.taskNamePrefix + containerInstance.id,
                after: new Date(containerInstance.expires),     // Sets the date to the expire date
                collection: constants.containerCollection,      // Sets the collection
                query: {
                    expires: {$gt: -1}                          // Only queries inactive containers
                },
                data: {}                                        // ?: one singular task w/ id?
            })
    
            // Kills the TTY interface (should be done first but luckily node-pty handles it nicely)
            containerInstance.tty.kill()
    
            // Fired when the task activates
            scheduler.on(constants.taskNamePrefix + containerInstance.id, await removeContainer(containerInstance)) 
        })
    })
})

async function buildLessonImage (socket, name) {
    // Starts to build the image
    await exec(`docker build --tag marina-${name}:latest -f ./sources/marina-${name}/Dockerfile ./sources/marina-${name}`)
}

async function spawnContainer(socket, container, containerInstance) {
    let id
    if (container) {
        try {
            // Grabs the ID of the container from the output
            id = await startOldContainer(socket, container)
        } catch (err) {
            console.log(err)
            try {
                id = await spawnNewContainer(containerInstance)
            } catch (err) {
                console.log(err)
            }
        }
    } else {
        try {
            // Grabs the ID of the container from the output
            id = await spawnNewContainer(containerInstance)
        } catch (err) {
            console.log(err)
        }
    }
    return id
}

async function spawnNewContainer (containerInstance) {
    let id
    let image = containerInstance.type
    let name = containerInstance.name
    let runCommand
    let maxMem = constants.maxMem
    let maxCPU = constants.maxCPUPercent * os.cpus().length
    try {
        // Otherwise, just start a new container with the marina-docker base image
        // TODO: use paths to create new images
        await exec(`docker volume create ${name}`)

        runCommand = await exec(`docker create -t -m ${maxMem}m --cpus=${maxCPU} -v ${name}:/home/user/lesson --name ${name} marina-${image}:latest`)
        id = runCommand.stdout.toString().substring(0, 12)
        await exec(`docker start ${id}`)
        return id
    } catch (err) {
        console.log(err.stderr)
        throw new Error('Error upon spawning new container. Sustaining.')
    }
}

async function startOldContainer (socket, oldContainer) {
    let runCommand
    try {
        if (oldContainer.socketID != socket.id) {
            io.to(oldContainer.socketID).emit('new-session', '\r\n\r\n' +
                formatSysMessage('New Session Connected. Disconnecting')
            )
        }
        // If the container exists, just start it using it's ID
        runCommand = await exec(`docker start ${oldContainer.containerID}`)
        scheduler.remove({name: constants.taskNamePrefix + oldContainer.containerID})
        return runCommand.stdout.toString().substring(0, 12)
    } catch (err) {
        console.log(err.stderr)
        throw new Error('Error upon starting old container. Persisting.')
    }
}


// Removes the given container
async function removeContainer (containerInstance) {
    return async function (event, doc) {
        try {
            let id = containerInstance.id
            let name = containerInstance.name
            // Removes the docker container
            await exec(`docker rm ${id}`)
            // Deletes the entry in the database
            Containers.deleteOne({containerID: id}, (err) => {
                if (err) console.log(err)
            })
            // Removes the docker volume associated with the container
            await exec(`docker volume rm ${name}`)
        } catch (err) {
            console.log('Error upon removing container. Sustaining.')
        }
        
    }
}

// STDIN to terminal (from client)
function _stdin(term) {
    return function (data) {
        term.write(data)
    }
}

// STDOUT to client (from terminal)
function _stdout(socket) {
    return function (data) {
        socket.emit('stdout', data)
    }
}

function formatSysMessage(msg) {
    return chalk.hex('#7C3AED')('[SYSTEM]') + chalk.hex('#aaa')(` ${msg}\r\n`)
}
