import { getUserDiv } from "./interface.js";
import { setClientUser, initCanvas, onUserDraw } from "./canvas.js";

let socket;

export function initSocket() {
    socket = io();
    const room = window.location.href.split("/").at(-1);
    socket.auth = {roomId: room};
    socket.connect();

    socket.on('login', user => {
        setClientUser(user);
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

    socket.on('load-data', initCanvas);
    socket.on('draw', onUserDraw);
    
    socket.on('connect', () => document.querySelector(".disconnected-overlay").classList.remove("visible"));
    socket.on('disconnect', () => document.querySelector(".disconnected-overlay").classList.add("visible"));

}

export function emitPixelDraw(pixel) {
    socket.emit("draw", pixel.x, pixel.y, pixel.colorIndex);
}