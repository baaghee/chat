
/**
 * Module dependencies.
 */

var express = require('express')
  , app = express()
  , routes = require('./routes')
  , twitter = require('ntwitter')
  , user = require('./routes/user')
  , http = require('http')
  , path = require('path')
  , passport = require('passport')
  , TwitterStrategy = require('passport-twitter').Strategy
  , MongoStore = require('connect-mongo')(express)
  , server = require('http').createServer(app)
  , io = require('socket.io')
  , io = io.listen(server)
  , passportSocketIo = require("passport.socketio")

//session
var sessionStore = new MongoStore({db:'chat'});

//settings
io.set("authorization", passportSocketIo.authorize({
	sessionKey:    'connect.sid',      //the cookie where express (or connect) stores its session id.
	sessionStore:  sessionStore,     //the session store that express uses
	sessionSecret: "a", //the session secret to parse the cookie
	fail: function(data, accept) {     // *optional* callbacks on success or fail
		accept(null, false);             // second param takes boolean on whether or not to allow handshake
	},
	success: function(data, accept) {
		accept(null, true);
	}
}));
io.set("authorization-", function(){
	console.log(arguments);
});

settings = require('./settings');

//DB
mongoose = require('mongoose');
db = mongoose.createConnection('localhost', 'chat');

//User
var User = require('./lib/User');

var registered_ids = [];

User.find({}, {_id:1}, function(err, users){
	users.forEach(function(e){
		registered_ids.push(e._id);
	});
});

passport.use(new TwitterStrategy({
	consumerKey: settings.consumerKey,
	consumerSecret: settings.consumerSecret,
	callbackURL: "http://localhost:5002/auth/twitter/callback"
	},
	function(token, tokenSecret, profile, done) {
		// register user if not registered
		User.findOne({_id:profile.id}, function(err, user){
			if(!user){
				new User({
					_id:profile.id
				  , username: profile.username
				  , displayName: profile.displayName
				  , photos: profile.photos
				  , raw : profile._json
				  , token: token
				  , tokenSecret: tokenSecret
				})
				.save(function(err, user){
					if(err) throw err;
					registered_ids.push(profile.id);
					done(null, user);
				});
			}else{
				// update user
				user.username =  profile.username;
				user.displayName = profile.displayName;
				user.photos = profile.photos;
				user.raw = profile._json;
				user.token = token;
				user.tokenSecret = profile.tokenSecret;
				user.save(function(err, user){
					if(err) throw err;
					done(null, user);
				});
			}
		});
	}
));

passport.serializeUser(function(user, done) {
  done(null, user._id);
});

passport.deserializeUser(function(id, done) {
  User.findOne({_id:id}, function(err, user){
  	done(err, user);
  });
});

//common

function check(req, fn){
	var id = req.session.passport.user;
	User.findOne({_id:id}, function(err,user){
		if(err) throw(err);
		if(!user){
			//todo: loggined user doesn't exist, do something
		}
		//get token and consumer keys
		var twit = new twitter({
			consumer_key: settings.consumerKey,
			consumer_secret: settings.consumerSecret,
			access_token_key: user.token,
			access_token_secret: user.tokenSecret
		});
		fn(twit);
	});
}

app.configure(function(){
	app.set('port', process.env.PORT || 5002);
	app.set('views', __dirname + '/views');
	app.set('view engine', 'jade');
	app.use(express.favicon());
	app.use(express.logger('dev'));
	app.use(express.cookieParser("a"));
	app.use(express.bodyParser());
	app.use(express.methodOverride());
	app.use(express.session({ secret: "a", store: sessionStore, cookie: { maxAge: 1000 * 60 * 60 * 7 * 1000 ,httpOnly: false, secure: false}}));
	app.use(passport.initialize());
	app.use(passport.session());
	app.use(app.router);
	app.use(require('stylus').middleware(__dirname + '/public'));
	app.use(express.static(path.join(__dirname, 'public')));
});

app.configure('development', function(){
	app.use(express.errorHandler());
});

app.get('/', function(req, res){
	if (req.isAuthenticated()) {
		res.render('main');
	}else{
		res.render('index');
	}
});
app.get('/auth/twitter', passport.authenticate('twitter'));
app.get('/auth/twitter/callback', 
  passport.authenticate('twitter', { successRedirect: '/',
                                     failureRedirect: '/login' }));
app.get('/following', function(req,res){
	check(req, function(twit){
		twit.mentionsTimeline({trim_user: false}, function(err, data){
			res.json(data);    
		});
	});
});
app.get('/logout', function(req, res){
	req.logout();
	res.redirect('/');
});
app.get('/friends-on-chat', function(req,res){
	check(req, function(twit){
		twit.getFriendsIds(req.session.passport.user, function(err, data){
			//find whats more in length
			var common = [];
			for(var i=0; i<data.length; i++){
				if(registered_ids.indexOf(data[i]) !== -1){
					common.push(data[i]);
				}
			}
			twit.lookupUsers(common, function(err, data){
				if(err) throw err;
				res.json(data);
			});
		});
	});
});

// socket io

io.of('/chat').on('connection', function(socket){
	//console.log(socket.handshake.headers);
});


server.listen(5002);
