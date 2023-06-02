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
})
socket.on('connected-count', count => {
    document.querySelector(".count").textContent = count;
})

let c = document.querySelector('canvas');
let ctx = c.getContext('2d');

let pixels;
let currentColor = document.querySelector(".palette > .selected");

//Handle changing colors
document.querySelectorAll(".palette > div").forEach(color => color.addEventListener('click', e => {
    currentColor.classList.remove("selected");
    e.target.classList.add("selected");
    currentColor = e.target;
}));

let zoomLevel = 1;

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

let translation = { x: 0, y: 0 };
//Handle mouse panning
let isDragging = false;
let dragStart = { x: 0, y: 0 };
let startTranslation = {x : 0, y: 0};
function translateCanvas(x, y) {
    c.style.transform = `translate(${x}px, ${y}px) scale(${zoomLevel})`;
}

function updateCanvasTransform() {
    c.style.transform = `translate(${translation.x}px, ${translation.y}px) scale(${zoomLevel})`;
}

document.addEventListener('mousedown', e => {
    if (e.button === 2) {
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
    setZoom(zoomLevel - Math.sign(e.deltaY) * 0.5);

    let canvasMidpoint = c.clientWidth / 2;
    //get distance from center, then correct based on how much the zoom will change the screen
    setTranslation(translation.x + (canvasMidpoint - e.offsetX) * (zoomLevel - prevZoom), translation.y + (canvasMidpoint - e.offsetY) * (zoomLevel - prevZoom));
});

function setZoom(level) {
    zoomLevel = Math.max(0.5, Math.min(9, level));
}

function setTranslation(x, y) {
    let maxHorizontal = (zoomLevel * c.clientWidth / window.innerWidth) * (window.innerWidth / 2);
    let maxVertical = (zoomLevel * c.clientHeight / window.innerHeight) * (window.innerHeight / 2)
    translation.x = Math.max(-maxHorizontal, Math.min(x, maxHorizontal));
    translation.y = Math.max(-maxVertical, Math.min(y, maxVertical));
    updateCanvasTransform();
}

//Handle touch panning and zooming
let touchMode = 'pan';
let touch1 = null;
let touch2 = null;
let startPinchDistance = 0;
let startZoom = zoomLevel;
document.addEventListener('touchstart', e => {
    if (touchMode === 'pan') {
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
    if (touchMode === 'pan') {
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
    if (touchMode === 'pan' && e.changedTouches.length === 1 && e.changedTouches[0].identifier === touch1.identifier) {
        touch1 = touch2; //fixes possible canvas mistranslation when switching from 2 touches to 1 touch
    }
});

//Handle touch drawing
c.addEventListener('touchstart', e => {
    if (touchMode === 'brush') {
        for (const touch of e.touches) {
            drawPixelIfNeeded(getCanvasPixelFromTouch(touch));
        }
    }
});
c.addEventListener('touchmove', e => {
    if (touchMode === 'brush') {
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
    return { x: pixelX, y: pixelY };
}

function drawPixelIfNeeded(pixel) {
    if (pixels[pixel.x][pixel.y] !== currentColor.dataset.color) {
        pixels[pixel.x][pixel.y] = currentColor.dataset.color
        drawPixel(pixel.x, pixel.y, currentColor.dataset.color);
        socket.emit("draw", pixel.x, pixel.y, currentColor.dataset.color);
    }
}

//Handle mouse drawing
let isPainting = false;
c.addEventListener("mousedown", e => {
    if (e.button === 2 || document.querySelector(".tools").clientWidth > 0) return;
    isPainting = true;
    let pixel = { x: Math.floor(e.offsetX / (c.clientWidth / c.width)), y: Math.floor(e.offsetY / (c.clientHeight / c.height)) };
    drawPixelIfNeeded(pixel);
});
c.addEventListener("mousemove", e => {
    if (!isPainting) return;
    let pixel = { x: Math.floor(e.offsetX / (c.clientWidth / c.width)), y: Math.floor(e.offsetY / (c.clientHeight / c.height)) };
    drawPixelIfNeeded(pixel);
});

function handleLargeDraw(x, y, color) {
    if (x > 0) {
        pixels[x - 1][y] = color;
        drawPixel(x - 1, y, color);
    }
    if (x < pixels[x].length - 1) {
        pixels[x + 1][y] = color;
        drawPixel(x + 1, y, color);
    }
    if (y > 0) {
        pixels[x][y - 1] = color;
        drawPixel(x, y - 1, color);
    }
    if (y < pixels.length - 1) {
        pixels[x][y + 1] = color;
        drawPixel(x, y + 1, color);
    }
}

socket.on('large-draw', (x, y, color) => {
    pixels[x][y] = color;
    drawPixel(x, y, color);
    handleLargeDraw(x, y, color);
});

socket.on('draw', (x, y, color) => {
    pixels[x][y] = color;
    drawPixel(x, y, color);
});

function drawPixel(x, y, color) {
    ctx.fillStyle = `#${color}`;
    ctx.fillRect(x, y, 1, 1);
}

document.addEventListener("contextmenu", e => e.preventDefault());

document.querySelector('.brush').addEventListener('click', () => {
    document.querySelector(".brush").classList.add('selected');
    touchMode = 'brush';
    document.querySelector(".pan").classList.remove('selected');
});
document.querySelector('.pan').addEventListener('click', () => {
    document.querySelector(".pan").classList.add('selected');
    touchMode = 'pan';
    document.querySelector(".brush").classList.remove('selected');
});

function loadCanvasDisplaySize() {
    let length = c.clientHeight - document.querySelector(".palette").clientHeight;
    c.style.height = length + "px";
    c.style.width = length + "px";
}

loadCanvasDisplaySize();