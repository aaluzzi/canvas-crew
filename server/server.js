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
const Canvas = require('./models/Canvas');

const PALETTE_SIZE = 32;
const activeCanvases = {};

app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');
app.use(express.urlencoded({ extended: false }));
app.use(express.static(path.join(__dirname, '..', 'public')));

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
	req.session.redirectTo = req.params.canvasName;
	next();
}

app.get('/', (req, res) => {
	res.render('home', { user: req.user });
});

app.get('/:canvasName([a-zA-Z]+)', async (req, res) => {
	res.redirect(`/canvas/${req.params.canvasName}`);
});

app.get('/canvas/:canvasName', async (req, res) => {
	const canvasName = req.params.canvasName.toLowerCase();

	if (!activeCanvases[canvasName]) {
		try {
			const canvas = await Canvas.findOne({ name: canvasName });
			if (!canvas) {
				res.send("Canvas doesn't exist! Try another.");
				return;
			} else {
				await canvas.findContributedUsers(); //initialize
				activeCanvases[canvas.name] = canvas;
			}
		} catch (e) {
			console.error(e);
		}
	}

	let canvasUser;
	if (req.user) {
		canvasUser = {
			discordId: req.user.discordId,
			name: req.user.name,
			avatar: req.user.avatar,
			isAuthorized:
				activeCanvases[canvasName].authorizedUsers.length === 0 ||
				activeCanvases[canvasName].authorizedUsers.includes(req.user.discordId),
		};
	}

	res.render('canvas', { user: canvasUser, canvasName: canvasName });
});

app.get('/auth/discord', passport.authenticate('discord'));
app.get('/canvas/:canvasName/auth', setRoomRedirect, passport.authenticate('discord'));

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
			res.status(403).json({ error: 'Invalid canvas name' });
			return;
		}
		const canvasName = req.body.name.toLowerCase();
		const existingCanvas = await Canvas.findOne({ name: canvasName });
		if (existingCanvas) {
			res.status(409).json({ error: 'Name already taken' });
			return;
		}
		await new Canvas({
			name: canvasName,
			pixels: new Array(100).fill(new Array(100).fill(PALETTE_SIZE - 1)),
			pixelPlacers: new Array(100).fill(new Array(100).fill(null)),
			authorizedUsers: [req.user.discordId],
		}).save();
		await User.findOneAndUpdate({ discordId: req.user.discordId }, { canvas: canvasName });
		console.log(`Canvas ${canvasName} created by ${req.user.name}`);
		res.status(201).json({ canvas: canvasName });
	} catch (err) {
		return next(err);
	}
});

//taken from official socket.io example
const wrap = (middleware) => (socket, next) => middleware(socket.request, {}, next);

io.use(wrap(sessionMiddleware));
io.use(wrap(passport.initialize()));
io.use(wrap(passport.session()));

io.on('connection', (client) => {
	if (!activeCanvases[client.handshake.auth.roomId.toLowerCase()]) return;
	client.roomId = client.handshake.auth.roomId.toLowerCase();

	io.to(client.id).emit('load-data', activeCanvases[client.roomId].pixels, activeCanvases[client.roomId].pixelPlacers, [
		...activeCanvases[client.roomId].contributedUsersMap.values(),
	]);

	if (client.request.user) {
		client.join(client.roomId);
		client.user = {
			discordId: client.request.user.discordId,
			name: client.request.user.name,
			avatar: client.request.user.avatar,
			//if authorized set is empty, authorize everyone (for now)
			isAuthorized:
				activeCanvases[client.roomId].authorizedUsers.length === 0 ||
				activeCanvases[client.roomId].authorizedUsers.includes(client.request.user.discordId),
		};

		io.to(client.id).emit('load-messages', activeCanvases[client.roomId].chatMessages);

		activeCanvases[client.roomId].connectedUsers.set(client.user.discordId, client.user);
		console.log(client.user.name + ' joined canvas ' + client.roomId);

		io.in(client.roomId).emit('connected-users', Array.from(activeCanvases[client.roomId].connectedUsers.values()));

		if (client.user.isAuthorized) {
			client.on('pencil-draw', (x, y, colorIndex) => {
				if (activeCanvases[client.roomId].isValidDraw(x, y, colorIndex)) {
					client.to(client.roomId).emit('pencil-draw', x, y, +colorIndex, client.user);
					activeCanvases[client.roomId].placePixel(x, y, +colorIndex, client.user);
				}
			});

			client.on('brush-draw', (x, y, colorIndex) => {
				if (activeCanvases[client.roomId].isValidDraw(x, y, colorIndex)) {
					client.to(client.roomId).emit('brush-draw', x, y, colorIndex, client.user);
					activeCanvases[client.roomId].placePixel(x, y, +colorIndex, client.user);
					if (x > 0) {
						activeCanvases[client.roomId].placePixel(x - 1, y, +colorIndex, client.user);
					}
					if (x < activeCanvases[client.roomId].pixels[x].length - 1) {
						activeCanvases[client.roomId].placePixel(x + 1, y, +colorIndex, client.user);
					}
					if (y > 0) {
						activeCanvases[client.roomId].placePixel(x, y - 1, +colorIndex, client.user);
					}
					if (y < activeCanvases[client.roomId].pixels.length - 1) {
						activeCanvases[client.roomId].placePixel(x, y + 1, +colorIndex, client.user);
					}
				}
			});

			client.on('send-undo', (x, y, prevColorIndex, prevDiscordId) => {
				if (
					activeCanvases[client.roomId].isValidDraw(x, y, prevColorIndex) &&
					(!prevDiscordId || activeCanvases[client.roomId].contributedUsersMap.has(prevDiscordId))
				) {
					activeCanvases[client.roomId].pixels[x][y] = prevColorIndex;
					activeCanvases[client.roomId].pixelPlacers[x][y] = prevDiscordId;
					client
						.to(client.roomId)
						.emit(
							'receive-undo',
							x,
							y,
							prevColorIndex,
							activeCanvases[client.roomId].contributedUsersMap.get(prevDiscordId)
						);
				}
			});
		}

		client.on('send-message', (message) => {
			message.text = message.text.trim().substring(0, 250);
			if (message.text.length > 0) {
				activeCanvases[client.roomId].chatMessages.push({ user: client.user, message: message });
				client.to(client.roomId).emit('receive-message', client.user, message);
			}
		});

		client.on('disconnect', async () => {
			const roomSockets = await io.in(client.roomId).fetchSockets();
			const connectedElsewhere = roomSockets.some(
				(socket) => socket.user && socket.user.discordId === client.user.discordId
			);
			if (!connectedElsewhere) {
				console.log(client.user.name + ' left canvas ' + client.roomId);
				activeCanvases[client.roomId].connectedUsers.delete(client.user.discordId);
				if (activeCanvases[client.roomId].connectedUsers.size > 0) {
					client
						.to(client.roomId)
						.emit('connected-users', Array.from(activeCanvases[client.roomId].connectedUsers.values()));
				} else {
					console.log('Saving canvas');
					activeCanvases[client.roomId].save();
					delete activeCanvases[client.roomId];
				}
			}
		});
	}
});
