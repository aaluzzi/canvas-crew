import { getCurrentTool, getSelectedColor, showDrawIndicator, showPixelPlacer } from './interface.js';
import { emitBrushDraw, emitPencilDraw, emitUndo } from './socket.js';

export const COLORS = ['6d001a', 'be0039', 'ff4500', 'ffa800', 'ffd635', 'fff8b8', '00a368', '00cc78',
    '7eed56', '00756f', '009eaa', '00ccc0', '2450a4', '3690ea', '51e9f4', '493ac1',
    '6a5cff', '94b3ff', '811e9f', 'b44ac0', 'e4abff', 'de107f', 'ff3881', 'ff99aa',
    '6d482f', '9c6926', 'ffb470', '000000', '515252', '898d90', 'd4d7d9', 'ffffff'];

let c = document.querySelector('canvas');
let translation = { x: 0, y: 0 };
let scale = 1;
let baseWidth = c.clientWidth;
let baseHeight = c.clientHeight;

let pixels;
let pixelPlacers;
let clientUser;

const contributedUsersMap = new Map();
const undoList = [];

let placeholder = { x: 0, y: 0 };

export function setClientUser(user) {
	clientUser = user;
	contributedUsersMap.set(user.discordId, user);
}

export function getClientUser() {
	return clientUser;
}

export function initCanvas(pixelData, pixelPlacersData, contributedUsersData) {
	pixels = pixelData;
	pixelPlacers = pixelPlacersData;
	contributedUsersData.forEach((user) => {
		contributedUsersMap.set(user.discordId, user);
	});
	c.height = pixels.length;
	c.width = pixels[0].length;
	setScale(1);

	for (let x = 0; x < pixels.length; x++) {
		for (let y = 0; y < pixels[x].length; y++) {
			drawPixel(x, y, pixels[x][y]);
		}
	}

	addMouseListeners();
	addTouchListeners();
}

export function onUserUndo(x, y, colorIndex, user) {
	placePixel(x, y, colorIndex, user ? user : { discordId: null });
}

export function onUserPencilDraw(x, y, colorIndex, user) {
	placePixel(x, y, colorIndex, user);
	if (!contributedUsersMap.has(user.discordId)) {
		contributedUsersMap.set(user.discordId, user);
	}
	showDrawIndicator(user, colorIndex);
}

export function onUserBrushDraw(x, y, colorIndex, user) {
	onUserPencilDraw(x, y, colorIndex, user);

	if (x > 0) {
		placePixel(x - 1, y, colorIndex, user);
	}
	if (x < pixels[x].length - 1) {
		placePixel(x + 1, y, colorIndex, user);
	}
	if (y > 0) {
		placePixel(x, y - 1, colorIndex, user);
	}
	if (y < pixels.length - 1) {
		placePixel(x, y + 1, colorIndex, user);
	}
}

function setTranslation(x, y) {
	let maxHorizontal = c.clientWidth / 2;
	let maxVertical = c.clientHeight / 2;
	translation.x = Math.max(-maxHorizontal, Math.min(x, maxHorizontal));
	translation.y = Math.max(-maxVertical, Math.min(y, maxVertical));
	document.querySelector('.canvas-container').style.transform = `translate(${translation.x}px, ${translation.y}px)`;
}

function setScale(level) {
	scale = Math.max(0.5, Math.min(32, level));
	document.querySelector('.canvas-container').style.width = Math.floor(baseWidth * scale) + 'px';
	document.querySelector('.canvas-container').style.height = Math.floor(baseHeight * scale) + 'px';
	const pixelSize = c.clientWidth / c.width;
	document.querySelectorAll('.placeholder').forEach(placeholder => {
		placeholder.style.width = `${pixelSize}px`;
		placeholder.style.height = `${pixelSize}px`;
	});
	setPixelGridSize(pixelSize);
}

