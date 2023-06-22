import { COLORS, requestUndo } from "./canvas.js";

let currentTool = 'pan';
let selectedColorDiv;

export function getCurrentTool() {
    return currentTool;
}

export function getSelectedColor() {
    return selectedColorDiv;
}

export function getUserDiv(user) {
    const userDiv = document.createElement('div');
    userDiv.classList.add('user');
    userDiv.dataset.id = user.discordId;
    userDiv.innerHTML = `
        <div class="user-icon" style="background-image: url(https://cdn.discordapp.com/avatars/${user.discordId}/${user.avatar}.png)"></div>
        <div class="name${(!user.hasOwnProperty('isAuthorized') || user.isAuthorized) ? "" : " unauthorized"}">${user.name}</div>
     `;

    return userDiv;
}

export function showDrawIndicator(user) {
    let userDiv = document.querySelector(`.users > .user[data-id="${user.discordId}"]`);

    userDiv.classList.remove("drawing");
    userDiv.firstElementChild.classList.remove("drawing-icon");
    void userDiv.offsetWidth; //triggers reeanimation
    userDiv.classList.add("drawing");
    userDiv.firstElementChild.classList.add("drawing-icon");
}

export function showPixelPlacer(user) {
    document.querySelector(".pixel-placer").innerHTML = '';
    if (user) {
        document.querySelector(".pixel-placer").appendChild(getUserDiv(user));
    }
}

function onIdentifySelect(e) {
    e.preventDefault();
    currentTool = 'identify';
    document.querySelector(".identify").classList.add('selected');
    document.querySelector(".pan").classList.remove('selected');
    document.querySelector(".brush").classList.remove('selected');
    document.querySelector(".palette").classList.remove("shown");
    document.querySelector(".placeholder").style.display = 'block';
    document.querySelector(".placeholder").style.outlineColor = `rgb(35, 35, 35)`;
}

function onBrushSelect(e) {
    e.preventDefault();
    currentTool = 'brush';
    document.querySelector(".identify").classList.remove('selected');
    document.querySelector(".pan").classList.remove('selected');
    document.querySelector(".brush").classList.add('selected');
    document.querySelector(".palette").classList.add("shown");
    document.querySelector(".pixel-placer").innerHTML = '';
    document.querySelector(".placeholder").style.display = 'block';
    document.querySelector(".placeholder").style.outlineColor = selectedColorDiv.style.backgroundColor;
}

function onPanSelect(e) {
    e.preventDefault();
    currentTool = 'pan';
    document.querySelector(".identify").classList.remove('selected');
    document.querySelector(".pan").classList.add('selected');
    document.querySelector(".brush").classList.remove('selected');
    document.querySelector(".palette").classList.remove("shown");
    document.querySelector(".pixel-placer").innerHTML = '';
    document.querySelector(".placeholder").style.display = 'none';
}

export function buildPalette() {
    for (let i = 0; i < COLORS.length; i++) {
        const color = document.createElement('div');
        color.dataset.colorIndex = i;
        color.style.backgroundColor = "#" + COLORS[i];
        document.querySelector(".palette").appendChild(color);
    }
    selectedColorDiv = document.querySelector(`.palette > div[data-color-index="${Math.floor(Math.random() * COLORS.length)}"]`);
    selectedColorDiv.classList.add('selected');

    const white = document.querySelector(`.palette > div[data-color-index="${COLORS.length - 1}"`);
    white.style.outline = "1px rgb(200, 200, 200) solid";
    white.style.outlineOffset = "-1px";
}

export function addInterfaceListeners() {
    document.querySelector('.identify').addEventListener('touchstart', onIdentifySelect);
    document.querySelector('.identify').addEventListener('click', onIdentifySelect);
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

    document.querySelector(".grid").addEventListener('click', onGridToggle);
    document.querySelector(".grid").addEventListener('touchstart', onGridToggle);

    document.querySelectorAll(".palette > div").forEach(color => {
        color.addEventListener('click', onColorSelect);
        color.addEventListener('touchstart', onColorSelect);
    });

    addUndoListeners();
}

function onGridToggle(e) {
    e.preventDefault();
    if (document.querySelector('.grid').classList.contains('selected')) {
        document.querySelector(".pixel-grid").style.display = "none";
    } else {
        document.querySelector(".pixel-grid").style.display = "block";
    }
    document.querySelector('.grid').classList.toggle('selected');
}

function onColorSelect(e) {
    e.preventDefault();
    document.querySelector(".placeholder").style.outlineColor = e.target.style.backgroundColor;
    selectedColorDiv.classList.remove("selected");
    selectedColorDiv = e.target;
    selectedColorDiv.classList.add("selected");
}

function addUndoListeners() {
    let undoIntervalId;
    document.querySelector(".undo").addEventListener("touchstart", e => {
        e.preventDefault();
        requestUndo();
        undoIntervalId = setInterval(() => {
            onRequestUndo(e);
        }, 100);
    });
    document.querySelector(".undo").addEventListener("touchend", (e) => {
        e.preventDefault();
        clearInterval(undoIntervalId);
    });

    document.querySelector(".undo").addEventListener("click", requestUndo);
    document.addEventListener('keydown', e => {
        if (e.ctrlKey && e.code === 'KeyZ') {
            requestUndo();
        }
    });
}