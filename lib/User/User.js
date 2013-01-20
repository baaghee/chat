exports.Schema = mongoose.Schema(
		{
			_id:'number',
			token:'string',
			tokenSecret:'string'
		},
		{
			strict:false
		}
	);

