var schema = require('./User').Schema;
module.exports = db.model('users', schema);
