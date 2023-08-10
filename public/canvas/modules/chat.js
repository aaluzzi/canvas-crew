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
			e.target.value = '';
		}
	});

	//Fixes positioning issue when ios pushes the entire page up on keyboard open
	window.visualViewport.addEventListener('resize', e => {
		document.querySelector('.chat-panel').style.height = `${(e.target.height - 68)}px`;
		window.scrollTo(0, 0);
	});

	document.querySelector('.message-input').addEventListener('touchstart', (e) => {
		e.stopPropagation(); //prevent pan
		e.target.focus();
	});
	document.querySelector('.chat-panel').addEventListener('touchmove', (e) => {
		e.preventDefault();
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
    if (!document.querySelector('.chat-panel').classList.contains('shown')) {
        document.querySelector('.indicator').classList.remove('hidden');
    }
    scrollMessagesToBottom();
}

export function clearChatMessages() {
    document.querySelector('.messages').innerHTML = '';
}

function scrollMessagesToBottom() {
    const messagesContainer = document.querySelector('.messages');
    messagesContainer.scrollTo({
        top: messagesContainer.scrollHeight,
        behavior: 'smooth',
    });
}

function onMessageEnter(text) {
	const message = {
		text: text,
		timestamp: new Date(),
	}
	showChatMessage(getClientUser(), message);
	emitChatMessage(message);
}

function getMessageDiv(user, message) {
	const messageDiv = document.createElement('div');
	messageDiv.className = 'message';

	messageDiv.innerHTML = `
    <div class="user-icon" style="background-image: url(https://cdn.discordapp.com/avatars/${user.discordId}/${user.avatar}.png)"></div>
    <div>
		<div class="header">
        	<div class="user">${user.name}</div>
			<div class="timestamp">${formatTime(message.timestamp)}</div>
		</div>
        <div class="content">${message.text}</div>
    </div>
    `;

	return messageDiv;
}

function formatTime(timestamp) {
	return new Date(timestamp).toLocaleTimeString([], {
		hour: 'numeric',
		minute: 'numeric',
		hour12: 'true',
	});
}

function openChat() {
	document.querySelector('.chat-panel').style.height = `${(window.visualViewport.height - 68)}px`;
	document.querySelector('.chat-panel').classList.add('shown');
    document.querySelector('.indicator').classList.add('hidden');
}

function closeChat() {
	document.querySelector('.chat-panel').classList.remove('shown');
	document.querySelector('.message-input').blur();
}
