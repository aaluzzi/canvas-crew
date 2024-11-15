import { hideDisconnectOverlay, showDisconnectOverlay, showAuthorizedInterface, hideAuthorizedInterface, updateUsersList } from './interface.js';
import { initCanvas, onUserBrushDraw, onUserPencilDraw, onUserUndo } from './canvas.js';
import { clearChatMessages, showChatMessage } from './chat.js';

let socket;

export function initSocket() {
	socket = io();
	const room = window.location.href.split('/').at(-1);
	socket.auth = { roomId: room };
	socket.connect();
	
	socket.on('connected-users', updateUsersList);

	socket.on('load-data', initCanvas);
	socket.on('pencil-draw', onUserPencilDraw);
	socket.on('brush-draw', onUserBrushDraw);

	socket.on('receive-undo', onUserUndo);

	socket.on('load-messages', (messages) => {
        clearChatMessages();
		messages.forEach((message) => {
			showChatMessage(message.user, message.message);
		});
	});
	socket.on('receive-message', showChatMessage);

	socket.on('connect', hideDisconnectOverlay);
	socket.on('disconnect', showDisconnectOverlay);

	socket.on('user-authorized', showAuthorizedInterface);
	socket.on('user-deauthorized', hideAuthorizedInterface);
}

export function emitPencilDraw(pixel) {
	socket.emit('pencil-draw', pixel.x, pixel.y, pixel.colorIndex);
}

export function emitBrushDraw(x, y, colorIndex) {
	socket.emit('brush-draw', x, y, colorIndex);
}

export function emitUndo(pixel) {
	socket.emit('send-undo', pixel.x, pixel.y, pixel.prevColorIndex, pixel.prevauthId);
}

export function emitChatMessage(message) {
	socket.emit('send-message', message);
}

export function authorizeUser(user) {
	socket.emit('authorize-user', user.authId)
}

export function deauthorizeUser(user) {
	socket.emit('deauthorize-user', user.authId)
}
