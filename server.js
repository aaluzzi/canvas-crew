const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require('socket.io');
const io = new Server(server);

server.listen(3000, () => {
    console.log('listening on *:3000');
});

const path = require('path');
app.use(express.static(path.join(__dirname, 'js')));
app.use(express.static(path.join(__dirname, 'css')));

app.get("/", (req, res) => {
    res.sendFile(__dirname + "/index.html");
});

app.get("/*", (req, res) => {
    res.redirect("/");
});

const dotenv = require('dotenv').config();
const { MongoClient } = require("mongodb");
const client = new MongoClient(process.env.MONGODB_URI);

const sessions = new Map();

function getRandomID() {
    let allChars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
    let id = '';
    for (let i = 0; i < 5; i++) {
        id += allChars.charAt(Math.floor(Math.random() * allChars.length));
    }
    return id;
}

async function init() {
    const pixels = await loadPixels();
    io.on('connection', (socket) => {
       

        let sessionID = socket.handshake.auth.sessionID;
        if (!sessionID) {
            sessionID = getRandomID();
            io.to(socket.id).emit('session', sessionID);
        }
        if (sessions.has(sessionID)) {
            sessions.set(sessionID, sessions.get(sessionID) + 1)
        } else {
            sessions.set(sessionID, 1)
        }
        socket.sessionID = sessionID;
        console.log(socket.sessionID + " connected");

        io.emit('connected-count', sessions.size);
        io.to(socket.id).emit('load-data', pixels);

        socket.on('draw', (x, y, color) => {
            if (x !== null && y !== null && x >= 0 && x < pixels[0].length && y >= 0 && y < pixels.length) {
                socket.broadcast.emit('draw', x, y, color);
                pixels[y][x] = color;
            }
        })

        socket.on('disconnect', () => {
            console.log(socket.sessionID + " disconnected");
            if (sessions.get(socket.sessionID) === 1) {
                console.log("Removing " + socket.sessionID + " from sessions map");
                sessions.delete(socket.sessionID);
                savePixels(pixels);
            } else {
                console.log(socket.sessionID + " still has another instance connected, decrementing in map");
                sessions.set(socket.sessionID, sessions.get(socket.sessionID) - 1);
            }
            socket.broadcast.emit('connected-count', sessions.size);
        })
    });
}

async function loadPixels() {
    try {
        console.log("Loading pixels from database");
        const database = client.db('canvas');
        const pixelColl = database.collection('pixels');
        const result = await pixelColl.findOne({});
        return result.pixels;
    } catch (e) {
        console.error(e, e.stack);
    }
}

async function savePixels(pixels) {
    try {
        console.log("Saving pixels to database");
        const database = client.db('canvas');
        const pixelColl = database.collection('pixels');
        await pixelColl.updateOne({}, { $set: { pixels: pixels } });
    } catch (e) {
        console.error(e, e.stack);
    }
}

init();