function setPixelGridSize(size) {
	const flooredSize = Math.floor(size);
	document.querySelector('.pixel-grid').style.backgroundSize = `${flooredSize}px ${flooredSize}px`;
	document.querySelector('.pixel-grid').style.transform = `scale(${size / flooredSize})`;
}

function placePixel(x, y, colorIndex, user) {
	pixels[x][y] = colorIndex;
	pixelPlacers[x][y] = user.discordId;
	drawPixel(x, y, colorIndex);
}

function drawPixel(x, y, colorIndex) {
	let ctx = c.getContext('2d');
	ctx.fillStyle = `#${COLORS[colorIndex]}`;
	ctx.fillRect(x, y, 1, 1);
}

function createUndoPixel(x, y) {
	return {
		x: x,
		y: y,
		prevColorIndex: pixels[x][y],
		prevDiscordId: pixelPlacers[x][y],
	};
}

function pencilDrawIfNeeded(pixel) {
	if (pixels[pixel.x][pixel.y] !== pixel.colorIndex) {
		undoList.push([createUndoPixel(pixel.x, pixel.y)]);
		document.querySelector('.undo').classList.add('selected');

		placePixel(pixel.x, pixel.y, pixel.colorIndex, clientUser);
		emitPencilDraw(pixel);
		showDrawIndicator(clientUser, pixel.colorIndex);
	}
}

function brushDrawIfNeeded(x, y, colorIndex) {
	let undoPixels = [];
	if (pixels[x][y] !== colorIndex) {
		undoPixels.push(createUndoPixel(x, y));
		placePixel(x, y, colorIndex, clientUser);
	}
	if (x > 0 && pixels[x - 1][y] !== colorIndex) {
		undoPixels.push(createUndoPixel(x - 1, y));
		placePixel(x - 1, y, colorIndex, clientUser);
	}
	if (x < pixels[x].length - 1 && pixels[x + 1][y] !== colorIndex) {
		undoPixels.push(createUndoPixel(x + 1, y));
		placePixel(x + 1, y, colorIndex, clientUser);
	}
	if (y > 0 && pixels[x][y - 1] !== colorIndex) {
		undoPixels.push(createUndoPixel(x, y - 1));
		placePixel(x, y - 1, colorIndex, clientUser);
	}
	if (y < pixels.length - 1 && pixels[x][y + 1] !== colorIndex) {
		undoPixels.push(createUndoPixel(x, y + 1));
		placePixel(x, y + 1, colorIndex, clientUser);
	}

	if (undoPixels.length > 0) {
		undoList.push(undoPixels);
		document.querySelector('.undo').classList.add('selected');
		emitBrushDraw(x, y, colorIndex);
		showDrawIndicator(clientUser, colorIndex);
	}
}

function undo() {
	const undoPixels = undoList.pop();
	undoPixels.forEach((pixel) => {
		placePixel(pixel.x, pixel.y, pixel.prevColorIndex, { discordId: pixel.prevDiscordId });
		emitUndo(pixel);
	});
}

function addMouseListeners() {
	let isDragging = false;
	let isPainting = false;
	let dragStart = { x: 0, y: 0 };
	let startTranslation = { x: 0, y: 0 };

	//Handle panning/drawing with mouse
	document.addEventListener('mousedown', (e) => {
		if (e.button === 2 || getCurrentTool() === 'pan') {
			startTranslation = { x: translation.x, y: translation.y };
			isDragging = true;
			dragStart.x = e.clientX;
			dragStart.y = e.clientY;
		}
	});
	document.addEventListener('mousemove', (e) => {
		if (isDragging) {
			setTranslation(e.clientX - dragStart.x + startTranslation.x, e.clientY - dragStart.y + startTranslation.y);
		}
	});
	document.addEventListener('mouseup', (e) => {
		isDragging = false;
		isPainting = false;
	});
	document.addEventListener('wheel', (e) => {
		let prevScale = scale;
		if (Math.sign(e.deltaY) === -1) {
			setScale(scale * 2);
		} else {
			setScale(scale / 2);
		}
		let canvasMidpoint = c.clientWidth / 2;
		//get distance from center, then correct based on how much the Scale will change the screen
		setTranslation(
			translation.x + ((canvasMidpoint - e.offsetX) / prevScale) * (scale - prevScale),
			translation.y + ((canvasMidpoint - e.offsetY) / prevScale) * (scale - prevScale)
		);
		translatePlaceholder();
	});

	c.addEventListener('mousedown', (e) => {
		if (e.button !== 2 && (getCurrentTool() === 'pencil' || getCurrentTool() === 'brush')) {
			isPainting = true;
			onMouseDraw(e);
		}
	});
	c.addEventListener('mousemove', (e) => {
		if (isPainting) {
			onMouseDraw(e);
		} else if (getCurrentTool() === 'identify') {
			onIdentify(e);
		}
		if (getCurrentTool() !== 'pan') {
			setPlaceholderCoords(e);
			translatePlaceholder();
		}
	});
}

