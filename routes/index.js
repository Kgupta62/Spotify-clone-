const express = require('express');
const router = express.Router();
const passport = require('passport');
const users = require('../models/usermodel');
const songModel = require('../models/songmodel');
const playlistModel = require('../models/playlistmodel');
const mongoose = require('mongoose');
const multer = require('multer');
const id3 = require('node-id3');
const { Readable } = require('stream');
const crypto = require('crypto');
const userModel = require('../models/usermodel');
const path = require('path');
const nodemailer = require('nodemailer');

// Database connection
const DB = 'mongodb+srv://Kuber:Kuber8821@cluster0.imtvjd4.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';
mongoose.connect(DB)
    .then(() => console.log('Connection successful'))
    .catch((err) => console.log('Connection error:', err));

// Passport local strategy
const localStrategy = require("passport-local");
passport.use(new localStrategy(users.authenticate()));

// Middleware to check if user is logged in
function isloggedIn(req, res, next) {
    if (req.isAuthenticated()) {
        return next();
    } else {
        res.redirect('/auth');
    }
}

// Error handling middleware
router.use((err, req, res, next) => {
    console.error('Error occurred:', err);
    req.session.alert = 'An error occurred. Please try again.';
    res.redirect('back');
});

/* GET home page. */
router.get('/', isloggedIn, async function (req, res, next) {
    try {
        // Populate the current user with playlists and songs
        const currentUser = await userModel.findOne({ _id: req.user._id })
            .populate({
                path: 'playlist',
                populate: { path: 'songs', model: 'song' }
            });

        // Fetch all songs from the database
        const allSongs = await songModel.find();
        const playlists = currentUser.playlist.filter(playlist => playlist.owner.equals(currentUser._id));
        // Render the index page with currentUser, all songs, and other relevant data
        res.render('index', { currentUser, playlists, allSongs });
    } catch (error) {
        console.error('Error fetching user data:', error);
        req.session.alert = 'An error occurred while fetching user data. Please try again.';
        res.redirect('back');
    }
});

// Registration route
router.get('/auth', function (req, res, next) {
    res.render('register');
});

router.get('/test-error', (req, res, next) => {
  next(new Error('This is a test error'));
});


router.post('/register', async (req, res, next) => {
    try {
        const newUser = {
            username: req.body.username,
            email: req.body.email,
            contact: req.body.contact
        };

        // Check if the user already exists
        const existingUser = await userModel.findOne({ username: newUser.username });
        if (existingUser) {
            req.session.alert = 'User already exists. Please login.';
            return res.redirect('/auth');
        }

        // Register the new user
        users.register(newUser, req.body.password, async (err, user) => {
            if (err) {
                console.error('Error registering user:', err);
                req.session.alert = 'Error registering user';
                return res.redirect('/auth');
            }

            passport.authenticate('local')(req, res, async () => {
                const songs = await songModel.find();
                const defaultPlaylist = await playlistModel.create({
                    name: 'default',
                    owner: req.user._id,
                    songs: songs.map(song => song._id)
                });
                const updatedUser = await userModel.findOneAndUpdate(
                    { _id: req.user._id },
                    { $push: { playlist: defaultPlaylist._id } },
                    { new: true }
                );
                res.redirect('/');
            });
        });
    } catch (error) {
        console.error('Error registering user:', error);
        req.session.alert = 'Error registering user';
        res.redirect('/auth');
    }
});

router.post('/login', (req, res, next) => {
    passport.authenticate('local', (err, user, info) => {
        if (err) {
            console.error('Error during authentication:', err);
            req.session.alert = 'An error occurred during login. Please try again.';
            return res.redirect('/login');
        }
        if (!user) {
            req.session.alert = 'Wrong credentials. Please try again.';
            return res.redirect('/login');
        }
        req.logIn(user, (err) => {
            if (err) {
                console.error('Error during login:', err);
                req.session.alert = 'An error occurred during login. Please try again.';
                return res.redirect('/login');
            }
            return res.redirect('/');
        });
    })(req, res, next);
});

// Logout route
router.get('/logout', (req, res, next) => {
    if (req.isAuthenticated()) {
        req.logout((err) => {
            if (err) {
                console.error('Error during logout:', err);
                req.session.alert = 'An error occurred during logout. Please try again.';
            }
            res.redirect('/auth');
        });
    } else {
        res.redirect('/auth');
    }
});


function isloggedIn(req, res, next) {
  if (req.isAuthenticated()) {
    return next();
  }
  else res.redirect('/auth');
}


function isAdmin(req,res,next){
  if(req.user.isAdmin){
    return next()
  } 
  else {
    return res.redirect('/')
}
}



router.get('/login',function(req,res,next){
  res.render('login')
})

router.get('/signup',function(req,res,next){
  res.render('register')
})

// uploadmusic-------------------------
const storage = multer.memoryStorage()
const upload = multer({ storage: storage })

