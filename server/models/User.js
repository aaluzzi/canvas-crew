const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
	authId: String,
	name: String,
	avatar: String,
	canvas: String,
});

module.exports = mongoose.model('User', userSchema);
