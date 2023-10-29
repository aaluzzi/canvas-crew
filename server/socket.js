const { httpServer, sessionMiddleware, getCanvas, deleteCanvas } = require('./server');
const passport = require('passport');

const { Server } = require('socket.io');
const io = new Server(httpServer);

exports.initSocket = () => {
	//taken from official socket.io example
	const wrap = (middleware) => (socket, next) => middleware(socket.request, {}, next);

	io.use(wrap(sessionMiddleware));
	io.use(wrap(passport.initialize()));
	io.use(wrap(passport.session()));

	io.on('connection', (client) => {
		if (!getCanvas(client.handshake.auth.roomId.toLowerCase())) return;
		client.roomId = client.handshake.auth.roomId.toLowerCase();
		const canvas = getCanvas(client.roomId);

		io.to(client.id).emit('load-data', canvas.pixels, canvas.pixelPlacers, [...canvas.contributedUsersMap.values()]);

		if (client.request.user) {
			client.join(client.roomId);
			client.user = {
				discordId: client.request.user.discordId,
				name: client.request.user.name,
				avatar: client.request.user.avatar,
				isOwner: client.request.user.canvas === canvas.name,
				//if authorized set is empty, authorize everyone
				isAuthorized:
					canvas.authorizedUsers.length === 0 || canvas.authorizedUsers.includes(client.request.user.discordId),
			};

			io.to(client.id).emit('load-messages', canvas.chatMessages);

			canvas.connectedUsers.set(client.user.discordId, client.user);
			console.log(client.user.name + ' joined canvas ' + client.roomId);

			io.in(client.roomId).emit('connected-users', Array.from(canvas.connectedUsers.values()));

			//Now have to check authorization on each event fire since owner can change authorization while connected
			client.on('pencil-draw', (x, y, colorIndex) => {
				if (canvas.connectedUsers.get(client.user.discordId).isAuthorized && canvas.isValidDraw(x, y, colorIndex)) {
					client.to(client.roomId).emit('pencil-draw', x, y, +colorIndex, client.user);
					canvas.placePixel(x, y, +colorIndex, client.user);
				}
			});

			client.on('brush-draw', (x, y, colorIndex) => {
				if (canvas.connectedUsers.get(client.user.discordId).isAuthorized && canvas.isValidDraw(x, y, colorIndex)) {
					client.to(client.roomId).emit('brush-draw', x, y, colorIndex, client.user);
					canvas.placePixel(x, y, +colorIndex, client.user);
					if (x > 0) {
						canvas.placePixel(x - 1, y, +colorIndex, client.user);
					}
					if (x < canvas.pixels[x].length - 1) {
						canvas.placePixel(x + 1, y, +colorIndex, client.user);
					}
					if (y > 0) {
						canvas.placePixel(x, y - 1, +colorIndex, client.user);
					}
					if (y < canvas.pixels.length - 1) {
						canvas.placePixel(x, y + 1, +colorIndex, client.user);
					}
				}
			});

			client.on('send-undo', (x, y, prevColorIndex, prevDiscordId) => {
				if (
					canvas.connectedUsers.get(client.user.discordId).isAuthorized &&
					canvas.isValidDraw(x, y, prevColorIndex) &&
					(!prevDiscordId || canvas.contributedUsersMap.has(prevDiscordId))
				) {
					canvas.pixels[x][y] = prevColorIndex;
					canvas.pixelPlacers[x][y] = prevDiscordId;
					client
						.to(client.roomId)
						.emit('receive-undo', x, y, prevColorIndex, canvas.contributedUsersMap.get(prevDiscordId));
				}
			});

			client.on(`authorize-user`, async (discordId) => {
				if (
					client.user.isOwner &&
					client.user.discordId !== discordId &&
					canvas.connectedUsers.has(discordId) &&
					!canvas.authorizedUsers.includes(discordId)
				) {
					console.log(`User ${client.user.name} authorized ${discordId}`);
					canvas.authorizeUser(discordId);
					io.in(client.roomId).emit('connected-users', Array.from(canvas.connectedUsers.values()));

					const roomSockets = await io.in(client.roomId).fetchSockets();
					const authorizedSocket = roomSockets.find((socket) => socket.user && socket.user.discordId === discordId);
					io.to(authorizedSocket.id).emit('user-authorized');
				}
			});

			client.on(`deauthorize-user`, async (discordId) => {
				if (
					client.user.isOwner &&
					client.user.discordId !== discordId &&
					canvas.connectedUsers.has(discordId) &&
					canvas.authorizedUsers.includes(discordId)
				) {
					console.log(`User ${client.user.name} deauthorized ${discordId}`);
					canvas.deauthorizeUser(discordId);
					io.in(client.roomId).emit('connected-users', Array.from(canvas.connectedUsers.values()));

					const roomSockets = await io.in(client.roomId).fetchSockets();
					const deauthorizedSocket = roomSockets.find((socket) => socket.user && socket.user.discordId === discordId);
					io.to(deauthorizedSocket.id).emit('user-deauthorized');
				}
			});

			client.on('send-message', (message) => {
				message.text = message.text.trim().substring(0, 250);
				if (message.text.length > 0) {
					canvas.chatMessages.push({ user: client.user, message: message });
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
					canvas.connectedUsers.delete(client.user.discordId);
					if (canvas.connectedUsers.size > 0) {
						client.to(client.roomId).emit('connected-users', Array.from(canvas.connectedUsers.values()));
					} else {
						console.log('Saving canvas');
						canvas.save();
						deleteCanvas(client.roomId);
					}
				}
			});
		}
	});
};