const conn = mongoose.connection

var gfsBucket, gfsBucketPoster
conn.once('open', () => {
  gfsBucket = new mongoose.mongo.GridFSBucket(conn.db, {
    bucketName: 'audio'
  })
  gfsBucketPoster = new mongoose.mongo.GridFSBucket(conn.db, {
    bucketName: 'poster'
  })
})

const defaultImagePath = path.join(__dirname, '..', 'public', 'images', 'download.jpeg');

router.post('/uploadMusic', isloggedIn, isAdmin, upload.array('song'), async function (req, res, next) {
  try {
    await Promise.all(req.files.map(async (file) => {
      const randomName = crypto.randomBytes(20).toString('hex');

      let songData;
      try {
        songData = id3.read(file.buffer);
      } catch (error) {
        console.error('Error reading song data:', error);
        // Handle potential errors during ID3 tag reading (e.g., corrupted file)
        return; // Skip this file if reading fails
      }

      // Handle Missing Title and Artist Gracefully
      const title = songData.title ? songData.title : 'Song'; // Use 'Song' if title is missing
      const artist = songData.artist ? songData.artist : 'You'; // Use 'You' if artist is missing

      const hasImageData = songData.image && songData.image.imageBuffer;

      const posterStream = gfsBucketPoster.openUploadStream(randomName + 'poster');

      if (hasImageData) {
        Readable.from(songData.image.imageBuffer).pipe(posterStream);
      } else {
        try {
          const defaultImageBuffer = await fs.readFile(defaultImagePath);
          Readable.from(defaultImageBuffer).pipe(posterStream);
        } catch (error) {
          console.error('Error reading default image:', error);
          
          return; // Skip this file if reading fails
        }
      }

      const audioStream = gfsBucket.openUploadStream(randomName);
      Readable.from(file.buffer).pipe(audioStream);

      await songModel.create({
        title, 
        artist,
        album: songData.album,
        size: file.size,
        poster: hasImageData ? randomName + 'poster' : null,
        filename: randomName,
      });
    }));

    res.send('upload');
  } catch (error) {
    console.error('Unexpected error during upload:', error);
    
    res.status(500).send('Upload failed');
  }
});

router.get('/uploadMusic',isloggedIn,isAdmin, function(req,res,next){
  res.render('uploadMusic')
})

router.get('/poster/:posterName', (req, res, next) => {
  gfsBucketPoster.openDownloadStreamByName(req.params.posterName).pipe(res)
})


router.get('/stream/:musicName', async (req, res, next) => {
  const currentSong = await songModel.findOne({
    filename: req.params.musicName
  })
  // console.log(currentSong)
  const stream = gfsBucket.openDownloadStreamByName(req.params.musicName)
  res.set('Content-Type', 'audio/mpeg')
  res.set('Content-Length', currentSong.size + 1)
  res.set('Content-Range', `bytes 0-${currentSong.size - 1}/${currentSong.size}`)
  res.set('Content-Ranges', 'byte')
  res.status(206)
  stream.pipe(res)
})


router.get('/search', (req, res, next) => {
  res.render('search')
})

router.post('/search', async (req, res, next) => {
  // console.log(req.body)
  const searhedMusic = await songModel.find({
    title: { $regex: req.body.search }
  })

  res.json({
    songs: searhedMusic
  })

})


router.post('/like/:songId', isloggedIn ,async function(req,res,next){
  try{
    const{ songId} = req.params

    const currentUser = await userModel.findById(req.user._id)
    
    const alreadylikes = currentUser.liked.includes(songId)
    if(alreadylikes){
      
      currentUser.liked = currentUser.liked.filter(id => id.toString() !== songId)
    }else{
     
      currentUser.liked.push(songId)
    }
    await currentUser.save()
    res.redirect('back')
  }
  catch(err){
    console.error(err)
    res.status(500).json({success: false, message: 'error linking'})
  }
})

router.get('/likedsong', isloggedIn, async function(req, res, next) {
  try {
    const currentUser = await users.findById(req.user._id).populate('liked');
    if (!currentUser) {
      // User not found
      return res.status(404).render('error', { message: 'User not found' });
    }

    // Check if liked songs exist
    if (!currentUser.liked || currentUser.liked.length === 0) {
      return res.render('likedsong', { likedsong: [], currentUser }); // Pass an empty array for likedsong
    }

    res.render('likedsong', { likedsong: currentUser.liked, currentUser });
  } catch (err) {
    console.error(err);
    res.status(500).render('error', { message: 'Internal Server Error' });
  }
});



router.post('/createplaylist', isloggedIn , async(req,res,next)=>{
  try{
    const currentUser = await userModel.findById(req.user._id)
    const newplaylist = await playlistModel.create({
      name: req.body.name,
      owner: req.user._id
    })

    currentUser.playlist.push(newplaylist._id)
    await currentUser.save()

    res.redirect('/')
  }catch(err){
    console.error(err)
    res.status(500).send("error ")
  }
})

