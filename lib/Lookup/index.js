var redis = require('redis')
var client = redis.createClient();

module.exports = {
	random:function(fn){
		client.srandmember("users", fn);
	},
	add:function(id){
		client.sadd("users", id)
	},
	intersect:function(arr, fn){
		var rand = parseInt(new Date().getTime() + ((Math.random()*5000000 + 1) << .1));

		//create new set and add user friends to it
		client.sadd(rand, arr, function(){
			client.sinter("users", rand, function(err, data){
				if(err) throw err;
				fn(null, data);
				//remove temp set
				client.del(rand);
			});		
		});
	}
}
