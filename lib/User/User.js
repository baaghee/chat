exports.Schema = mongoose.Schema(
		{
			_id:'number',
			token:'string',
			tokenSecret:'string',
			friends:'array',
			uninvited_friends:[{
				screen_name:'string',
				id:'string',
				profile_image_url:'string',
				invited:'boolean'
			}],
			last_sync:'date',
			username:"string",
			raw:{}
		},
		{
			strict:false
		}
	);

