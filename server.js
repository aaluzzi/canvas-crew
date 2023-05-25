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

async function init() {
    const pixels = await loadPixels();
    io.on('connection', (socket) => {
        console.log(socket.id + " connected");
        io.to(socket.id).emit('load-data', pixels);

        socket.on('draw', (x, y, color) => {
            if (x !== null && y !== null && x >= 0 && x < pixels[0].length && y >= 0 && y < pixels.length) {
                socket.broadcast.emit('draw', x, y, color);
                pixels[y][x] = color;
            }
        })

        socket.on('disconnect', () => {
            console.log(socket.id + " disconnected");
            savePixels(pixels);
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