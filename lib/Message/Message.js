exports.Schema = mongoose.Schema({
	message:'string',
	from:{
		id:'number',
		screen_name:'string',
		photo:'string'
	},
	to:{type:'number', ref: 'User'},
	date:'date'
});

