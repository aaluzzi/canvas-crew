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

let pixels = new Array(50).fill("ffffff").map(() => new Array(50).fill("ffffff"));

io.on('connection', (socket) => {
    io.to(socket.id).emit('load-data', pixels);

    socket.on('draw', (x, y, color) => {
        if (x && y && x >= 0 && x < pixels.length && y >= 0 && y < pixels[x].length) {
            io.emit('draw', x, y, color);
            pixels[x][y] = color;
        }
    })
});