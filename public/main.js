import { addInterfaceListeners, buildPalette } from "./modules/interface.js";
import { initSocket } from "./modules/socket.js";

initSocket();
buildPalette();
addInterfaceListeners();