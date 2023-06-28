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

app.use(express.urlencoded({ extended: false }));
app.use(express.static(path.join(__dirname, '..', 'public')));

app.get('/', (req, res) => {
	res.sendFile(path.join(__dirname, '..', 'public', 'home', 'index.html'));
});

app.get('/:roomId([a-zA-Z]+)', async (req, res) => {
	res.redirect(`/canvas/${req.params.roomId}`);
});

app.get('/canvas/:roomId', async (req, res) => {
	req.params.roomId = req.params.roomId.toLowerCase();
	if (activeRooms[req.params.roomId]) {
		res.sendFile(path.join(__dirname, '..', 'public', 'canvas', 'index.html'));
	} else {
		try {
			const room = await Room.findOne({ name: req.params.roomId });
			if (!room) {
				res.send("Room doesn't exist! Try another.");
			} else {
				await room.findContributedUsers(); //initialize
				activeRooms[room.name] = room;
				res.sendFile(path.join(__dirname, '..', 'public', 'canvas', 'index.html'));
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
					canvas: null,
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

app.get('/auth/discord', passport.authenticate('discord'));
app.get('/canvas/:roomId/auth', setRoomRedirect, passport.authenticate('discord'));

//authenticated, need middleware that uses code from response to fetch profile info
app.get('/auth/discord/redirect', passport.authenticate('discord', { keepSessionInfo: true }), (req, res) => {
	if (req.session.redirectTo) {
		res.redirect('/canvas/' + req.session.redirectTo);
	} else {
		res.redirect('/');
	}
});

app.post('/create', async (req, res, next) => {
	try {
		if (!req.user || req.user.canvas) {
			res.status(401).json({ error: 'User not authorized' });
			return;
		}
		if (!req.body || !req.body.name || !/^[a-z1-9_]{2,16}/.test(req.body.name.toLowerCase())) {
			res.status(403).json({ error: 'Invalid room name' });
			return;
		}
		const canvasName = req.body.name.toLowerCase();
		const existingCanvas = await Room.findOne({ name: canvasName });
		if (existingCanvas) {
			res.status(409).json({ error: 'Name already taken' });
			return;
		}
		await new Room({
			name: canvasName,
			pixels: new Array(100).fill(new Array(100).fill(PALETTE_SIZE - 1)),
			pixelPlacers: new Array(100).fill(new Array(100).fill(null)),
			authorizedUsers: [req.user.discordId],
		}).save();
		await User.findOneAndUpdate({ discordId: req.user.discordId }, { canvas: canvasName });
		res.status(201).json({ canvas: canvasName });
	} catch (err) {
		return next(err);
	}
});

app.get('/api/user', (req, res) => {
	if (req.user) {
		const { discordId, name, avatar, canvas } = req.user;
		res.json({user: { discordId, name, avatar, canvas }});
	} else {
		res.status(401).json({ error: 'User not authorized' });
	}
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
				activeRooms[client.roomId].authorizedUsers.find((discordId) => discordId === client.request.user.discordId) ||
				activeRooms[client.roomId].authorizedUsers.length === 0,
		};
		io.to(client.id).emit('login', client.user);

		io.to(client.id).emit('load-messages', activeRooms[client.roomId].chatMessages);

		activeRooms[client.roomId].connectedUsers.set(client.user.discordId, client.user);
		console.log(client.user.name + ' connected to room ' + client.roomId);

		io.in(client.roomId).emit('connected-users', Array.from(activeRooms[client.roomId].connectedUsers.values()));

		if (client.user.isAuthorized) {
			client.on('pencil-draw', (x, y, colorIndex) => {
				if (activeRooms[client.roomId].isValidDraw(x, y, colorIndex)) {
					client.to(client.roomId).emit('pencil-draw', x, y, +colorIndex, client.user);
					activeRooms[client.roomId].placePixel(x, y, +colorIndex, client.user);
				}
			});

			client.on('brush-draw', (x, y, colorIndex) => {
				if (activeRooms[client.roomId].isValidDraw(x, y, colorIndex)) {
					client.to(client.roomId).emit('brush-draw', x, y, colorIndex, client.user);
					activeRooms[client.roomId].placePixel(x, y, +colorIndex, client.user);
					if (x > 0) {
						activeRooms[client.roomId].placePixel(x - 1, y, +colorIndex, client.user);
					}
					if (x < activeRooms[client.roomId].pixels[x].length - 1) {
						activeRooms[client.roomId].placePixel(x + 1, y, +colorIndex, client.user);
					}
					if (y > 0) {
						activeRooms[client.roomId].placePixel(x, y - 1, +colorIndex, client.user);
					}
					if (y < activeRooms[client.roomId].pixels.length - 1) {
						activeRooms[client.roomId].placePixel(x, y + 1, +colorIndex, client.user);
					}
				}
			});

			client.on('send-undo', (x, y, prevColorIndex, prevDiscordId) => {
				if (
					activeRooms[client.roomId].isValidDraw(x, y, prevColorIndex) &&
					(!prevDiscordId || activeRooms[client.roomId].contributedUsersMap.has(prevDiscordId))
				) {
					activeRooms[client.roomId].pixels[x][y] = prevColorIndex;
					activeRooms[client.roomId].pixelPlacers[x][y] = prevDiscordId;
					client.to(client.roomId)
						.emit('receive-undo', x, y, prevColorIndex,
							activeRooms[client.roomId].contributedUsersMap.get(prevDiscordId)
						);
				}
			});
		}

		client.on('send-message', (message) => {
			message.text = message.text.trim().substring(0, 250);
			if (message.text.length > 0) {
				activeRooms[client.roomId].chatMessages.push({ user: client.user, message: message });
				client.to(client.roomId).emit('receive-message', client.user, message);
			}
		});

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
	}
});
