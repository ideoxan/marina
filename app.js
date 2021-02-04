const express = require('express')



const app = express()

app.use('/modules/', express.static('./node_modules'))



app.get('/', (req, res) => {
    res.sendFile(__dirname + '/views/terminal.html')
})

app.listen(3080, ()=> {
    console.log('Server Online')
})