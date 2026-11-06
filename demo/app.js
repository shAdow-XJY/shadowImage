import { ShadowImagePlayer } from "../src/player/stream-image.js";

const log = document.getElementById("log");
const canvas = document.getElementById("view");

const player = new ShadowImagePlayer({
  canvas,
  url: "/stream.shadowimg",
  onStageChange: (event) => {
    log.textContent = JSON.stringify(event);
  },
  onError: (err) => {
    log.textContent = `error: ${err.message}`;
  },
});

player.start();
