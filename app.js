
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
  , redis = require('redis')
  , client = redis.createClient()
  , RedisStore = require('socket.io/lib/stores/redis')

io.set('store', new RedisStore({
  redisPub : redis.createClient()
, redisSub : redis.createClient()
, redisClient : redis.createClient()
}));

var lookup = require("./lib/Lookup");

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

//Message
var Message = require('./lib/Message');

passport.use(new TwitterStrategy({
	consumerKey: settings.consumerKey,
	consumerSecret: settings.consumerSecret,
	callbackURL: settings.cb
	},
	function(token, tokenSecret, profile, done) {
		// register user if not registered
		User.findOne({_id:profile.id}, function(err, user){
			var r_ids = registered_ids;
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
					lookup.add(profile.id);
					
					//get users friends and add them to db
					syncFriends(profile.id, function(){
						done(null, user);
					});
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
app.get('/friends-on-chat', authenticate, function(req, res){
	var id = req.session.passport.user;
	
	//get my friends who are registered
	myFriendships(id, false, function(err, friendships){
		//check online friends
		var ids = [];
		for(var i=0; i<friendships.length; i++){
			ids.push(friendships[i].id);
		}
		var random_set  = 'friends:' + id + ":" + (Math.random() * 150000 +1 << .1);
		client.sadd(random_set, ids, function(){
			//get online friends
			client.sinter(random_set, "connected", function(err, online){
				
				//filter online friends
				client.hgetall("offlinemsg:" + id, function(err, data){
					var online_friends = [];
					for(var i=0; i<friendships.length; i++){
						var offline_msg = 0;
						if(data != null){
							offline_msg = friendships[i].id in data ? data[friendships[i].id] : 0;
						}
						if(online.indexOf(friendships[i].id) != -1){
							online_friends.push({
								offline_count: offline_msg,
								id: friendships[i].id,
								screen_name: friendships[i].screen_name,
								profile_image_url: friendships[i].profile_image_url,
								status:'online'
							});
						}else{
							online_friends.push({
								offline_count: offline_msg,
								id: friendships[i].id,
								screen_name: friendships[i].screen_name,
								profile_image_url: friendships[i].profile_image_url,
								status:'offline'
							});							
						}
					}
					res.json(online_friends);
				});
			});
		})
	});
});

//DEPRECATED
app.get('/friends-on-chats', authenticate, function(req,res){
		return res.end();
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
					var r_ids = registered_ids;
					for(var i=0; i<data.length; i++){
						if(r_ids.indexOf(data[i]) !== -1){
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
					
					myFriendships(id, false, function(err, friends){
						if(err) throw err;
						var send;
						var online = io.of('/chat').clients();
						
						//get offline messages count
						var id = req.session.passport.user;
						client.hgetall("offlinemsg:" + id, function(err, data){
							if(err) throw err;
							//get online friends
							send = _.map(friends, function(e){
								var offline_msg = 0;
								if(data != null){
									offline_msg = e.id in data ? data[e.id] : 0;
								}
								return {
									id:e._id,
									online: typeof  _.find(online,function(o){ return o.handshake.user.id == e._id }) == "object" ? "yes" : "no",
									pic:e.raw.profile_image_url,
									name:e.username,
									offline_count: offline_msg
								};
							});
							res.json(send);
						});

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
app.get('/tweeps-to-invite', authenticate, function(req, res){
	check(req, function(twit){
		var d = domain.create();
		d.run(function(){
			User.findOne({_id:req.session.passport.user},{friends:1, uninvited_friends:1, request_friends:1, friendships:1}, function(err, doc){
				if(doc.uninvited_friends.length > 1){
					return res.json(doc.uninvited_friends);
				}
				var friends = doc.friends;
				//random select 25 users for twitter lookup
				var random_list = [];
				var random_lookup = {};
	
				if(friends.length <= 25){
					random_list = friends;
				}else{
					for(var i=1; i<=25; i++){
						random_lookup[friends[(Math.random() * friends.length+1) << .1]] = 1;
					}
					for(var i in random_lookup){
						random_list.push(i);
					}					
				}
				twit.lookupUsers(random_list, function(err, data){
					var send = _.map(data, function(e){
						return {
							screen_name:e.screen_name,
							id:e.id_str,
							profile_image_url:e.profile_image_url,
							invited:false
						}
					});
					doc.uninvited_friends.concat(send);
					User.update({
						_id:req.session.passport.user,
					},{
						$addToSet:{uninvited_friends: {$each: send}}
					}, function(err, doc){});

					//get my friends on chat
					lookup.intersect(friends, function(err, data){
						getUserProfiles(data, doc.request_friends, function(err, data){
							res.json(data);
						});
					});
		
				});
			});
		});
	});

});
app.get('/friends-not-added', authenticate, function(req,res){
	check(req, function(twit){
		var d = domain.create();
		d.run(function(){
			User.findOne({_id:req.session.passport.user},{friends:1, uninvited_friends:1, request_friends:1, friendships:1}, function(err, doc){
				if(err) throw err;
				var friends = doc.friends;
				
				//remove friended people from friends when iterating 
				for(var f=0; f<doc.friendships.length; f++){
					var item = doc.friendships[f].id;
					if(friends.indexOf(item) != -1){
						friends.splice(friends.indexOf(item));
					}
				}
				
				if(doc.uninvited_friends.length > 1){
					//get friends who are registered in the app
					return lookup.intersect(friends, function(err, data){
						//get profiles of users
						getUserProfiles(data, doc.request_friends, function(err, data){
							console.log();
							res.json(data);
						});
					});
				}else{
					res.json([]);
				}
				
			});
			
		});
	});
});
app.get('/activity/messages/:id', authenticate, function(req,res){
	var to = req.params.id;
	var from = req.session.passport.user;
	Message.find({to:{$in:[to,from]},'from.id':{$in:[to,from]}})
	.sort({_id:1})
	.exec(function(err, docs){
		if(err) throw err;
		res.json(docs);
	});
});
app.get('/activity/offline-count', authenticate, function(req, res){
});
app.post('/activity/offline-read', authenticate, function(req, res){
	client.hdel("offlinemsg:" + req.session.passport.user, req.body.id, redis.print);
	res.end();
	
	//TODO: it removes redis hash key but empty hash would remain in memory if not removed.
});
app.post('/create-friendship', authenticate, function(req, res){
	var friend = req.body.friend;
	//request
	User.findOne({_id:req.session.passport.user}, function(err, me){
		var details = {
			"id": me._id,
			"screen_name": me.raw.screen_name,
			"profile_image_url": me.raw.profile_image_url
		};
		User.update({_id:friend}, {$push:{request_friends:details}}, function(err){
			//find sockets of friend and send notification
			client.smembers('open_connections:' + friend, function(err, socket_ids){
				if(err) throw err;
				if(socket_ids == null){
					return;
				}
			});
			
			//TODO: meaningful res.end
			res.end();
		});
	});
	
});
app.post('/accept-friendship', authenticate, function(req,res){
	var friend = req.body.friend;
	
	//check if friend exists in my requests
	User.findOne({_id:req.session.passport.user, "request_friends.id":friend}, {raw:1,  request_friends:1}, function(err, me){
		if(err) throw err;
		if(typeof me != 'object'){
			return res.json({error:"unable to make friend request"});
		}
		
		/*make friendship*/
		
		var friendships = {
			me:{
				screen_name: me.raw.screen_name,
				profile_image_url:me.raw.profile_image_url,
				id:req.session.passport.user
			},
			friend:{}
		};
		//find friend details
		var request_friends = me.request_friends;
		for(var i=0; i<request_friends.length; i++){
			if(request_friends[i].id == friend){
				friendships.friend['screen_name'] = request_friends[i].screen_name;
				friendships.friend['id'] = request_friends[i].id;
				friendships.friend['profile_image_url'] = request_friends[i].profile_image_url;
				break;
			}
		}
		//console.log(friendships);process.exit();
		User.update({_id:req.session.passport.user},{$push:{friendships:friendships.friend}}, function(err){});
		User.update({_id:friend},{$push:{friendships:friendships.me}}, function(err){});
		User.update({_id:req.session.passport.user},{$pull:{"request_friends":{id:friend}}}, function(err){});
		res.end();
	});
});
//funcs
function authenticate(req,res,next){
  if (req.isAuthenticated()) { return next(); }
 	 return res.json({error:"authentication failed"});
}
function getUserProfiles(array, request_friends, fn){
	//get requests ive made
	User.find({_id:{$in:array}}, {'raw':1}, function(err, docs){
		var arr=[];
		for(var i=0; i<docs.length; i++){
			var user = docs[i];
			
			//check if user has requested to chat
			var requested = false;
			for(var u=0; u<request_friends.length; u++){
				if(request_friends[u].id == user._id){
					requested = true;
					break;
				}
			}
			arr.push({
				id:user._id,
				screen_name:user.raw.screen_name,
				profile_image_url:user.raw.profile_image_url,
				requested:requested
			});
		}
		fn(null, arr);
	});
}


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

function myFriendships(id, simple, fn){
	User.findOne({_id:id}, {friendships:1}, function(err,user){
		if(err) throw err;
		if(!user.friendships || user.friendships.length == 0){
			return fn(null, []);
		}
		//take all ids of friendships
		var friendships = [];
		for(var i=0;i<user.friendships.length; i++){
			friendships.push(user.friendships[i].id);
		}
		
		if(simple){
			return fn(null, friendships);	
		}
		
		fn(null, user.friendships);
	});
}

// socket io
var chat = io.of('/chat').on('connection', function(socket){
	//add status to db	
	var id = socket.handshake.user._id;
	
	// add to open connections for client
	client.sadd('open_connections:' + id, socket.id, redis.print);
	
	//add to global presence list
	client.sadd('connected', id, redis.print);

	//set socket
	socket.set("_id", id);
	
	//send all online friends online msg
	//TODO: right now all the friend are being looped. Change this to 
	//friends who the client already have allowed
	
	myFriendships(id, true, function(err, friends){
		friends.forEach(function(friend){
			chat.clients().forEach(function(online){
				if(online.handshake.user._id == friend){
					online.emit("presence", {status:"online", id:id});
				}
			});
		});
	});
	socket.on('disconnect', function(){
	
		//remove connection label from redis
		client.srem('open_connections:' + id, socket.id, redis.print);
		client.exists('open_connections:' + id, function(err, exist){
			if(exist == 0){
				client.srem("connected", id, redis.print);
			}
		});		
		
		myFriendships(id, true, function(err, friends){
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
		var online = false;
		for(var i=0; i<users.length;i++){
			
			if(users[i].handshake.user._id == parseInt(data.to)){
				users[i].emit('incoming', f);
				online = true;
			}
			
		}
		//add to queue if offline and send as dm or tweet
		if(online == false){
			var queue_msg = {
				from:f.user.id,
				to:data.to,
				msg:data.msg
			};
			client.hincrby("offlinemsg:" + queue_msg.to, queue_msg.from, 1, redis.print);
		}
		//save to db
		console.log("saving");
		new Message({
			message:data.msg,
			from:{
				screen_name:user.username,
				id:user._id,
				photo:user.raw.profile_image_url
			},
			to:data.to,
			date: new Date()
		}).save(function(err){});
	});
});
//

var stream = io.of('/stream');
stream.on('connection', function(socket){
	var d = domain.create();
	d.run(function(){
		var user = socket.handshake.user;
		var twit = new twitter({
			consumer_key: settings.consumerKey,
			consumer_secret: settings.consumerSecret,
			access_token_key: user.token,
			access_token_secret: user.tokenSecret
		});
		twit.stream('user', {track:user.username}, function(str){
			str.on('data', function(data){
				//socket.emit('stream', data);
				//TODO: handle disconnects
			});
		});
	});
	d.on('error', function(err){
		console.log(err);
	});
});

chat.on('disconnect', function(socket){
	console.log('disconnected');
});



server.listen(5002);
