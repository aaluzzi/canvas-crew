const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require('socket.io');
const io = new Server(server);
const path = require('path');

server.listen(3000);

const dotenv = require('dotenv').config();
const { MongoClient } = require("mongodb");
const client = new MongoClient(process.env.MONGODB_URI);

const rooms = {};

function getRandomID() {
    let allChars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
    let id = '';
    for (let i = 0; i < 5; i++) {
        id += allChars.charAt(Math.floor(Math.random() * allChars.length));
    }
    return id;
}

const COLORS = ['6d001a', 'be0039', 'ff4500', 'ffa800', 'ffd635', '7eed56',
    '00a368', '009eaa', '51e9f4', '3690ea', '2450a4', '493ac1',
    '811e9f', 'b44ac0', 'e4abff', 'ff3881', 'ff99aa', 'ffb470',
    '9c6926', '6d482f', '000000', '515252', '9ca0a3', 'ffffff'];

async function loadPixels() {
    try {
        const database = client.db('canvas');
        const pixelColl = database.collection('rooms');
        const result = await pixelColl.find({});
        for await (const doc of result) {
            console.log("Loading pixel data for room " + doc.name);
            rooms[doc.name] = {
                pixels: doc.pixels,
                sessions: new Map(),
            };
        }
    } catch (e) {
        console.error(e, e.stack);
    }
}

async function savePixels(room, pixelData) {
    try {
        console.log("Saving pixels to database for room " + room);
        const database = client.db('canvas');
        const pixelColl = database.collection('rooms');
        await pixelColl.updateOne({ name: room }, { $set: { pixels: pixelData, name: room } });
    } catch (e) {
        console.error(e, e.stack);
    }
}

async function init() {
    await loadPixels();
    io.on('connection', (socket) => {
        if (!rooms[socket.handshake.auth.roomID]) return;
        socket.roomID = socket.handshake.auth.roomID;
        socket.join(socket.roomID);

        let sessionID = socket.handshake.auth.sessionID;
        if (!sessionID) {
            sessionID = getRandomID();
            io.to(socket.id).emit('session', sessionID);
        }
        if (rooms[socket.roomID].sessions.has(sessionID)) {
            rooms[socket.roomID].sessions.set(sessionID, rooms[socket.roomID].sessions.get(sessionID) + 1)
        } else {
            rooms[socket.roomID].sessions.set(sessionID, 1)
        }
        socket.sessionID = sessionID;
        console.log(socket.sessionID + " connected to room " + socket.roomID);

        io.to(socket.id).emit('load-data', rooms[socket.roomID].pixels);
        io.in(socket.roomID).emit('connected-count', rooms[socket.roomID].sessions.size);

        socket.on('draw', (x, y, colorIndex) => {
            if (x !== null && y !== null && x >= 0 && x < rooms[socket.roomID].pixels[0].length 
                    && y >= 0 && y < rooms[socket.roomID].pixels.length
                    && colorIndex > 0 && colorIndex < COLORS.length) {
                socket.to(socket.roomID).emit('draw', x, y, COLORS[colorIndex]);
                rooms[socket.roomID].pixels[x][y] = COLORS[colorIndex];
            }
        });

        socket.on('disconnect', () => {
            console.log(socket.sessionID + " disconnected from room " + socket.roomID);
            if (rooms[socket.roomID].sessions.get(socket.sessionID) === 1) {
                console.log("Removing " + socket.sessionID + " from sessions map");
                rooms[socket.roomID].sessions.delete(socket.sessionID);
                savePixels(socket.roomID, rooms[socket.roomID].pixels);
            } else {
                console.log(socket.sessionID + " still has another instance connected, decrementing in map");
                rooms[socket.roomID].sessions.set(socket.sessionID, rooms[socket.roomID].sessions.get(socket.sessionID) - 1);
            }
            socket.broadcast.emit('connected-count', rooms[socket.roomID].sessions.size);
        })
    });
}

init();

app.get("/", (req, res) => {
    res.send("Please specify a room to join in the url.");
})

app.use(express.static(path.join(__dirname, 'public')));
app.get("/:roomId", (req, res) => {
    if (rooms[req.params.roomId]) {
        res.sendFile(__dirname + "/public/index.html");
    } else {
        res.send("Room doesn't exist! Try another.");
    }
});
