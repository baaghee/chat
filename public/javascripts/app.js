var socket = io.connect('/chat');

var data = _data =  {
	focused:true,
	unread_tick:0,
	unread_timer:null,
	unread:false,
	current:null,
	chats:{}
};

socket.on('incoming', function(data){
	var html = jade.render('message', data);
	console.log(data);
	if(typeof _data.chats[data.user.id] == 'undefined'){
		_data.chats[data.user.id] = [];
	}
	if(data.user.id == window.user){
		if(typeof _data.chats[_data.current]  == 'undefined'){
			_data.chats[_data.current] = [];
		}
		_data.chats[_data.current].push(html);
	}else{
		_data.chats[data.user.id].push(html);
	}
	//notify or display if window open
	console.log(_data.current, data.user.id);
	if(_data.focused == false){
		_data.unread = true;
		$(window).trigger("blur");
	}
	if(_data.current != data.user.id && data.user.id != window.user){
		$("#list-" + data.user.id).css("background", "red");
		return;
	}
	$("#chat-window-container").append(html);
	$("#chat-window-container").scrollTop($("#chat-window-container")[0].scrollHeight);
	//change title
	
});

socket.on('presence', function(presence){
	console.log(presence);
	$("#list-presence-" + presence.id).text(presence.status);
});



$(function(){
	$(window).on('blur', function(){
		data.focused = false;
		if(data.unread == true){
			data.unread_timer = setInterval(function(){
				if(data.unread_tick == 0){
					$("title").text("new message");
					data.unread_tick = 1;
				}else{
					$("title").text("••••••••••");
					data.unread_tick = 0;					
				}
			}, 1000);
		}
	});
	$(window).on('focus', function(){
		$("title").text("Chat");
		data.focused = true;
		if(data.unread == true){
			clearInterval(data.unread_timer);
			data.unread = false;
		}
	});
	$("#chat-input-field").on('keyup', function(e){
		if(e.keyCode == 13){
			var val = $(this).text();
			$(this).text('');
			socket.emit('message', {msg:val, to:data.current});
		}
	});
	$.getJSON('/friends-on-chat', function(res){
		$("#my-instant-contacts").html("");
		res.forEach(function(e){
			$("#my-instant-contacts").append('<div id="list-'+e.id+'" data-id="'+e.id+'" data-name="'+e.name+'" class="media user-list-item"><a href="#" class="user-invisible-link pull-left"><img data-src="holder.js/64x64" class="media-object"></a><div class="media"><a href="#" class="pull-left"><img data-src="holder.js/64x64" alt="64x64" style="width: 64px; height: 64px;" src="'+e.pic+'" class="media-object"></a></div><div class="media-body"><a href="#" class="media-heading">'+e.name+'</a><br><span id="list-presence-'+e.id+'">'+(e.online == "yes" ? "online": "")+'</span></div><br class="clear"></div>');
		});
	});
	$("body").on("click", ".user-list-item", function(){

		$(this).addClass("active-user");
		$('.user-list-item').not(this).removeClass("active-user");

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
