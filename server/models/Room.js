const mongoose = require('mongoose');

const roomSchema = new mongoose.Schema({
    name: String,
    pixels: [[Number]],
    pixelPlacers: [[String]],
    authorizedUsers: [String],
});

roomSchema.virtual('connectedUsers').get(function() {
    if (!this.connectedUsersMap) {
        this.connectedUsersMap = new Map();
    }
    return this.connectedUsersMap;
});

module.exports = mongoose.model('Room', roomSchema);