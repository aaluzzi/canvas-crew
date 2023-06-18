const socket = io();

const room = window.location.href.split("/").at(-1);
socket.auth = {roomId: room};
socket.connect();

socket.on('login', user => {
    document.querySelector(".login").style.display = "none";
    document.querySelector(".users").style.display = "flex";
    if (user.isAuthorized) {
        document.querySelector(".top-left").style.display = "flex";
        document.querySelector(".grid").style.display = "flex"; //temporary
    }
});

socket.on('connected-users', users => {
    document.querySelector('.users').innerHTML = '';
    users.forEach(user => document.querySelector('.users').appendChild(getUserDiv(user)));
});

function getUserDiv(user) {
    const userDiv = document.createElement('div');
    userDiv.classList.add('user');
    userDiv.innerHTML = `
        <div class="user-icon" style="background-image: url(https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png)"></div>
        <div class="name${user.isAuthorized ? "" : " unauthorized"}">${user.name}</div>
     `;  
    
    return userDiv;
}

let c = document.querySelector('canvas');
let scale = 1;
let baseWidth = c.clientWidth;
let baseHeight = c.clientHeight;
let translation = { x: 0, y: 0 };

const COLORS = ['6d001a', 'be0039', 'ff4500', 'ffa800', 'ffd635', 'fff8b8', '00a368', '00cc78', 
'7eed56', '00756f', '009eaa', '00ccc0', '2450a4', '3690ea', '51e9f4', '493ac1', 
'6a5cff', '94b3ff', '811e9f', 'b44ac0', 'e4abff', 'de107f', 'ff3881', 'ff99aa', 
'6d482f', '9c6926', 'ffb470', '000000', '515252', '898d90', 'd4d7d9', 'ffffff'];
let currentTool = 'pan';
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

socket.on('load-data', data => {
    console.log("Loading pixel data");
    pixels = data;
    c.height = pixels.length;
    c.width = pixels[0].length;
    setScale(1);

    for (let x = 0; x < pixels.length; x++) {
        for (let y = 0; y < pixels[x].length; y++) {
            drawPixel(x, y, pixels[x][y]);
        }
    }
});

socket.on('connect', () => document.querySelector(".disconnected-overlay").classList.remove("visible"));
socket.on('disconnect', () => document.querySelector(".disconnected-overlay").classList.add("visible"));

socket.on('draw', (x, y, colorIndex) => {
    pixels[x][y] = colorIndex;
    drawPixel(x, y, colorIndex);
});

function drawPixel(x, y, colorIndex) {
    let ctx = c.getContext('2d');
    ctx.fillStyle = `#${COLORS[colorIndex]}`;
    ctx.fillRect(x, y, 1, 1);
}

//Handle panning/brush with mouse
let isDragging = false;
let isPainting = false;
let dragStart = { x: 0, y: 0 };
let startTranslation = {x : 0, y: 0};

function setTranslation(x, y) {
    let maxHorizontal = (c.clientWidth / 2);
    let maxVertical = (c.clientHeight / 2);
    translation.x = Math.max(-maxHorizontal, Math.min(x, maxHorizontal));
    translation.y = Math.max(-maxVertical, Math.min(y, maxVertical));
    document.querySelector(".canvas-container").style.transform = `translate(${translation.x}px, ${translation.y}px)`;
}

function setScale(level) {
    scale = Math.max(0.5, Math.min(32, level));
    document.querySelector(".canvas-container").style.width = Math.floor(baseWidth * scale) + 'px';
    document.querySelector(".canvas-container").style.height = Math.floor(baseHeight * scale) + 'px';
    setPixelGridSize(c.clientWidth / c.width);
}

function setPixelGridSize(size) {
    const flooredSize = Math.floor(size);
    document.querySelector(".pixel-grid").style.backgroundSize = `${flooredSize}px ${flooredSize}px`;
    document.querySelector(".pixel-grid").style.transform = `scale(${size / flooredSize})`;
}

//Handle panning/drawing with mouse
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
document.addEventListener('wheel', e => {
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
});

function onMouseDraw(e) {
    let pixel = { 
        x: Math.floor(e.offsetX / (c.clientWidth / c.width)), 
        y: Math.floor(e.offsetY / (c.clientHeight / c.height)), 
        colorIndex: currentColor.dataset.colorIndex,
    };
    drawPixelIfNeeded(pixel);
}

c.addEventListener("mousedown", e => {
    if (e.button !== 2 && currentTool === 'brush') {
        isPainting = true;
        onMouseDraw(e);
    };
});
c.addEventListener("mousemove", e => {
    if (isPainting) {
        onMouseDraw(e);
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

//Handle panning/brush with touch
let touch1 = null;
let touch2 = null;
let startPinchDistance = 0;
let startScale = scale;
document.addEventListener('touchstart', e => {
    e.preventDefault();
    if (currentTool === 'pan') {
        touch1 = e.touches[0];
        if (e.touches.length === 2) {
            touch2 = e.touches[1];
            startScale = scale;
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
            setScale((pinchDistance / startPinchDistance) * startScale);
            setTranslation(startTranslation.x * (scale / startScale), startTranslation.y * (scale / startScale));
           
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

document.querySelector('.login').addEventListener('click', e => {
    e.preventDefault();
    window.location.href += '/auth';
});
document.querySelector('.login').addEventListener('touchstart', e => {
    e.preventDefault();
    window.location.href += '/auth';
});

function onGridToggle(e) {
    e.preventDefault();
    if (document.querySelector('.grid').classList.contains('selected')) {
        document.querySelector(".pixel-grid").style.display = "none";
    } else {
        document.querySelector(".pixel-grid").style.display = "block";
    }
    document.querySelector('.grid').classList.toggle('selected');
}

document.querySelector(".grid").addEventListener('click', onGridToggle);
document.querySelector(".grid").addEventListener('touchstart', onGridToggle);