router.get('/playlist/:playlistId',isloggedIn, async(req,res,next)=>{
  
  try{
    const{playlistId} = req.params;
    // console.log("kuber");
    const playlist = await playlistModel.findById(playlistId).populate('songs');
    res.render('playlist' , {playlist});
  }catch(err){
    console.error(err)
    res.status(500).send("error")
  }
})


router.post('/playlist/:playlistId/addsong/:songId', isloggedIn, async function(req, res, next) {
  try {
    const { playlistId, songId } = req.params;

    // Check if the playlist with the given ID exists
    const playlist = await playlistModel.findById(playlistId);
    if (!playlist) {
      return res.status(404).send("Playlist not found");
    }

    // Check if the song with the given ID exists
    const song = await songModel.findById(songId);
    if (!song) {
      return res.status(404).send("Song not found");
    }

    // Check if the song already exists in the playlist
    if (playlist.songs.includes(songId)) {
      return res.status(400).send("Song already exists in the playlist");
    }

    // Add the song to the playlist and save
    playlist.songs.push(songId);
    await playlist.save();

    // Redirect to the playlist page
    res.redirect(`/playlist/${playlistId}`);
  } catch (err) {
    console.error(err);
    res.status(500).send("Error occurred while adding song to playlist");
  }
});



router.post('/playlist/:playlistId/removesong/:songId', isloggedIn,async function(req,res,next){
  try{
    const{playlistId, songId} = req.params
    const playlist = await playlistModel.findById(playlistId)
    playlist.songs = playlist.songs.filter(song=> !song.equals(songId))
    await playlist.save()
    res.redirect(`/playlist/${playlistId}`)
  }catch(err){
    console.error(err)
    res.status(500).send("error agaya...!")
  }
})


// Forgot Password Route
router.get('/forgot-password', (req, res) => {
  res.render('forget', { message: null });
});

router.post('/forgot', async (req, res) => {
  try {
      const { email } = req.body;
      
      // Check if user with this email exists
      const user = await userModel.findOne({ email });

      if (!user) {
          return res.render('forget', { message: 'User with this email does not exist' });
      }

      // Generate a random password reset token
      const resetToken = Math.random().toString(36).slice(-8);

      // Update user's reset token and expiration time
      user.resetPasswordToken = resetToken;
      user.resetPasswordExpires = Date.now() + 3600000; // 1 hour

      await user.save();

      // Send email with reset link
      const transporter = nodemailer.createTransport({
          service: 'gmail',
          auth: {
              user: 'kuber8821@gmail.com',
              pass: 'labf npll wsag tvop'
          }
      });

      const mailOptions = {
          from: 'kuber8821@gmail.com',
          to: email,
          subject: 'Password Reset Request',
          text: `You are receiving this because you (or someone else) have requested the reset of the password for your account.\n\n
                  Please click on the following link, or paste this into your browser to complete the process:\n\n
                  http://${req.headers.host}/reset/${resetToken}\n\n
                  If you did not request this, please ignore this email and your password will remain unchanged.\n`
      };

      transporter.sendMail(mailOptions, (error, info) => {
          if (error) {
              console.log(error);
          } else {
              console.log('Email sent: ' + info.response);
          }
      });

      res.render('forget', { message: 'Check your email for password reset instructions' });
  } catch (error) {
      console.error(error);
      res.status(500).send('Server Error');
  }
});

router.get('/profile', isloggedIn, async (req, res) => {
  try {
    const profiles = await userModel.findById(req.user._id)
      // const profiles = await userModel.find({});
      // console.log(profiles);
      res.render('profile',profiles);
  } catch (err) {
      res.status(500).send(err.message);
  }
});

router.get('/updateprofile', isloggedIn, async (req, res) => {
  try {
    const profiles = await userModel.findById(req.user._id)
      // const profiles = await userModel.find({});
      // console.log(profiles);
      res.render('updateprofile',profiles);
  } catch (err) {
      res.status(500).send(err.message);
  }
});

router.post('/updateprofile', isloggedIn, async (req, res) => {
  try {
      // Fetch the user's profile data
      const user = await userModel.findById(req.user._id);
      if (!user) {
          return res.status(404).send("User not found");
      }
      
      // Update user data with new values from the form
      user.username = req.body.username;
      user.email = req.body.email;
      user.contact = req.body.contact;
      // Add other fields as needed
      
      // Save the updated user data
      await user.save();

      // Redirect back to profile page
      res.redirect('/profile');
  } catch (err) {
      res.status(500).send(err.message);
  }
});


router.get('/contact', (req, res) => {
  res.render('contact');
});
router.get('/about', (req, res) => {
  res.render('about');
});



module.exports = router;
