import { getClientUser } from './canvas.js';
import { emitChatMessage } from './socket.js';

export function addChatListeners() {
	document.querySelector('.chat').addEventListener('click', openChat);
	document.querySelector('.chat').addEventListener('touchstart', (e) => {
		e.preventDefault();
		openChat();
	});

	document.querySelector('.close').addEventListener('click', closeChat);
	document.querySelector('.close').addEventListener('touchstart', (e) => {
		e.preventDefault();
		closeChat();
	});

	document.querySelector('.message-input').addEventListener('keydown', (e) => {
		if ((e.key === 'Enter' || e.keyCode === 13) && e.target.value.trim().length > 0) {
			onMessageEnter(e.target.value.trim());
			e.target.blur();
			e.target.value = '';
		}
	});

	document.querySelector('.message-input').addEventListener('touchstart', (e) => {
		e.stopPropagation(); //prevent pan
		e.target.focus();
	});

	document.querySelector('.chat-panel').addEventListener('touchstart', (e) => {
		document.querySelector('.message-input').blur();
	});
	document.querySelector('.chat-panel').addEventListener('touchmove', (e) => {
		e.stopPropagation(); //prevent pan
	});
	document.querySelector('.chat-panel').addEventListener('mousemove', (e) => {
		e.stopPropagation(); //prevent pan
	});
	document.querySelector('.chat-panel').addEventListener('mousewheel', (e) => {
		e.stopPropagation(); //prevent zoom
	});
}

export function showChatMessage(user, message) {
	const messageDiv = getMessageDiv(user, message);
	document.querySelector('.messages').appendChild(messageDiv);
}

function onMessageEnter(message) {
	showChatMessage(getClientUser(), message);
	emitChatMessage(message);
}

function getMessageDiv(user, message) {
	const messageDiv = document.createElement('div');
	messageDiv.className = 'message';

	messageDiv.innerHTML = `
    <div class="user-icon" style="background-image: url(https://cdn.discordapp.com/avatars/${user.discordId}/${user.avatar}.png)"></div>
    <div>
        <div class="user">${user.name}</div>
        <div class="content">${message}</div>
    </div>
    `;

	return messageDiv;
}

function openChat() {
	document.querySelector('.chat-panel').classList.add('shown');
}

function closeChat() {
	document.querySelector('.chat-panel').classList.remove('shown');
}
