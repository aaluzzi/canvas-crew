import { hideDisconnectOverlay, showDisconnectOverlay, showLoggedInInterface, updateUsersList } from './interface.js';
import { setClientUser, initCanvas, onUserDraw } from './canvas.js';
import { showChatMessage } from './chat.js';

let socket;

export function initSocket() {
	socket = io();
	const room = window.location.href.split('/').at(-1);
	socket.auth = { roomId: room };
	socket.connect();

	socket.on('login', (user) => {
		setClientUser(user);
		showLoggedInInterface(user);
	});

	socket.on('connected-users', updateUsersList);

	socket.on('load-data', initCanvas);
	socket.on('draw', onUserDraw);

    socket.on('receive-message', showChatMessage);

	socket.on('connect', hideDisconnectOverlay);
	socket.on('disconnect', showDisconnectOverlay);
}

export function emitPixelDraw(pixel) {
	socket.emit('draw', pixel.x, pixel.y, pixel.colorIndex);
}

export function emitChatMessage(message) {
    socket.emit('send-message', message);
}