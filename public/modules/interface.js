import { COLORS, requestUndo } from './canvas.js';
import { addChatListeners } from './chat.js';

let currentTool = 'pan';
let selectedColorDiv;

function buildPalette() {
	for (let i = 0; i < COLORS.length; i++) {
		const color = document.createElement('div');
		color.dataset.colorIndex = i;
		color.style.backgroundColor = '#' + COLORS[i];
		document.querySelector('.palette').appendChild(color);
	}
	selectedColorDiv = document.querySelector(
		`.palette > div[data-color-index="${Math.floor(Math.random() * COLORS.length)}"]`
	);
	selectedColorDiv.classList.add('selected');

	const white = document.querySelector(`.palette > div[data-color-index="${COLORS.length - 1}"`);
	white.style.outline = '1px rgb(200, 200, 200) solid';
	white.style.outlineOffset = '-1px';
}

function buildDrawIndicatorAnimations() {
	const styleElement = document.createElement('style');
	for (let i = 0; i < COLORS.length; i++) {
		const keyframes = `
		@keyframes ColorOutline${i} {
			from { outline: 4px solid #${COLORS[i]}; }	
			to { outline: 0px solid transparent; }
		}`;
		styleElement.innerHTML += keyframes;
	}
	document.head.appendChild(styleElement);
}

export function getCurrentTool() {
	return currentTool;
}

export function getSelectedColor() {
	return selectedColorDiv;
}

export function showDisconnectOverlay() {
	document.querySelector('.disconnected-overlay').classList.add('visible');
}

export function hideDisconnectOverlay() {
	document.querySelector('.disconnected-overlay').classList.remove('visible');
}

function getUserDiv(user) {
	const userDiv = document.createElement('div');
	userDiv.classList.add('user');
	userDiv.dataset.id = user.discordId;
	userDiv.innerHTML = `
        <div class="user-icon" style="background-image: url(https://cdn.discordapp.com/avatars/${user.discordId}/${user.avatar}.png)"></div>
        <div class="name${!user.hasOwnProperty('isAuthorized') || user.isAuthorized ? '' : ' unauthorized'}">${user.name}</div>
     `;

	return userDiv;
}

export function showLoggedInInterface(user) {
	document.querySelector('.login').style.display = 'none';
	document.querySelector('.users').style.display = 'flex';
	document.querySelector('.chat').style.display = 'flex';
	if (user.isAuthorized) {
		document.querySelector('.top-left').style.display = 'flex';
		document.querySelector('.grid').style.display = 'flex'; //temporary
	}
}

export function updateUsersList(users) {
	const userList = document.querySelector('.users');
	userList.innerHTML = '';
	users.forEach((user) => userList.appendChild(getUserDiv(user)));
}

export function showDrawIndicator(user, colorIndex) {
	let userIcon = document.querySelector(`.users > .user[data-id="${user.discordId}"] > .user-icon`);

	userIcon.style.animation = '';
	void userIcon.offsetWidth; //triggers reeanimation
	userIcon.style.animation = `ColorOutline${colorIndex} 1.5s`;
}

export function showPixelPlacer(user) {
	document.querySelector('.pixel-placer').innerHTML = '';
	if (user) {
		document.querySelector('.pixel-placer').appendChild(getUserDiv(user));
	}
}

function onIdentifySelect(e) {
	e.preventDefault();
	currentTool = 'identify';
	document.querySelector('.identify').classList.add('selected');
	document.querySelector('.pan').classList.remove('selected');
	document.querySelector('.brush').classList.remove('selected');
	document.querySelector('.palette').classList.remove('shown');
	document.querySelector('.placeholder').style.display = 'block';
	document.querySelector('.placeholder').style.outlineColor = `rgb(35, 35, 35)`;

	document.querySelector('.chat').style.transform = 'none';
}

function onBrushSelect(e) {
	e.preventDefault();
	currentTool = 'brush';
	document.querySelector('.identify').classList.remove('selected');
	document.querySelector('.pan').classList.remove('selected');
	document.querySelector('.brush').classList.add('selected');
	document.querySelector('.palette').classList.add('shown');
	document.querySelector('.pixel-placer').innerHTML = '';
	document.querySelector('.placeholder').style.display = 'block';
	document.querySelector('.placeholder').style.outlineColor = selectedColorDiv.style.backgroundColor;

	//TODO different solution;
	document.querySelector('.chat').style.transform = `translate(0px, ${-document.querySelector('.palette')
		.clientHeight}px)`;
}

function onPanSelect(e) {
	e.preventDefault();
	currentTool = 'pan';
	document.querySelector('.identify').classList.remove('selected');
	document.querySelector('.pan').classList.add('selected');
	document.querySelector('.brush').classList.remove('selected');
	document.querySelector('.palette').classList.remove('shown');
	document.querySelector('.pixel-placer').innerHTML = '';
	document.querySelector('.placeholder').style.display = 'none';

	document.querySelector('.chat').style.transform = 'none';
}

function addInterfaceListeners() {
	document.querySelector('.identify').addEventListener('touchstart', onIdentifySelect);
	document.querySelector('.identify').addEventListener('click', onIdentifySelect);
	document.querySelector('.brush').addEventListener('touchstart', onBrushSelect);
	document.querySelector('.brush').addEventListener('click', onBrushSelect);
	document.querySelector('.pan').addEventListener('touchstart', onPanSelect);
	document.querySelector('.pan').addEventListener('click', onPanSelect);

	document.addEventListener('contextmenu', (e) => e.preventDefault());

	document.querySelector('.login').addEventListener('click', (e) => {
		e.preventDefault();
		window.location.href += '/auth';
	});
	document.querySelector('.login').addEventListener('touchstart', (e) => {
		e.preventDefault();
		window.location.href += '/auth';
	});

	document.querySelector('.grid').addEventListener('click', onGridToggle);
	document.querySelector('.grid').addEventListener('touchstart', onGridToggle);

	document.querySelectorAll('.palette > div').forEach((color) => {
		color.addEventListener('click', onColorSelect);
		color.addEventListener('touchstart', onColorSelect);
	});

	addChatListeners();

	addUndoListeners();
}

function onGridToggle(e) {
	e.preventDefault();
	if (document.querySelector('.grid').classList.contains('selected')) {
		document.querySelector('.pixel-grid').style.display = 'none';
	} else {
		document.querySelector('.pixel-grid').style.display = 'block';
	}
	document.querySelector('.grid').classList.toggle('selected');
}

function onColorSelect(e) {
	e.preventDefault();
	document.querySelector('.placeholder').style.outlineColor = e.target.style.backgroundColor;
	selectedColorDiv.classList.remove('selected');
	selectedColorDiv = e.target;
	selectedColorDiv.classList.add('selected');
}

function addUndoListeners() {
	let undoIntervalId;
	document.querySelector('.undo').addEventListener('touchstart', (e) => {
		e.preventDefault();
		requestUndo();
		undoIntervalId = setInterval(() => {
			onRequestUndo(e);
		}, 100);
	});
	document.querySelector('.undo').addEventListener('touchend', (e) => {
		e.preventDefault();
		clearInterval(undoIntervalId);
	});

	document.querySelector('.undo').addEventListener('click', requestUndo);
	document.addEventListener('keydown', (e) => {
		if (e.ctrlKey && e.code === 'KeyZ') {
			requestUndo();
		}
	});
}

export function initInterface() {
	buildPalette();
	buildDrawIndicatorAnimations();
	addInterfaceListeners();
}