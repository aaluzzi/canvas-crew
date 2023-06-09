const socket = io();

//Handle sessions and socket connection
const room = window.location.href.split("/").at(-1);
if (localStorage.getItem("sessionID")) {
    socket.auth = {roomID: room, sessionID: localStorage.getItem("sessionID")}
} else {
    socket.auth = {roomID: room};
}
socket.connect();
socket.on('session', sessionID => {
    socket.auth = { sessionID };
    localStorage.setItem('sessionID', sessionID);
});
socket.on('connected-count', count => {
    document.querySelector(".count").textContent = count;
});

let c = document.querySelector('canvas');
let ctx = c.getContext('2d');

const COLORS = ['6d001a', 'be0039', 'ff4500', 'ffa800', 'ffd635', '7eed56',
    '00a368', '009eaa', '51e9f4', '3690ea', '2450a4', '493ac1',
    '811e9f', 'b44ac0', 'e4abff', 'ff3881', 'ff99aa', 'ffb470',
    '9c6926', '6d482f', '000000', '515252', '9ca0a3', 'ffffff'];
let pixels;
const undoList = []

//Handle loading and changing colors
let currentColor;
function buildPalette() {
    for (let i = 0; i < COLORS.length; i++) {
        const color = document.createElement('div');
        color.dataset.colorIndex = i;
        color.style.backgroundColor = "#" + COLORS[i];
        document.querySelector(".palette").appendChild(color);
    }
    currentColor = document.querySelector(`.palette > div[data-color-index="${Math.floor(Math.random() * COLORS.length)}"]`);
    currentColor.classList.add('selected');

    const white = document.querySelector(`.palette > div[data-color-index="${COLORS.length - 1}"`);
    white.style.outline = "1px rgb(200, 200, 200) solid";
    white.style.outlineOffset = "-1px";
}
buildPalette();

document.querySelectorAll(".palette > div").forEach(color => {
    color.addEventListener('click', onColorSelect);
    color.addEventListener('touchstart', onColorSelect);
});

function onColorSelect(e) {
    e.preventDefault();
    currentColor.classList.remove("selected");
    e.target.classList.add("selected");
    currentColor = e.target;
}

let zoomLevel = 1;
let translation = { x: 0, y: 0 };

socket.on('load-data', data => {
    console.log("Loading pixel data");
    pixels = data;
    c.height = pixels.length;
    c.width = pixels[0].length;

    for (let x = 0; x < pixels.length; x++) {
        for (let y = 0; y < pixels[x].length; y++) {
            drawPixel(x, y, pixels[x][y]);
        }
    }
});

socket.on('connect', () => {
    document.querySelector(".disconnected-overlay").classList.remove("visible");
});
socket.on('disconnect', () => {
    document.querySelector(".disconnected-overlay").classList.add("visible");
});

//Handle mouse panning
let isDragging = false;
let dragStart = { x: 0, y: 0 };
let startTranslation = {x : 0, y: 0};

function updateCanvasTransform() {
    c.style.transform = `translate(${translation.x}px, ${translation.y}px) scale(${zoomLevel})`;
}

document.addEventListener('mousedown', e => {
    if (e.button === 2 || currentTool === 'pan') {
        startTranslation = {x: translation.x, y: translation.y};
        isDragging = true;
        dragStart.x = e.clientX;
        dragStart.y = e.clientY;
    }
});
document.addEventListener('mousemove', e => {
    if (isDragging) {
        setTranslation(e.clientX - dragStart.x + startTranslation.x, e.clientY - dragStart.y + startTranslation.y);
    }
});
document.addEventListener('mouseup', e => {
    isDragging = false;
    isPainting = false;
});

//Handle mouse zooming
document.addEventListener('wheel', e => {
    let prevZoom = zoomLevel;
    if (Math.sign(e.deltaY) === -1) {
        setZoom(zoomLevel * 2);
    } else {
        setZoom(zoomLevel / 2);
    }

    let canvasMidpoint = c.clientWidth / 2;
    //get distance from center, then correct based on how much the zoom will change the screen
    setTranslation(translation.x + (canvasMidpoint - e.offsetX) * (zoomLevel - prevZoom), translation.y + (canvasMidpoint - e.offsetY) * (zoomLevel - prevZoom));
});

function setZoom(level) {
    zoomLevel = Math.max(0.5, Math.min(32, level));
}

function setTranslation(x, y) {
    let maxHorizontal = (zoomLevel * c.clientWidth / window.innerWidth) * (window.innerWidth / 2);
    let maxVertical = (zoomLevel * c.clientHeight / window.innerHeight) * (window.innerHeight / 2)
    translation.x = Math.max(-maxHorizontal, Math.min(x, maxHorizontal));
    translation.y = Math.max(-maxVertical, Math.min(y, maxVertical));
    updateCanvasTransform();
}

