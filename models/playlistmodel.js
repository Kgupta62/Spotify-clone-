const mongoose = require('mongoose')

const playlistSchema = mongoose.Schema({
    name: {
        type: String,
        required: true
    },
    owner:{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'user',
        required: true
    },
    poster: {
        type: String,
        default: '../images/music.png'
    },
    songs: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'song'
    }]
})

const playlistModel = mongoose.model('playlist', playlistSchema)
module.exports = playlistModel