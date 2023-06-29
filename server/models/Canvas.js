const mongoose = require('mongoose');
const User = require('./User');

const canvasSchema = new mongoose.Schema({
	name: String,
	pixels: [[Number]],
	pixelPlacers: [[String]],
	authorizedUsers: [String],
});

canvasSchema.virtual('connectedUsers').get(function () {
	if (!this.connectedUsersMap) {
		this.connectedUsersMap = new Map();
	}
	return this.connectedUsersMap;
});

canvasSchema.virtual('chatMessages').get(function () {
	if (!this.chatMessagesArray) {
		this.chatMessagesArray = [];
	}
	return this.chatMessagesArray;
});

canvasSchema.methods.expand = function(amount) {
	for (let i = 0; i < this.pixels.length; i++) {
		for (let j = 0; j < amount; j++) {
			this.pixels[i].push(31);
			this.pixelPlacers[i].push(null);
		}
	}

	for (let i = 0; i < amount; i++) {
		this.pixels.push(new Array(this.pixels[0].length).fill(31));
		this.pixelPlacers.push(new Array(this.pixelPlacers[0].length).fill(null));
	}
}

canvasSchema.methods.findContributedUsers = async function () {
	const uniqueUserIds = [...new Set(this.pixelPlacers.flat())];
	const uniqueUsers = await User.find({ discordId: { $in: uniqueUserIds } })
		.select('-_id discordId name avatar')
		.exec();
	this.contributedUsersMap = new Map();
	uniqueUsers.forEach((user) => this.contributedUsersMap.set(user.discordId, user));
};

canvasSchema.methods.isValidDraw = function (x, y, colorIndex) {
	return (
		x !== null &&
		y !== null &&
		x >= 0 &&
		x < this.pixels[0].length &&
		y >= 0 &&
		y < this.pixels.length &&
		colorIndex >= 0 &&
		colorIndex < 32
	);
};

canvasSchema.methods.placePixel = function (x, y, colorIndex, user) {
	this.pixels[x][y] = colorIndex;
	this.pixelPlacers[x][y] = user.discordId;
	if (!this.contributedUsersMap.has(user.discordId)) {
		this.contributedUsersMap.set(user.discordId, user);
	}
};

module.exports = mongoose.model('Room', canvasSchema);
