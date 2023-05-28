const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require('socket.io');
const io = new Server(server);

server.listen(3000);

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

        io.to(socket.id).emit('load-data', pixels);
        io.emit('connected-count', sessions.size);

        socket.on('draw', (x, y, color) => {
            if (x !== null && y !== null && x >= 0 && x < pixels[0].length && y >= 0 && y < pixels.length
                && /^([a-f0-9]{6})$/.test(color)) {
                socket.broadcast.emit('draw', x, y, color);
                pixels[x][y] = color;
            }
        })

        socket.on('large-draw', (x, y, color) => {
            if (x !== null && y !== null && x >= 0 && x < pixels[0].length && y >= 0 && y < pixels.length
                && /^([a-f0-9]{6})$/.test(color)) {
                socket.broadcast.emit('large-draw', x, y, color);
                pixels[x][y] = color;
                if (x > 0) {
                    pixels[x - 1][y] = color;
                }
                if (x < pixels[x].length - 1) {
                    pixels[x + 1][y] = color;
                }
                if (y > 0) {
                    pixels[x][y - 1] = color;
                }
                if (y < pixels.length - 1) {
                    pixels[x][y + 1] = color;
                }
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
        const pixelColl = database.collection('realm');
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
        const pixelColl = database.collection('realm');
        await pixelColl.updateOne({}, { $set: { pixels: pixels } });
    } catch (e) {
        console.error(e, e.stack);
    }
}

init();