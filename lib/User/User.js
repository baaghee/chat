exports.Schema = mongoose.Schema(
		{
			_id:'number',
			token:'string',
			tokenSecret:'string',
			friends:'array',
			last_sync:'date',
			username:"string",
			raw:{}
		},
		{
			strict:false
		}
	);

