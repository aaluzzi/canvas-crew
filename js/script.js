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

//Handle changing colors
document.querySelectorAll(".palette > div").forEach(color => color.addEventListener('click', e => {
    currentColor.classList.remove("selected");
    e.target.classList.add("selected");
    currentColor = e.target;
}));

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
    c.style.transform = `translate(${x}px, ${y}px) scale(${zoomLevel})`;
}

function updateCanvasTransform() {
    c.style.transform = `translate(${translation.x}px, ${translation.y}px) scale(${zoomLevel})`;
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

//Handle mouse zooming
document.addEventListener('wheel', e => {
    let prevZoom = zoomLevel;
    changeZoom(zoomLevel - Math.sign(e.deltaY) * 0.25);
    
    let canvasMidpoint = c.clientWidth / 2;
    //get distance from center, then correct based on how much the zoom will change the screen
    translation.x += (canvasMidpoint - e.offsetX) * (zoomLevel - prevZoom);
    translation.y += (canvasMidpoint - e.offsetY) * (zoomLevel - prevZoom);

    updateCanvasTransform();
});

function changeZoom(level) {
    zoomLevel = level;
    zoomLevel = Math.max(zoomLevel, 0.5);
    zoomLevel = Math.min(zoomLevel, 4);
}

//Handle touch panning and zooming
let touch1 = null;
let touch2 = null;
let startPinchDistance = 0;
let startZoom = zoomLevel;
document.addEventListener('touchstart', e => {
    touch1 = e.touches[0];
    if (e.touches.length === 2) {
        touch2 = e.touches[1];
        startZoom = zoomLevel;
        startPinchDistance = Math.hypot(e.touches[0].pageX - e.touches[1].pageX, e.touches[0].pageY - e.touches[1].pageY);
    }
});

document.addEventListener('touchmove', e => {
    //console.log(e);
    if (e.touches.length === 2) {
        pinchDistance = Math.hypot(e.touches[0].pageX - e.touches[1].pageX, e.touches[0].pageY - e.touches[1].pageY);
        changeZoom(startZoom + ((pinchDistance - startPinchDistance) * 0.005));
        touch2 = e.touches[1];
    } else if (e.touches.length === 1) {
        translation.x += e.touches[0].clientX - touch1.clientX;
        translation.y += e.touches[0].clientY - touch1.clientY;
        updateCanvasTransform();
    }
    touch1 = e.touches[0];
});
document.addEventListener('touchend', e => {
    if (e.changedTouches.length === 1 && e.changedTouches[0].identifier === touch1.identifier) {
        touch1 = touch2; //fixes possible canvas mistranslation when switching from 2 touches to 1 touch
    }
});

function loadCanvasDisplaySize() {
    let length =  c.clientHeight - document.querySelector(".palette").clientHeight;
    c.style.height = length + "px";
    c.style.width = length + "px";
}

loadCanvasDisplaySize();

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