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
    document.querySelector(".count").textContent =  "👤" + count;
})

let c = document.querySelector('canvas');
let ctx = c.getContext('2d');

let pixels;
let currentColor = document.querySelector(".colors > .selected");

document.querySelectorAll(".colors > div").forEach(color => color.addEventListener('click', e => {
    currentColor.classList.remove("selected");
    e.target.classList.add("selected");
    currentColor = e.target;
}))

let cameraOffset = {x: 0, y: 0};
let zoomLevel = 1;

socket.on('load-data', data => {
    console.log("Pixel data received, drawing");
    pixels = data;
    draw();
});

function draw() {
    c.height = pixels.length;
    c.width = pixels[0].length;
   
    //makes sure zoom is always applied in middle
    ctx.translate(c.width / 2, c.height / 2);
    ctx.scale(zoomLevel, zoomLevel);
    ctx.translate(-c.width / 2 + cameraOffset.x, -c.height / 2 + cameraOffset.y);
    
    for (let x = 0; x < pixels.length; x++) {
        for (let y = 0; y < pixels[x].length; y++) {
            drawPixel(x, y, pixels[x][y]); //x and y must be flipped
        }
    }
    requestAnimationFrame(draw);
}

//Could not figure out how to turn this into a single mathematical function
function getCameraOffsetBounds(zoom) {
    if (zoom === 1) {
        return {x: 0, y: 0};
    } else if (zoom === 2) {
        return {x: c.width / 4, y: c.height / 4};
    } else if (zoom === 3) {
        return {x: c.width / 3, y: c.height / 3};
    } else if (zoom === 4) {
        return {x: c.width / 3 + (c.width / 3 - c.width / 4) / 2, y: c.height / 3 + (c.height / 3 - c.height / 4) / 2};
    }
}

function enforceCameraBounds() {
    cameraOffset.x = Math.min(cameraBounds.x, cameraOffset.x);
    cameraOffset.x = Math.max(-cameraBounds.x, cameraOffset.x);
    cameraOffset.y = Math.min(cameraBounds.y, cameraOffset.y);
    cameraOffset.y = Math.max(-cameraBounds.y, cameraOffset.y);
}

let cameraBounds = getCameraOffsetBounds(zoomLevel);
c.addEventListener("wheel", e => {
    zoomLevel -= Math.sign(e.deltaY);
    zoomLevel = Math.max(zoomLevel, 1);
    zoomLevel = Math.min(zoomLevel, 4);
    cameraBounds = getCameraOffsetBounds(zoomLevel);
    enforceCameraBounds();
})

let mouseDown = false;
let isDragging = false;
let dragStart = {x: 0, y: 0};

//Handle mouse input
c.addEventListener("mousedown", e => {
    mouseDown = true;
    if (e.button === 2) {
        isDragging = true;
        dragStart.x = Math.floor(e.offsetX / (c.clientWidth / c.width)) - cameraOffset.x;
        dragStart.y = Math.floor(e.offsetY / (c.clientHeight / c.height)) - cameraOffset.y;
    } else {
        handleMouseDraw(e);
    }
})
c.addEventListener("mousemove", e => {
    if (!mouseDown) return;

    if (isDragging) {
        cameraOffset.x = Math.floor(e.offsetX / (c.clientWidth / c.width)) - dragStart.x;
        cameraOffset.y =  Math.floor(e.offsetY / (c.clientHeight / c.height)) - dragStart.y;
        enforceCameraBounds();    
    } else {
        handleMouseDraw(e)
    }
})
document.addEventListener("mouseup", e => {
    mouseDown = false;
    isDragging = false;
})

let lastXPixel = -1;
let lastYPixel = -1;
function handleMouseDraw(e) {
    let originalX = Math.floor(e.offsetX / (c.clientWidth / c.width));
    let originalY = Math.floor(e.offsetY / (c.clientHeight / c.height));

    const matrix = ctx.getTransform();
    //matrix transform, e is what we need
    transformedX = Math.floor((originalX - matrix.e) / zoomLevel);
    transformedY = Math.floor((originalY - matrix.f) / zoomLevel);

    if (transformedX !== lastXPixel || transformedY !== lastYPixel) {
        lastXPixel = transformedX;
        lastYPixel = transformedY;
        pixels[transformedY][transformedX] = currentColor.dataset.color;

        if (document.querySelector(".brushes > .large").classList.contains("selected")) {
            socket.emit("large-draw", transformedX, transformedY, currentColor.dataset.color);
            handleLargeDraw(transformedY, transformedX, currentColor.dataset.color);
        } else {
            socket.emit("draw", transformedX, transformedY, currentColor.dataset.color);
        }
    }
}

function handleLargeDraw(x, y, color) {
    if (x > 0) {
        pixels[x - 1][y] = color;
    }
    if (x < pixels[x].length - 1) {
        pixels[x + 1][y] = color;
    }
    if (y > 0) {
        pixels[x][y - 1] = color;
    }
    if (y < pixels.length - 1) {
        pixels[x][y + 1] = color;
    }
}

socket.on('large-draw', (x, y, color) => {
    pixels[x][y] = color;
    handleLargeDraw(x, y, color);
});

socket.on('draw', (x, y, color) => {
    pixels[x][y] = color;
});

function drawPixel(x, y, color) {
    ctx.fillStyle = `#${color}`;
    ctx.fillRect(y, x, 1, 1);
}

c.addEventListener("contextmenu", e => e.preventDefault());
document.querySelectorAll(".brushes > div").forEach(b => b.addEventListener('click', e => {
    document.querySelectorAll(".brushes > div").forEach(b => b.classList.toggle("selected"));
}));