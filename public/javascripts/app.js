var socket = io.connect('/chat');

socket.on('incoming', function(data){
	var html = '<div class="media chat-item"><div class="chat-bubble-arrow"></div><a href="#" class="pull-left"><img data-src="holder.js/64x64" class="media-object"></a><div class="media"><a href="#" class="pull-left"><img data-src="holder.js/64x64" alt="64x64" src="'+data.user.photo+'" class="media-object"></a></div><div class="media-body"><a href="#" class="media-heading">'+data.user.name+'</a><br><p>'+data.msg+'</p></div></div>';
	$("#chat-window-container").append(html);
	console.log(data);
	if(typeof _data.chats[data.user.id] == 'undefined'){
		_data.chats[data.user.id] = [];
	}
	_data.chats[data.user.id].push(html);
});
socket.on('presence', function(presence){
	console.log(presence);
	$("#list-presence-" + presence.id).text(presence.status);
});

var data = _data =  {
	current:null,
	chats:{}
};

$(function(){
	$("#chat-input-field").on('keyup', function(e){
		if(e.keyCode == 13){
			var val = $(this).text();
			$(this).text('');
			socket.emit('message', {msg:val, to:data.current});
		}
	});
	$.getJSON('/friends-on-chat', function(res){
		$("#contact-container").html("");
		res.forEach(function(e){
			$("#contact-container").append('<div id="list-'+e.id+'" data-id="'+e.id+'" data-name="'+e.name+'" class="media user-list-item"><a href="#" class="user-invisible-link pull-left"><img data-src="holder.js/64x64" class="media-object"></a><div class="media"><a href="#" class="pull-left"><img data-src="holder.js/64x64" alt="64x64" style="width: 64px; height: 64px;" src="'+e.pic+'" class="media-object"></a></div><div class="media-body"><a href="#" class="media-heading">'+e.name+'</a><br><span id="list-presence-'+e.id+'">'+(e.online == "yes" ? "online": "")+'</span></div><br class="clear"></div>');
		});
	});
	$("body").on("click", ".user-list-item", function(){
		$("#chat-window-container").html('');
		
		data.current = $(this).attr('data-id');
		$("#chat-window-header h3").text($(this).attr('data-name'));
		
		//see if existing chat exists
		
		//display chat if found
		if(typeof data.chats[data.current] != 'undefined'){
			data.chats[data.current].forEach(function(msg){
				$("#chat-window-container").append(msg);
			});
		}
		
		//create new one if not
	});
});
