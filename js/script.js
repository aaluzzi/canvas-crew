const socket = io();

let c = document.querySelector('canvas');
let ctx = c.getContext('2d');

let pixels;
let squareSize;
let currentColor = document.querySelector(".colors > .selected");

document.querySelectorAll(".colors > div").forEach(color => color.addEventListener('click', e => {
    currentColor.classList.remove("selected");
    e.target.classList.add("selected");
    currentColor = e.target;
}))

socket.on('load-data', data => {
    console.log("Pixel data received, drawing");
    squareSize = Math.floor(c.clientHeight / data.length);
    c.height = data.length;
    c.width = data[0].length;
    for (let x = 0; x < data.length; x++) {
        for (let y = 0; y < data[x].length; y++) {
            drawPixel(y, x, data[x][y]); //x and y must be flipped
        }
    }
    pixels = data;
})

socket.on('draw', (x, y, color) => {
    console.log("received " + x + " " + y);
    pixels[y][x] = color;
    drawPixel(x, y, color);
});

function drawPixel(x, y, color) {
    ctx.fillStyle = `#${color}`;
    ctx.fillRect(x, y, 1, 1);
}

let mouseDown = false;
let lastXPixel = -1;
let lastYPixel = -1;

//Handle mouse input
c.addEventListener("mousemove", e => {
    let x = Math.floor(e.offsetX / squareSize);
    let y = Math.floor(e.offsetY / squareSize);
    if (mouseDown && (x !== lastXPixel || y !== lastYPixel)) {
        lastXPixel = x;
        lastYPixel = y;
        socket.emit("draw", x, y, currentColor.dataset.color);
    }
})
c.addEventListener("mousedown", e => {
    mouseDown = true;
    socket.emit("draw", Math.floor(e.offsetX / squareSize), Math.floor(e.offsetY / squareSize), currentColor.dataset.color);
})
document.addEventListener("mouseup", e => {
    mouseDown = false;
})