const mongoose = require('mongoose');
const User = require('./User');

const roomSchema = new mongoose.Schema({
	name: String,
	pixels: [[Number]],
	pixelPlacers: [[String]],
	authorizedUsers: [String],
});

roomSchema.virtual('connectedUsers').get(function () {
	if (!this.connectedUsersMap) {
		this.connectedUsersMap = new Map();
	}
	return this.connectedUsersMap;
});

roomSchema.virtual('chatMessages').get(function() {
    if (!this.chatMessagesArray) {
		this.chatMessagesArray = [];
	}
	return this.chatMessagesArray;
});

roomSchema.methods.findContributedUsers = async function () {
	const uniqueUserIds = [...new Set(this.pixelPlacers.flat())];
	const uniqueUsers = await User.find({ discordId: { $in: uniqueUserIds } })
		.select('-_id discordId name avatar')
		.exec();
	this.contributedUsersMap = new Map();
	uniqueUsers.forEach((user) => this.contributedUsersMap.set(user.discordId, user));
};

roomSchema.methods.placePixel = function (x, y, colorIndex, user) {
	this.pixels[x][y] = colorIndex;
	this.pixelPlacers[x][y] = user.discordId;
	if (this.contributedUsersMap.has(user.discordId)) {
		this.contributedUsersMap.set(user.discordId, user);
	}
};

module.exports = mongoose.model('Room', roomSchema);