//Handle touch panning and zooming
let currentTool = 'pan';
let touch1 = null;
let touch2 = null;
let startPinchDistance = 0;
let startZoom = zoomLevel;
document.addEventListener('touchstart', e => {
    e.preventDefault();
    if (currentTool === 'pan') {
        touch1 = e.touches[0];
        if (e.touches.length === 2) {
            touch2 = e.touches[1];
            startZoom = zoomLevel;
            startPinchDistance = Math.hypot(e.touches[0].screenX - e.touches[1].screenX, e.touches[0].screenY - e.touches[1].screenY);
            startTranslation = {x: translation.x, y: translation.y};
        }
    }
});
document.addEventListener('touchmove', e => {
    e.preventDefault();
    if (currentTool === 'pan') {
        if (e.touches.length === 2) {
            const pinchDistance = Math.hypot(e.touches[0].screenX - e.touches[1].screenX, e.touches[0].screenY - e.touches[1].screenY);
            setZoom((pinchDistance / startPinchDistance) * startZoom);
            setTranslation(startTranslation.x * (zoomLevel / startZoom), startTranslation.y * (zoomLevel / startZoom));
           
            touch2 = e.touches[1];
        } else if (e.touches.length === 1) {
            setTranslation(translation.x + e.touches[0].clientX - touch1.clientX, translation.y + e.touches[0].clientY - touch1.clientY);
        }
        touch1 = e.touches[0];
    }
});
document.addEventListener('touchend', e => {
    e.preventDefault();
    if (currentTool === 'pan' && e.changedTouches.length === 1 && e.changedTouches[0].identifier === touch1.identifier) {
        touch1 = touch2; //fixes possible canvas mistranslation when switching from 2 touches to 1 touch
    }
});

//Handle touch drawing
c.addEventListener('touchstart', e => {
    e.preventDefault();
    if (currentTool === 'brush') {
        for (const touch of e.touches) {
            drawPixelIfNeeded(getCanvasPixelFromTouch(touch));
        }
    }
});
c.addEventListener('touchmove', e => {
    e.preventDefault();
    if (currentTool === 'brush') {
        for (const touch of e.touches) {
            drawPixelIfNeeded(getCanvasPixelFromTouch(touch));
        }
    }
});

function getCanvasPixelFromTouch(touch) {
    let bcr = c.getBoundingClientRect();
    let offsetX = touch.clientX - bcr.x;
    let offsetY = touch.clientY - bcr.y;
    let pixelX = Math.floor(offsetX / (bcr.width / c.width));
    let pixelY = Math.floor(offsetY / (bcr.height / c.height));
    return { x: pixelX, y: pixelY, colorIndex: currentColor.dataset.colorIndex};
}

function drawPixelIfNeeded(pixel, undo) {
    if (pixels[pixel.x][pixel.y] !== pixel.colorIndex) {
        if (!undo) {
            undoList.push({
                x: pixel.x,
                y: pixel.y,
                colorIndex: pixels[pixel.x][pixel.y],
            });
            document.querySelector(".undo").classList.add("selected");
        }

        pixels[pixel.x][pixel.y] = pixel.colorIndex;
        drawPixel(pixel.x, pixel.y, pixel.colorIndex);
        socket.emit("draw", pixel.x, pixel.y, pixel.colorIndex);
    }
}

//Handle undo
function onRequestUndo(e) {
    e.preventDefault();
    if (undoList.length > 0) {
        drawPixelIfNeeded(undoList.pop(), true);
        if (undoList.length === 0) {
            document.querySelector(".undo").classList.remove("selected");
        }
    }
}

let undoIntervalId;
document.querySelector(".undo").addEventListener("touchstart", e => {
    onRequestUndo(e);
    undoIntervalId = setInterval(() => {
        onRequestUndo(e);
    }, 100);
});
document.querySelector(".undo").addEventListener("touchend", () => clearInterval(undoIntervalId));
document.querySelector(".undo").addEventListener("click", onRequestUndo);
document.addEventListener('keydown', e => {
    if (e.ctrlKey && e.code === 'KeyZ') {
      onRequestUndo(e);
    }
});

//Handle mouse drawing
let isPainting = false;
c.addEventListener("mousedown", e => {
    if (e.button === 2 || currentTool !== 'brush') return;
    isPainting = true;
    let pixel = { 
        x: Math.floor(e.offsetX / (c.clientWidth / c.width)), 
        y: Math.floor(e.offsetY / (c.clientHeight / c.height)), 
        colorIndex: currentColor.dataset.colorIndex,
    };
    drawPixelIfNeeded(pixel);
});
c.addEventListener("mousemove", e => {
    if (!isPainting) return;
    let pixel = { 
        x: Math.floor(e.offsetX / (c.clientWidth / c.width)), 
        y: Math.floor(e.offsetY / (c.clientHeight / c.height)), 
        colorIndex: currentColor.dataset.colorIndex,
    };
    drawPixelIfNeeded(pixel);
});

socket.on('draw', (x, y, colorIndex) => {
    console.log("received draw");
    pixels[x][y] = colorIndex;
    drawPixel(x, y, colorIndex);
});

function drawPixel(x, y, colorIndex) {
    ctx.fillStyle = `#${COLORS[colorIndex]}`;
    ctx.fillRect(x, y, 1, 1);
}

function onBrushSelect(e) {
    e.preventDefault();
    currentTool = 'brush';
    document.querySelector(".brush").classList.add('selected');
    document.querySelector(".pan").classList.remove('selected');
    document.querySelector(".palette").classList.add("shown");
}

function onPanSelect(e) {
    e.preventDefault();
    currentTool = 'pan';
    document.querySelector(".pan").classList.add('selected');
    document.querySelector(".brush").classList.remove('selected');
    document.querySelector(".palette").classList.remove("shown");
}

document.querySelector('.brush').addEventListener('touchstart', onBrushSelect);
document.querySelector('.brush').addEventListener('click', onBrushSelect);

document.querySelector('.pan').addEventListener('touchstart', onPanSelect);
document.querySelector('.pan').addEventListener('click', onPanSelect);

document.addEventListener("contextmenu", e => e.preventDefault());