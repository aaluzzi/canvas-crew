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
	document.querySelector('.login').classList.add('hidden');
	document.querySelector('.users').classList.remove('hidden');
	document.querySelector('.chat').classList.remove('hidden');
	if (user.isAuthorized) {
		document.querySelector('.top-left').classList.remove('hidden')
		document.querySelector('.grid').classList.remove('hidden');
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

function showPalette() {
	document.querySelector('.palette').classList.add('shown');
	const moveAmount = document.querySelector('.palette').clientHeight;
	document.querySelector('.grid').style.transform = 
		`translate(0px, ${-moveAmount}px)`;
	document.querySelector('.chat').style.transform = 
		`translate(0px, ${-moveAmount}px)`;
}

function hidePalette() {
	document.querySelector('.palette').classList.remove('shown');
	document.querySelector('.grid').style.transform = '';
	document.querySelector('.chat').style.transform = '';
}

function onIdentifySelect(e) {
	e.preventDefault();
	currentTool = 'identify';
	document.querySelector('.identify').classList.add('selected');
	document.querySelector('.pan').classList.remove('selected');
	document.querySelector('.brush').classList.remove('selected');
	hidePalette();
	document.querySelector('.placeholder').style.display = 'block';
	document.querySelector('.placeholder').style.outlineColor = `rgb(35, 35, 35)`;
}

function onBrushSelect(e) {
	e.preventDefault();
	currentTool = 'brush';
	document.querySelector('.identify').classList.remove('selected');
	document.querySelector('.pan').classList.remove('selected');
	document.querySelector('.brush').classList.add('selected');
	showPalette();
	document.querySelector('.pixel-placer').innerHTML = '';
	document.querySelector('.placeholder').style.display = 'block';
	document.querySelector('.placeholder').style.outlineColor = selectedColorDiv.style.backgroundColor;
}

function onPanSelect(e) {
	e.preventDefault();
	currentTool = 'pan';
	document.querySelector('.identify').classList.remove('selected');
	document.querySelector('.pan').classList.add('selected');
	document.querySelector('.brush').classList.remove('selected');
	hidePalette();
	document.querySelector('.pixel-placer').innerHTML = '';
	document.querySelector('.placeholder').style.display = 'none';
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
