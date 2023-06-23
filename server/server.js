const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require('socket.io');
const io = new Server(server);
const path = require('path');

const dotenv = require('dotenv').config();
server.listen(process.env.PORT);

const mongoose = require('mongoose');
mongoose.connect(process.env.MONGODB_URI);

const User = require('./models/User');
const Room = require('./models/Room');

const PALETTE_SIZE = 32;
const activeRooms = {};

app.get('/', (req, res) => {
	res.send('Please specify a room to join in the url.');
});

app.use(express.static(path.join(__dirname, '..', 'public')));

app.get('/:roomId([a-zA-Z]+)', async (req, res) => {
	req.params.roomId = req.params.roomId.toLowerCase();
	if (activeRooms[req.params.roomId]) {
		res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
	} else {
		try {
			const room = await Room.findOne({ name: req.params.roomId });
			await room.findContributedUsers(); //initialize
			if (!room) {
				res.send("Room doesn't exist! Try another.");
			} else {
				activeRooms[room.name] = room;
				res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
			}
		} catch (e) {
			console.error(e);
		}
	}
});

const passport = require('passport');
const DiscordStrategy = require('passport-discord').Strategy;

//cookie is created
passport.serializeUser((user, done) => {
	done(null, user.id);
});

//cookie is used to fetch user
passport.deserializeUser(async (id, done) => {
	const user = await User.findById(id);
	done(null, user);
});

passport.use(
	new DiscordStrategy(
		{
			clientID: process.env.DISCORD_CLIENT_ID,
			clientSecret: process.env.DISCORD_CLIENT_SECRET,
			callbackURL: '/auth/discord/redirect',
			scope: ['identify'],
		},
		async (accessToken, refreshToken, profile, done) => {
			let user = await User.findOneAndUpdate(
				{ discordId: profile.id },
				{
					//in case they update their discord profile
					name: profile.global_name ? profile.global_name : profile.username,
					avatar: profile.avatar,
				}
			);
			if (!user) {
				user = await new User({
					discordId: profile.id,
					name: profile.global_name ? profile.global_name : profile.username,
					avatar: profile.avatar,
					ownedRoom: null,
				}).save();
			}
			done(null, user);
		}
	)
);

const session = require('cookie-session');

const sessionMiddleware = session({
	keys: [process.env.COOKIE_KEY],
	maxAge: 1209600000, //two weeks
});
app.use(sessionMiddleware);
app.use(passport.initialize());
app.use(passport.session());

function setRoomRedirect(req, res, next) {
	//save it in session so we can redirect after authentication
	req.session.redirectTo = req.params.roomId;
	next();
}

app.get('/:roomId/auth', setRoomRedirect, passport.authenticate('discord'));

//authenticated, need middleware that uses code from response to fetch profile info
app.get('/auth/discord/redirect', passport.authenticate('discord', { keepSessionInfo: true }), (req, res) => {
	res.redirect('/' + req.session.redirectTo);
});

//taken from official socket.io example
const wrap = (middleware) => (socket, next) => middleware(socket.request, {}, next);

io.use(wrap(sessionMiddleware));
io.use(wrap(passport.initialize()));
io.use(wrap(passport.session()));

io.on('connection', (client) => {
	if (!activeRooms[client.handshake.auth.roomId.toLowerCase()]) return;
	client.roomId = client.handshake.auth.roomId.toLowerCase();

	io.to(client.id).emit('load-data', activeRooms[client.roomId].pixels, activeRooms[client.roomId].pixelPlacers, [
		...activeRooms[client.roomId].contributedUsersMap.values(),
	]);

	if (client.request.user) {
        client.join(client.roomId);
		//request.user is 1 to 1 with db contents, so only take what we need from it to give to room users
		client.user = {
			discordId: client.request.user.discordId,
			name: client.request.user.name,
			avatar: client.request.user.avatar,
			//if authorized set is empty, authorize everyone (for now)
			isAuthorized:
				activeRooms[client.roomId].authorizedUsers.find((user) => user.discordId === client.request.user.discordId) ||
				activeRooms[client.roomId].authorizedUsers.length === 0,
		};
		io.to(client.id).emit('login', client.user);

		activeRooms[client.roomId].connectedUsers.set(client.user.discordId, client.user);
		console.log(client.user.name + ' connected to room ' + client.roomId);

		io.in(client.roomId).emit('connected-users', Array.from(activeRooms[client.roomId].connectedUsers.values()));

		if (client.user.isAuthorized) {
			client.on('draw', (x, y, colorIndex) => {
				if (
					x !== null &&
					y !== null &&
					x >= 0 &&
					x < activeRooms[client.roomId].pixels[0].length &&
					y >= 0 &&
					y < activeRooms[client.roomId].pixels.length &&
					colorIndex >= 0 &&
					colorIndex < PALETTE_SIZE
				) {
					client.to(client.roomId).emit('draw', x, y, +colorIndex, client.user);
					activeRooms[client.roomId].placePixel(x, y, +colorIndex, client.user);
				}
			});
		}

		client.on('disconnect', async () => {
			const roomSockets = await io.in(client.roomId).fetchSockets();
			const connectedElsewhere = roomSockets.some(
				(socket) => socket.user && socket.user.discordId === client.user.discordId
			);
			if (!connectedElsewhere) {
				console.log(client.user.name + ' left room ' + client.roomId);
				activeRooms[client.roomId].connectedUsers.delete(client.user.discordId);
				if (activeRooms[client.roomId].connectedUsers.size > 0) {
					client
						.to(client.roomId)
						.emit('connected-users', Array.from(activeRooms[client.roomId].connectedUsers.values()));
				} else {
					console.log('Saving room');
					activeRooms[client.roomId].save();
					delete activeRooms[client.roomId];
				}
			}
		});

        client.on('send-message', (message) => {
            message = message.trim().substring(0, 200);
            if (message.length > 0) {
                client.to(client.roomId).emit('receive-message', client.user, message);
            }
        })
	}
});