function onMouseDraw(e) {
	let pixel = {
		x: Math.floor(e.offsetX / (c.clientWidth / c.width)),
		y: Math.floor(e.offsetY / (c.clientHeight / c.height)),
		colorIndex: +getSelectedColor().dataset.colorIndex,
	};
	if (getCurrentTool() === 'pencil') {
		pencilDrawIfNeeded(pixel);
	} else if (getCurrentTool() === 'brush') {
		brushDrawIfNeeded(pixel.x, pixel.y, pixel.colorIndex);
	}
}

function onIdentify(e) {
	const x = Math.floor(e.offsetX / (c.clientWidth / c.width));
	const y = Math.floor(e.offsetY / (c.clientHeight / c.height));
	showPixelPlacer(contributedUsersMap.get(pixelPlacers[x][y]));
}

function setPlaceholderCoords(e) {
	placeholder.x = Math.floor(e.offsetX / (c.clientWidth / c.width));
	placeholder.y = Math.floor(e.offsetY / (c.clientHeight / c.height));
}

function translatePlaceholder() {
	const pixelSize = c.clientWidth / c.width;
	document.querySelector('.placeholder.middle').style.transform = `translate(${placeholder.x * pixelSize}px, ${
		placeholder.y * pixelSize
	}px)`;
	document.querySelector('.placeholder.top').style.transform = `translate(${placeholder.x * pixelSize}px, ${
		(placeholder.y - 1) * pixelSize
	}px)`;
	document.querySelector('.placeholder.left').style.transform = `translate(${(placeholder.x - 1) * pixelSize}px, ${
		placeholder.y * pixelSize
	}px)`;
	document.querySelector('.placeholder.right').style.transform = `translate(${(placeholder.x + 1) * pixelSize}px, ${
		placeholder.y * pixelSize
	}px)`;
	document.querySelector('.placeholder.bottom').style.transform = `translate(${placeholder.x * pixelSize}px, ${
		(placeholder.y + 1) * pixelSize
	}px)`;
}

export function changePlaceholderColor(color) {
	document.querySelectorAll('.placeholder').forEach(placeholder => {
		placeholder.style.borderColor = color;
	});
}

export function showPencilPlaceholder(color) {
	hidePlaceholder();
	document.querySelector('.placeholder.middle').style.display = 'block';
	document.querySelector('.placeholder.middle').style.borderColor = color;
}

export function showBrushPlaceholder(color) {
	document.querySelectorAll('.placeholder').forEach(placeholder => {
		placeholder.style.display = 'block';
		placeholder.style.borderColor = color;
	});
}

export function hidePlaceholder() {
	document.querySelectorAll('.placeholder').forEach(placeholder => {
		placeholder.style.display = 'none';
	})
}


function getCanvasPixelFromTouch(touch) {
	let bcr = c.getBoundingClientRect();
	let offsetX = touch.clientX - bcr.x;
	let offsetY = touch.clientY - bcr.y;
	let pixelX = Math.floor(offsetX / (bcr.width / c.width));
	let pixelY = Math.floor(offsetY / (bcr.height / c.height));
	return { x: pixelX, y: pixelY, colorIndex: getSelectedColor().dataset.colorIndex };
}

