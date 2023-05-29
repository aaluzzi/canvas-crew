const socket = io();

//Handle sessions and socket connection
if (localStorage.getItem("sessionID")) {
    socket.auth = { sessionID: localStorage.getItem("sessionID") };
}
socket.connect();
socket.on('session', sessionID => {
    socket.auth = { sessionID };
    localStorage.setItem('sessionID', sessionID);
})
socket.on('connected-count', count => {
    document.querySelector(".count").textContent = count + " online";
})

let c = document.querySelector('canvas');
let ctx = c.getContext('2d');

let pixels;
let currentColor = document.querySelector(".palette > .selected");

document.querySelectorAll(".palette > div").forEach(color => color.addEventListener('click', e => {
    currentColor.classList.remove("selected");
    e.target.classList.add("selected");
    currentColor = e.target;
}))

let cameraOffset = { x: 0, y: 0 };
let zoomLevel = 1;

socket.on('load-data', data => {
    console.log("Pixel data received, drawing");
    pixels = data;
    c.height = pixels.length;
    c.width = pixels[0].length;

    for (let x = 0; x < pixels.length; x++) {
        for (let y = 0; y < pixels[x].length; y++) {
            drawPixel(x, y, pixels[x][y]);
        }
    }
});

//Handle canvas dragging
let isDragging = false;
let dragStart = { x: 0, y: 0 };
let translation = {x: 0, y: 0};
function translateCanvas(x, y) {
    c.style.transform = `translate(${x}px, ${y}px)`;
}

document.addEventListener('mousedown', e => {
    if (e.button === 2) {
        isDragging = true;
        dragStart.x = e.clientX;
        dragStart.y = e.clientY;
    }
});
document.addEventListener('mousemove', e => {
    if (isDragging) {
        translateCanvas(e.clientX - dragStart.x + translation.x, e.clientY - dragStart.y + translation.y); 
    }
});
document.addEventListener('mouseup', e => {
    if (isDragging) {
        translation.x += e.clientX - dragStart.x;
        translation.y += e.clientY - dragStart.y;
    }
    isDragging = false;
    isPainting = false;
});

let baseCanvas = {width: 0, height: 0}
function loadCanvasDisplaySize() {
    baseCanvas.height = c.clientHeight - document.querySelector(".palette").clientHeight;
    baseCanvas.width = baseCanvas.height;
    c.style.height = baseCanvas.height + "px";
    c.style.width = baseCanvas.width + "px";
}

loadCanvasDisplaySize();

//Handle canvas zooming
document.addEventListener('wheel', e => {
    zoomLevel -= (Math.sign(e.deltaY) * 0.25);
    zoomLevel = Math.max(zoomLevel, 0.5);
    zoomLevel = Math.min(zoomLevel, 3);
   
    c.style.width = zoomLevel * baseCanvas.width + "px";
    c.style.height = zoomLevel * baseCanvas.height + "px";
});

//Handle painting
let isPainting = false;
c.addEventListener("mousedown", e => {
    if (e.button === 2) return;
    isPainting = true;
    handleMouseDrawEvent(e);
});
c.addEventListener("mousemove", e => {
    if (!isPainting) return;
    handleMouseDrawEvent(e)
})

let lastXPixel = -1;
let lastYPixel = -1;
function handleMouseDrawEvent(e) {
    let x = Math.floor(e.offsetX / (c.clientWidth / c.width));
    let y = Math.floor(e.offsetY / (c.clientHeight / c.height));
    if (x !== lastXPixel || y !== lastYPixel) {
        lastXPixel = x;
        lastYPixel = y;
        pixels[x][y] = currentColor.dataset.color;
        drawPixel(x, y, currentColor.dataset.color);

        if (document.querySelector(".brushes > .large").classList.contains("selected")) {
            socket.emit("large-draw", x, y, currentColor.dataset.color);
            handleLargeDraw(x, y, currentColor.dataset.color);
        } else {
            socket.emit("draw", x, y, currentColor.dataset.color);
        }
    }
}

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
document.querySelectorAll(".brushes > div").forEach(b => b.addEventListener('click', e => {
    document.querySelectorAll(".brushes > div").forEach(b => b.classList.toggle("selected"));
}));