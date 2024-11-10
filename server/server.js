const express = require('express');
const app = express();
const http = require('http');
const httpServer = http.createServer(app);
const path = require('path');
const dotenv = require('dotenv').config();
httpServer.listen(process.env.PORT);

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
const GoogleStrategy = require('passport-google-oauth20').Strategy;

//cookie is created
passport.serializeUser((user, done) => {
	done(null, user.id);
});

//cookie is used to fetch user
passport.deserializeUser(async (id, done) => {
	const user = await User.findById(id);
	done(null, user);
});

passport.use(new GoogleStrategy(
	{
		clientID: process.env.GOOGLE_CLIENT_ID,
		clientSecret: process.env.GOOGLE_CLIENT_SECRET,
		callbackURL: '/auth/google/redirect',
		scope: ['profile'],
	},
	async (accessToken, refreshToken, profile, done) => {
		let user = await User.findOneAndUpdate(
			{ authId: profile.id },
			{
				name: profile.name.givenName,
				avatar: profile.photos[0].value,
			}
		);
		if (!user) {
			user = await new User({
				authId: profile.id,
				name: profile.name.givenName,
				avatar: profile.photos[0].value,
				canvas: null,
			}).save();
		}	
		done(null, user);
	}
));

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
				{ authId: profile.id },
				{
					//in case they update their discord profile
					name: profile.global_name ? profile.global_name : profile.username,
					avatar: `https://cdn.discordapp.com/avatars/${profile.id}/${profile.avatar}.png`,
				}
			);
			if (!user) {
				user = await new User({
					authId: profile.id,
					name: profile.global_name ? profile.global_name : profile.username,
					avatar: `https://cdn.discordapp.com/avatars/${profile.id}/${profile.avatar}.png`,
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
			authId: req.user.authId,
			name: req.user.name,
			avatar: req.user.avatar,
			isAuthorized:
				activeCanvases[canvasName].authorizedUsers.length === 0 ||
				activeCanvases[canvasName].authorizedUsers.includes(req.user.authId),
			isOwner: req.user.canvas === canvasName,
		};
	}

	res.render('canvas', { user: canvasUser, canvasName: canvasName });
});

app.get('/auth/google', passport.authenticate('google'));
app.get('/auth/discord', passport.authenticate('discord'));
app.get('/canvas/:canvasName/auth/google', setRoomRedirect, passport.authenticate('google'));
app.get('/canvas/:canvasName/auth/discord', setRoomRedirect, passport.authenticate('discord'));

//authenticated, need middleware that uses code from response to fetch profile info
app.get('/auth/google/redirect', passport.authenticate('google', { keepSessionInfo: true }), (req, res) => {
	if (req.session.redirectTo) {
		res.redirect('/canvas/' + req.session.redirectTo);
	} else {
		res.redirect('/');
	}
});

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
			authorizedUsers: [req.user.authId],
		}).save();
		await User.findOneAndUpdate({ id: req.user.authId }, { canvas: canvasName });
		console.log(`Canvas ${canvasName} created by ${req.user.name}`);
		res.status(201).json({ canvas: canvasName });
	} catch (err) {
		return next(err);
	}
});

exports.httpServer = httpServer;
exports.sessionMiddleware = sessionMiddleware;
exports.getCanvas = (canvasName) => {
	return activeCanvases[canvasName];
}
exports.deleteCanvas = (canvasName) => {
	delete activeCanvases[canvasName];
}

const { initSocket } = require('./socket');
initSocket();