function addTouchListeners() {
	//Handle panning/brush with touch
	let touch1 = null;
	let touch2 = null;
	let startTranslation = { x: 0, y: 0 };
	let startPinchDistance = 0;
	let startScale = scale;
	document.addEventListener('touchstart', (e) => {
		e.preventDefault();
		if (getCurrentTool() === 'pan') {
			touch1 = e.touches[0];
			if (e.touches.length === 2) {
				touch2 = e.touches[1];
				startScale = scale;
				startPinchDistance = Math.hypot(
					e.touches[0].screenX - e.touches[1].screenX,
					e.touches[0].screenY - e.touches[1].screenY
				);
				startTranslation = { x: translation.x, y: translation.y };
			}
		}
	});
	document.addEventListener('touchmove', (e) => {
		e.preventDefault();
		if (getCurrentTool() === 'pan') {
			if (e.touches.length === 2) {
				const pinchDistance = Math.hypot(
					e.touches[0].screenX - e.touches[1].screenX,
					e.touches[0].screenY - e.touches[1].screenY
				);
				setScale((pinchDistance / startPinchDistance) * startScale);
				setTranslation(startTranslation.x * (scale / startScale), startTranslation.y * (scale / startScale));

				touch2 = e.touches[1];
			} else if (e.touches.length === 1) {
				setTranslation(
					translation.x + e.touches[0].clientX - touch1.clientX,
					translation.y + e.touches[0].clientY - touch1.clientY
				);
			}
			touch1 = e.touches[0];
		}
	});
	document.addEventListener('touchend', (e) => {
		e.preventDefault();
		if (
			getCurrentTool() === 'pan' &&
			e.changedTouches.length === 1 &&
			e.changedTouches[0].identifier === touch1.identifier
		) {
			touch1 = touch2; //fixes possible canvas mistranslation when switching from 2 touches to 1 touch
		}
	});
	c.addEventListener('touchstart', (e) => {
		e.preventDefault();
		if (getCurrentTool() === 'pencil') {
			for (const touch of e.touches) {
				pencilDrawIfNeeded(getCanvasPixelFromTouch(touch));
			}
		} else if (getCurrentTool() === 'brush') {
			for (const touch of e.touches) {
				const pixel = getCanvasPixelFromTouch(touch);
				brushDrawIfNeeded(pixel.x, pixel.y, pixel.colorIndex);
			}
		} else if (getCurrentTool() === 'identify' && e.touches.length === 1) {
			let pixel = getCanvasPixelFromTouch(e.touches[0]);
			showPixelPlacer(contributedUsersMap.get(pixelPlacers[pixel.x][pixel.y]));
			placeholder.x = pixel.x;
			placeholder.y = pixel.y;
			translatePlaceholder();
		}
	});
	c.addEventListener('touchmove', (e) => {
		e.preventDefault();
		if (getCurrentTool() === 'pencil') {
			for (const touch of e.touches) {
				pencilDrawIfNeeded(getCanvasPixelFromTouch(touch));
			}
		} else if (getCurrentTool() === 'brush') {
			for (const touch of e.touches) {
				const pixel = getCanvasPixelFromTouch(touch);
				brushDrawIfNeeded(pixel.x, pixel.y, pixel.colorIndex);
			}
		} else if (getCurrentTool() === 'identify' && e.touches.length === 1) {
			let pixel = getCanvasPixelFromTouch(e.touches[0]);
			showPixelPlacer(contributedUsersMap.get(pixelPlacers[pixel.x][pixel.y]));
			placeholder.x = pixel.x;
			placeholder.y = pixel.y;
			translatePlaceholder();
		}
	});
}

export function requestUndo() {
	if (undoList.length > 0) {
		undo();
		if (undoList.length === 0) {
			document.querySelector('.undo').classList.remove('selected');
		}
	}
}
