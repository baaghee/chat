var schema = require('./Message').Schema;

module.exports = db.model('messages', schema);
