const mongoose = require('mongoose')

const songSchema = mongoose.Schema({
    title: String,
    artist: String,
    album: String,
    category:[{
        type: String,
        enum:['punjabi','english']
    }],
    likes: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'user'
    }],
    size: Number,
    poster: String,
    filename: {
        type: String,
        // required: true
    }
})


const songModel = mongoose.model('song',songSchema)
module.exports = songModel