const socket = io();

let c = document.querySelector('canvas');
let ctx = c.getContext('2d');

let pixels;
let squareSize;

c.width = 50;
c.height = 50;

socket.on('load-data', data => {
    console.log("Pixel data received, drawing");
    squareSize = Math.round(c.clientWidth / data.length);
    for (let x = 0; x < data.length; x++) {
        for (let y = 0; y < data[x].length; y++) {
            drawPixel(x, y, data[x][y]);
        }
    }
    pixels = data;
})

socket.on('draw', (x, y, color) => {
    pixels[x][y] = color;
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
        socket.emit("draw", x, y, "000000");
    }
})
c.addEventListener("mousedown", e => {
    mouseDown = true;
    socket.emit("draw", Math.floor(e.offsetX / squareSize), Math.floor(e.offsetY / squareSize), "000000");
})
document.addEventListener("mouseup", e => {
    mouseDown = false;
})