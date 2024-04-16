const mongoose = require('mongoose')


// mongoose.connect("mongodb+srv://Kuber:<password>@cluster0.jzyvizy.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0")
// .then(function(){
//   console.log("connected to db");
// })

const plm = require('passport-local-mongoose')
const userSchema  = mongoose.Schema({
    username: String,
    email: String,
    contact: String,
    playlist: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'playlist'
    }],
    liked: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'song'
    }],
    profileImage:{
        type:String,
        default:'../images/def.png'
    },
    isAdmin:{
        type:Boolean,
        default: false
    }

})
userSchema.plugin(plm)

const userModel = mongoose.model('user', userSchema)

module.exports = userModel