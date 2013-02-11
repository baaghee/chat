
/**
 * Module dependencies.
 */

var express = require('express')
  , domain = require('domain')
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
  , connectDomain = require('connect-domain')
  , _ = require('underscore')
  , jade_browser = require('jade-browser')


require('date-utils');

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
	callbackURL: settings.cb
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
				user.tokenSecret = tokenSecret;
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
	//app.use(connectDomain());
	app.use(express.favicon());
	app.use(express.logger('dev'));
	app.use(express.cookieParser("a"));
	app.use(express.bodyParser());
	app.use(express.methodOverride());
	app.use(jade_browser('/templates.js', '**', {root: __dirname + '/views/components', cache:false}));	
	app.use(express.session({ secret: "a", store: sessionStore, cookie: { maxAge: 1000 * 60 * 60 * 7 * 1000 ,httpOnly: false, secure: false}}));
	app.use(function(req, res, next){
  		app.locals.session = req.session;
  		next();
	});	
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
		//return console.log(io.of('/chat').clients())
		/*
			1 - get friends who i have enabled chat
			2 - 
		*/
		check(req, function(twit){
			var d = domain.create();
			d.run(function(){
				var id = req.session.passport.user;
				syncFriends(id, function(err, data){
					if(err) throw err;
					//find whats more in length
					
					//update friends
					User.update({_id:id}, {$set:{twitter:{friends:data}}});
					
					if(!data){
						throw Error("Data not fetch");
					}
					var common = [];
					for(var i=0; i<data.length; i++){
						if(registered_ids.indexOf(data[i]) !== -1){
							common.push(data[i]);
						}
					}
					for(var i=0; i< (data.length < 10 ?  data.length: 10); i++){
							common.push(data[i]);
					}
					if(common.length == 0){
						//end request
						return res.json({});
					}
					
					registeredFriends(id, false, function(err, friends){
						if(err) throw err;
						var send;
						var online = io.of('/chat').clients();
						
						//get online friends
						send = _.map(friends, function(e){
							return {
								id:e._id,
								online: typeof  _.find(online,function(o){ return o.handshake.user.id == e._id }) == "object" ? "yes" : "no",
								pic:e.raw.profile_image_url,
								name:e.username
							};
						});
						res.json(send);
					});
					
					/*twit.lookupUsers(common, function(err, data){

					});*/
				});
			});
			d.on('error', function(err){
				console.log(err);
				res.end("something happened");
			});
		});

});

function syncFriends(id, fn){
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
		
		//check 5min sync
		
		if(user.last_sync){
			var date = new Date(user.last_sync);
			console.log(date.getMinutesBetween(new Date()));
			if(date.getMinutesBetween(new Date())< 5000){
				return fn(null, user.friends);
			}
		}
		
		twit.getFriendsIds(id, function(err, friends){
			user.friends = friends;
			user.last_sync = new Date();
			user.save(function(err){
				return fn(null, user.friends);
			});
		});
	});

}

function registeredFriends(id, simple, fn){
	User.findOne({_id:id}, function(err,user){
		if(err) throw err;
		if(!user.friends || user.friends.length == 0){
			return fn(null, []);
		}
		if(simple){
			return fn(null, user.friends);	
		}
		User.find({_id:{$in:user.friends}}, function(err, friends){
			if(err) throw err;
			fn(null, friends);
		});
	});
}

// socket io
var chat = io.of('/chat').on('connection', function(socket){
	var id = socket.handshake.user._id;
	//set socket
	socket.set("_id", id);
	
	//send all online friends online msg
	//TODO: right now all the friend are being looped. Change this to 
	//friends who the client already have allowed
	
	registeredFriends(id, true, function(err, friends){
		friends.forEach(function(friend){
			chat.clients().forEach(function(online){
				if(online.handshake.user._id == friend){
					online.emit("presence", {status:"online", id:id});
				}
			});
		});
	});
	socket.on('disconnect', function(){
		registeredFriends(id, true, function(err, friends){
			friends.forEach(function(friend){
				chat.clients().forEach(function(online){
					if(online.handshake.user._id == friend){
						online.emit("presence", {status:"offline", id:id});
					}
				});
			});
		});		
	});
	socket.on('message', function(data){
		var user = JSON.parse(JSON.stringify(socket.handshake.user));
		var f = formated_data = {
			msg:data.msg,
			user:{
				name:user.username,
				id:user._id,
				photo:user.raw.profile_image_url
			}
		};
		//find user
		var users = chat.clients();
		
		socket.emit('incoming', f);
		
		//send to recipient
		for(var i=0; i<users.length;i++){
			
			if(users[i].handshake.user._id == parseInt(data.to)){
				users[i].emit('incoming', f);
				break;
			}
			
		}
		
		
		
		//socket.emit('incoming', socket.handshake);
	});
});

chat.on('disconnect', function(socket){
	console.log('eere');
});



server.listen(5002);
