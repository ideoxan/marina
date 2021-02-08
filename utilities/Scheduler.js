const mongoose = require( "mongoose" )

class Scheduler {
    constructor(mongoURI, collectionName='_scheduler') {
        mongoose.connect(mongoURI, {
            useNewUrlParser: true,                      // Required
            useUnifiedTopology: true                    // Required
        })
        this.collectionName = collectionName
        
        this._tasks = mongoose.model(collectionName, new mongoose.Schema({
            name: {
                type: String,
                required: true
            },
            date: {
                type: Date,
                required: true
            },
            handler: {
                type: Object,
                required: true
            }
        }))

        this.pollingInterval = 1000
        this._poller = setInterval(() => {}, this.pollingInterval)
    }

    async createTask(name, date, handler) {
        await this._tasks.create({
            name: 'name',
            date: date,
            handler: {
                fn: handler
            }
        })
    }

    startPolling() {
        this._poller = setInterval(() => {}, this.pollingInterval)
    }

    stopPolling() {
        clearInterval(this._poller)
    }

    _pollFn() {

    }
}

module.exports = Scheduler