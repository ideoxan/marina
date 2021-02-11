const mongoose = require('mongoose')

const ContainerSchema = new mongoose.Schema({ 
    uid: {
        type: String,
        required: true
    },
    containerID: {
        type: String,
        required: true
    },
    lessonPath: {
        type: String,
        required: true
    },
    expires: {
        type: Number,
        required: true,
        default: -1
    },
    socketID: {
        type: String,
        required: true
    }
})

module.exports = mongoose.model('containers', ContainerSchema)