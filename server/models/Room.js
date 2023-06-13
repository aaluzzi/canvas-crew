const mongoose = require('mongoose');

const roomSchema = new mongoose.Schema({
    name: String,
    pixels: [[Number]],
    authorizedUsers: [String],
});

roomSchema.virtual('connectedUsers').get(function() {
    if (!this.connectedUsersValue) {
        this.connectedUsersValue = new Map();
    }
    return this.connectedUsersValue;
});

module.exports = mongoose.model('Room', roomSchema);