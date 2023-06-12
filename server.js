const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require('socket.io');
const io = new Server(server);
const path = require('path');

const dotenv = require('dotenv').config();
server.listen(process.env.PORT);

const { MongoClient } = require("mongodb");
const client = new MongoClient(process.env.MONGODB_URI);

const PALETTE_SIZE = 32;
const rooms = {};

const passport = require('passport');
const DiscordStrategy = require('passport-discord').Strategy;

const users = new Map();

//cookie is created
passport.serializeUser((user, done) => {
    done(null, user.id);
});

//cookie is used to fetch user
passport.deserializeUser((id, done) => {
    const user = users.get(id);
    done(null, user);
});

passport.use(new DiscordStrategy({
    clientID: process.env.DISCORD_CLIENT_ID,
    clientSecret: process.env.DISCORD_CLIENT_SECRET,
    callbackURL: '/auth/discord/redirect',
    scope: ['identify'],
}, (accessToken, refreshToken, profile, done) => {
    //console.log(profile);
    const user = {
        id: profile.id,
        name: (profile.global_name ? profile.global_name : profile.username),
        avatar: profile.avatar,
    };
    users.set(profile.id, user);
    done(null, user);
}));

const session = require('express-session');

const sessionMiddleware = session({ secret: 'dogs', resave: false, saveUninitialized: false });
app.use(sessionMiddleware);
app.use(passport.initialize());
app.use(passport.session());

function setRoomRedirect(req, res, next) {
    //save it in session so we can redirect after authentication
    req.session.redirectTo = req.params.roomId;
    next();
}

app.get("/:roomId/auth", setRoomRedirect, passport.authenticate('discord'));

//authenticated, need middleware that uses code from response to fetch profile info
app.get('/auth/discord/redirect', passport.authenticate('discord', {keepSessionInfo: true}), (req, res) => {
    res.redirect("/" + req.session.redirectTo);
});

//taken from official socket.io example
const wrap = middleware => (socket, next) => middleware(socket.request, {}, next);

io.use(wrap(sessionMiddleware));
io.use(wrap(passport.initialize()));
io.use(wrap(passport.session()));

async function loadPixels() {
    try {
        const database = client.db('canvas');
        const pixelColl = database.collection('rooms');
        const result = await pixelColl.find({});
        for await (const doc of result) {
            console.log("Loading pixel data for room " + doc.name);
            rooms[doc.name] = {
                pixels: doc.pixels,
                users: new Map(),
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
    io.on('connection', (client) => {
        if (!rooms[client.handshake.auth.roomID]) return;
        client.roomID = client.handshake.auth.roomID;
        client.join(client.roomID);

        io.to(client.id).emit('load-data', rooms[client.roomID].pixels);

        if (client.request.user) {
            client.user = client.request.user;

            io.to(client.id).emit('login', client.user);

            rooms[client.roomID].users.set(client.user.id, client.user);
    
            console.log(client.user.name + " connected to room " + client.roomID);

            io.in(client.roomID).emit('connected-users', Array.from(rooms[client.roomID].users.values()));

            client.on('draw', (x, y, colorIndex) => {
                if (x !== null && y !== null && x >= 0 && x < rooms[client.roomID].pixels[0].length 
                        && y >= 0 && y < rooms[client.roomID].pixels.length
                        && colorIndex >= 0 && colorIndex < PALETTE_SIZE) {
                    client.to(client.roomID).emit('draw', x, y, +colorIndex);
                    rooms[client.roomID].pixels[x][y] = +colorIndex;
                }
            });

            client.on('disconnect', async () => {
                const roomSockets = await io.in(client.roomID).fetchSockets();
                const connectedElsewhere = roomSockets.some(socket => socket.user && socket.user.id === client.user.id);
                if (!connectedElsewhere) {
                    console.log(client.user.name + " left room " + client.roomID);
                    rooms[client.roomID].users.delete(client.user.id);
                    client.to(client.roomID).emit('connected-users', Array.from(rooms[client.roomID].users.values()));
                    savePixels(client.roomID, rooms[client.roomID].pixels);
                }
            });
        }
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
