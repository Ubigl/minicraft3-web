const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

canvas.width = innerWidth;
canvas.height = innerHeight;

// =================== PLAYER ===================
const player = {
  x: 3.5,
  y: 3.5,
  angle: 0,
  speed: 0.08,
  rotSpeed: 0.04
};

// =================== MAP ===================
const map = [
  [1,1,1,1,1,1,1,1],
  [1,2,2,2,2,2,2,1],
  [1,2,0,0,0,0,2,1],
  [1,2,0,3,3,0,2,1],
  [1,2,0,3,3,0,2,1],
  [1,2,0,0,0,0,2,1],
  [1,2,2,2,2,2,2,1],
  [1,1,1,1,1,1,1,1],
];

// 0 = air
// 1 = stone
// 2 = grass
// 3 = dirt
// 4 = sand
// 5 = crystal

const BLOCKS = {
  1: "stone",
  2: "grass",
  3: "dirt",
  4: "sand",
  5: "crystal"
};

// =================== TEXTURES ===================
const textures = {};

function loadTextures() {
  Object.values(BLOCKS).forEach(name => {
    const img = new Image();
    img.src = `game/assets/textures/${name}.png`;
    textures[name] = img;
  });
}

loadTextures();

// =================== INPUT ===================
const keys = {};
addEventListener("keydown", e => keys[e.key.toLowerCase()] = true);
addEventListener("keyup", e => keys[e.key.toLowerCase()] = false);

// =================== RAYCAST ===================
const FOV = Math.PI / 3;
const MAX_DIST = 20;

function castRay(angle) {
  for (let d = 0; d < MAX_DIST; d += 0.05) {
    const x = player.x + Math.cos(angle) * d;
    const y = player.y + Math.sin(angle) * d;
    const cell = map[Math.floor(y)]?.[Math.floor(x)];
    if (cell && cell !== 0) {
      return { dist: d, block: cell };
    }
  }
  return null;
}

// =================== UPDATE ===================
function update() {
  if (keys["a"]) player.angle -= player.rotSpeed;
  if (keys["d"]) player.angle += player.rotSpeed;

  let moveX = 0;
  let moveY = 0;

  if (keys["w"]) {
    moveX += Math.cos(player.angle) * player.speed;
    moveY += Math.sin(player.angle) * player.speed;
  }
  if (keys["s"]) {
    moveX -= Math.cos(player.angle) * player.speed;
    moveY -= Math.sin(player.angle) * player.speed;
  }

  const nx = player.x + moveX;
  const ny = player.y + moveY;

  if (map[Math.floor(ny)]?.[Math.floor(nx)] === 0) {
    player.x = nx;
    player.y = ny;
  }
}

// =================== RENDER ===================
function render() {
  ctx.fillStyle = "#87CEEB";
  ctx.fillRect(0, 0, canvas.width, canvas.height / 2);
  ctx.fillStyle = "#333";
  ctx.fillRect(0, canvas.height / 2, canvas.width, canvas.height / 2);

  for (let x = 0; x < canvas.width; x++) {
    const rayAngle = player.angle - FOV / 2 + (x / canvas.width) * FOV;
    const hit = castRay(rayAngle);

    if (!hit) continue;

    const dist = hit.dist * Math.cos(rayAngle - player.angle);
    const height = canvas.height / dist;

    const texName = BLOCKS[hit.block];
    const tex = textures[texName];

    const shade = Math.max(0.2, 1 - dist / MAX_DIST);
    ctx.globalAlpha = shade;

    if (tex && tex.complete) {
      ctx.drawImage(
        tex,
        0, 0, tex.width, tex.height,
        x, (canvas.height - height) / 2,
        1, height
      );
    } else {
      ctx.fillStyle = "#888";
      ctx.fillRect(x, (canvas.height - height) / 2, 1, height);
    }
  }

  ctx.globalAlpha = 1;
}

// =================== LOOP ===================
function loop() {
  update();
  render();
  requestAnimationFrame(loop);
}

loop();
