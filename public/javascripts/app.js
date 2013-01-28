var socket = io.connect('/chat');

socket.on('incoming', function(data){
	$("#chat-window-container").append('<div class="media chat-item"><div class="chat-bubble-arrow"></div><a href="#" class="pull-left"><img data-src="holder.js/64x64" class="media-object"></a><div class="media"><a href="#" class="pull-left"><img data-src="holder.js/64x64" alt="64x64" src="'+data.user.photo+'" class="media-object"></a></div><div class="media-body"><a href="#" class="media-heading">Media heading</a><br><p>'+data.msg+'</p></div></div>');
	console.log(data)
});

$(function(){
	$("#chat-input-field").on('keyup', function(e){
		if(e.keyCode == 13){
			var val = $(this).text();
			$(this).text('');
			socket.emit('message', {msg:val});
		}
	});
});
