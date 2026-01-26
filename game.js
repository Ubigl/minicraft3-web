import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';

// --- НАСТРОЙКИ ---
const CHUNK_SIZE = 16;
const RENDER_DISTANCE = 3; 
const TEXTURE_PATH = './Assets/';
const GRAVITY = 32.0;
const JUMP_FORCE = 10.0;
const SPEED = 5.0;
const PLAYER_HEIGHT = 1.7;
const PLAYER_RADIUS = 0.3;
const PICKUP_RANGE = 2.0;

// --- СЦЕНА ---
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87CEEB);
scene.fog = new THREE.Fog(0x87CEEB, 20, (RENDER_DISTANCE * CHUNK_SIZE) - 5);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
scene.add(camera); // Add camera to scene so children (hand) are visible
const renderer = new THREE.WebGLRenderer({ antialias: false });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

// --- РЕСУРСЫ ---
const loader = new THREE.TextureLoader();
const loadTex = (url) => {
    const tex = loader.load(TEXTURE_PATH + url);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
};

const textures = {
    dirt: loadTex('Dirt.png'),
    grass: loadTex('grass.png'), 
    stone: loadTex('stone.png'),
    wood: loadTex('tree.png'),
    iron: loadTex('Iron.png'),
    ruby: loadTex('ruby.png'),
    emerald: loadTex('emerald.png'),
    gold: loadTex('Gold.png'),
    leaves: loadTex('foliage.png')
};

const materials = [
    null, // 0 - air
    new THREE.MeshLambertMaterial({ map: textures.grass }), // 1
    new THREE.MeshLambertMaterial({ map: textures.dirt }),  // 2
    new THREE.MeshLambertMaterial({ map: textures.stone }), // 3
    new THREE.MeshLambertMaterial({ map: textures.wood }),  // 4
    new THREE.MeshLambertMaterial({ map: textures.leaves, transparent: true, alphaTest: 0.5 }), // 5
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8 }), // 6 - Clouds
    new THREE.MeshLambertMaterial({ map: textures.iron }), // 7
    new THREE.MeshLambertMaterial({ map: textures.ruby }), // 8
    new THREE.MeshLambertMaterial({ map: textures.emerald }), // 9
    new THREE.MeshLambertMaterial({ map: textures.gold })  // 10
];

const itemIcons = {
    1: './Assets/grass.png',
    2: './Assets/Dirt.png',
    3: './Assets/stone.png',
    4: './Assets/tree.png',
    5: './Assets/foliage.png',
    7: './Assets/Iron.png',
    8: './Assets/ruby.png',
    9: './Assets/emerald.png',
    10: './Assets/Gold.png'
};

const blockBreakSound = new Audio('./Assets/sound of a block breaking.mp3');
let soundVolume = 0.5;
blockBreakSound.volume = soundVolume;

// --- ИНВЕНТАРЬ ---
// 9 хотбар + 27 инвентарь = 36
const inventory = new Array(36).fill(null); 
// null или { type: int, count: int }
let cursorItem = null;
let isSprinting = false;

// --- HAND () ---
const handScene = new THREE.Scene();
const handCamera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 10);
handCamera.position.set(0, 0, 0);

// Add light to hand scene
const handAmbient = new THREE.AmbientLight(0xffffff, 0.8);
handScene.add(handAmbient);
const handDirLight = new THREE.DirectionalLight(0xffffff, 0.5);
handDirLight.position.set(1, 1, 1);
handScene.add(handDirLight);

// Arm (Steve skin colored)
const armGeo = new THREE.BoxGeometry(0.15, 0.5, 0.15);
const armMat = new THREE.MeshLambertMaterial({ color: 0xc9a065 });
const armMesh = new THREE.Mesh(armGeo, armMat);

// Block in hand
const blockInHandGeo = new THREE.BoxGeometry(0.2, 0.2, 0.2);
const blockInHandMesh = new THREE.Mesh(blockInHandGeo, materials[2]);
blockInHandMesh.visible = false;
blockInHandMesh.position.set(0, 0.15, -0.05);

// Hand pivot for animation
const handPivot = new THREE.Group();
handPivot.add(armMesh);
handPivot.add(blockInHandMesh);

// Position hand in bottom right of screen
handPivot.position.set(0.4, -0.35, -0.5);
handPivot.rotation.set(-0.1, -0.3, 0);
armMesh.position.set(0, -0.1, 0);

handScene.add(handPivot);

let handSwingTime = 0;
const HAND_SWING_DURATION = 0.25;
let handBaseRotX = -0.1;
let handBaseRotZ = 0;

function updateHand(dt) {
    // Swing animation
    if (handSwingTime > 0) {
        handSwingTime -= dt;
        const t = 1 - (handSwingTime / HAND_SWING_DURATION);
        // Swing down and to the left
        const swing = Math.sin(t * Math.PI);
        handPivot.rotation.x = handBaseRotX + swing * 0.6;
        handPivot.rotation.z = handBaseRotZ - swing * 0.4;
    } else {
        // Idle bobbing
        const bobTime = performance.now() * 0.003;
        handPivot.rotation.x = handBaseRotX + Math.sin(bobTime) * 0.02;
        handPivot.rotation.z = handBaseRotZ + Math.cos(bobTime * 0.7) * 0.01;
    }
    
    // Update block in hand based on selected slot
    const item = inventory[activeSlotIndex];
    if (item && materials[item.type]) {
        armMesh.visible = false;
        blockInHandMesh.visible = true;
        blockInHandMesh.material = materials[item.type];
    } else {
        armMesh.visible = true;
        blockInHandMesh.visible = false;
    }
}

function swingHand() {
    if (handSwingTime <= 0) {
        handSwingTime = HAND_SWING_DURATION;
    }
}

// --- CLOUDS (Smooth moving plane) ---
const CLOUD_HEIGHT = 45;
const CLOUD_SPEED = 2; // blocks per second
let cloudOffset = 0;

// Create cloud texture procedurally
const cloudCanvas = document.createElement('canvas');
cloudCanvas.width = 256;
cloudCanvas.height = 256;
const cloudCtx = cloudCanvas.getContext('2d');

// Draw  cloud pattern
cloudCtx.fillStyle = 'rgba(0,0,0,0)';
cloudCtx.fillRect(0, 0, 256, 256);
cloudCtx.fillStyle = 'rgba(255,255,255,0.9)';

// Create blocky cloud shapes
const cloudPattern = [
    [0,0,1,1,1,1,1,0,0,0,0,0,1,1,1,0],
    [0,1,1,1,1,1,1,1,0,0,0,1,1,1,1,1],
    [0,1,1,1,1,1,1,1,1,0,1,1,1,1,1,1],
    [0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
    [0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0],
    [0,0,1,1,1,1,1,1,1,1,1,1,1,0,0,0],
    [0,0,0,0,1,1,0,0,1,1,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,1,1,1,1,0,0,0,0,0,0,0],
    [0,0,0,0,1,1,1,1,1,1,0,0,1,1,0,0],
    [0,0,0,1,1,1,1,1,1,1,1,1,1,1,1,0],
    [0,0,1,1,0,1,1,1,1,1,1,1,1,1,1,1],
    [0,1,1,1,0,1,1,1,1,1,1,1,1,1,1,1],
    [0,1,1,1,1,1,1,1,1,1,1,1,1,1,0,0],
    [0,0,1,0,1,1,1,0,0,1,0,1,1,0,0,0],
    [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]
];

for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
        if (cloudPattern[y][x]) {
            cloudCtx.fillRect(x * 16, y * 16, 16, 16);
        }
    }
}

const cloudTexture = new THREE.CanvasTexture(cloudCanvas);
cloudTexture.wrapS = THREE.RepeatWrapping;
cloudTexture.wrapT = THREE.RepeatWrapping;
cloudTexture.magFilter = THREE.NearestFilter;
cloudTexture.minFilter = THREE.NearestFilter;
cloudTexture.repeat.set(8, 8);

const cloudGeo = new THREE.PlaneGeometry(500, 500);
const cloudMat = new THREE.MeshBasicMaterial({
    map: cloudTexture,
    transparent: true,
    opacity: 0.9,
    side: THREE.DoubleSide,
    depthWrite: false
});
const cloudMesh = new THREE.Mesh(cloudGeo, cloudMat);
cloudMesh.rotation.x = -Math.PI / 2;
cloudMesh.position.y = CLOUD_HEIGHT;
scene.add(cloudMesh);

function updateClouds(dt) {
    cloudOffset += CLOUD_SPEED * dt * 0.01;
    cloudTexture.offset.x = cloudOffset;
    // Follow player horizontally
    cloudMesh.position.x = player.pos.x;
    cloudMesh.position.z = player.pos.z;
}

// --- СВЕТ ---
const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
scene.add(ambientLight);

const dirLight = new THREE.DirectionalLight(0xffffff, 0.6);
dirLight.position.set(100, 200, 50);
dirLight.castShadow = true;
dirLight.shadow.mapSize.width = 2048;
dirLight.shadow.mapSize.height = 2048;
scene.add(dirLight);

// --- ГЕНЕРАЦИЯ ---
const simplex = new SimplexNoise();
const chunks = new Map(); 
const savedChunkMods = new Map(); 

function getChunkKey(x, z) { return `${x},${z}`; }

class Chunk {
    constructor(cx, cz) {
        this.cx = cx;
        this.cz = cz;
        this.blocks = new Map(); 
        this.meshGroup = new THREE.Group();
        this.meshGroup.position.set(cx * CHUNK_SIZE, 0, cz * CHUNK_SIZE);
        
        this.generate();
        this.applyMods();
        this.buildMesh();
        
        scene.add(this.meshGroup);
    }

    generate() {
        const MIN_Y = -11;

        for (let x = 0; x < CHUNK_SIZE; x++) {
            for (let z = 0; z < CHUNK_SIZE; z++) {
                const wx = this.cx * CHUNK_SIZE + x;
                const wz = this.cz * CHUNK_SIZE + z;

                const scale = 0.02;
                const noise = simplex.noise2D(wx * scale, wz * scale);
                const h = Math.floor((noise + 1) * 8 + 4);

                for (let y = MIN_Y; y <= h; y++) {
                    let type = 3; // СНАЧАЛА ВЕЗДЕ КАМЕНЬ

                    if (y >= h - 2) type = 2; // dirt
                    if (y === h)    type = 1; // grass

                        // фиксированный слой золота
                    if (y === -5) type = 10;

                     // руды только в камне
                    if (type === 3) {
                       if (y < -7 && Math.random() < 0.5) type = 7; // iron
                    }

                    this.setBlockLocal(x, y, z, type);
                }

                if (x > 2 && x < 13 && z > 2 && z < 13 && Math.random() < 0.01 && h > 4) {
                   this.buildTree(x, h + 1, z);
                }
            }
        }
        
    }

    applyMods() {
        const key = getChunkKey(this.cx, this.cz);
        if (savedChunkMods.has(key)) {
            const mods = savedChunkMods.get(key);
            for (const m of mods) {
                this.setBlockLocal(m.x, m.y, m.z, m.type);
            }
        }
    }

    buildTree(lx, ly, lz) {
        const height = 4 + Math.floor(Math.random() * 3);
        for (let i = 0; i < height; i++) {
            this.setBlockLocal(lx, ly + i, lz, 4);
        }
        for (let y = ly + height - 3; y <= ly + height; y++) {
            const range = (y >= ly + height - 1) ? 1 : 2; 
            for (let x = lx - range; x <= lx + range; x++) {
                for (let z = lz - range; z <= lz + range; z++) {
                    if (x === lx && z === lz && y < ly + height) continue; 
                    if ((Math.abs(x - lx) === range && Math.abs(z - lz) === range) && (y > ly + height - 2 || Math.random() < 0.3)) continue;
                    this.setBlockLocal(x, y, z, 5);
                }
            }
        }
    }

    setBlockLocal(x, y, z, type) {
        const key = `${x},${y},${z}`;
        if (type === 0) this.blocks.delete(key);
        else this.blocks.set(key, type);
    }

    getBlockLocal(x, y, z) {
        return this.blocks.get(`${x},${y},${z}`) || 0;
    }

    buildMesh() {
        this.meshGroup.clear();
        
        const matrices = {};
        for(let i=1; i<=6; i++) matrices[i] = [];

        const dummy = new THREE.Object3D();

        for (const [key, type] of this.blocks) {
            const [x, y, z] = key.split(',').map(Number);
            if (type !== 5 && type !== 6 && this.isOccluded(x, y, z)) continue;
            dummy.position.set(x + 0.5, y + 0.5, z + 0.5);
            dummy.updateMatrix();
            if(matrices[type]) matrices[type].push(dummy.matrix.clone());
        }

        const geom = new THREE.BoxGeometry(1, 1, 1);
        
        for (const type in matrices) {
            const arr = matrices[type];
            if (arr.length === 0) continue;
            const mesh = new THREE.InstancedMesh(geom, materials[type], arr.length);
            for (let i = 0; i < arr.length; i++) {
                mesh.setMatrixAt(i, arr[i]);
            }
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            this.meshGroup.add(mesh);
        }
    }

    isOccluded(x, y, z) {
        const neighbors = [[1,0,0], [-1,0,0], [0,1,0], [0,-1,0], [0,0,1], [0,0,-1]];
        for (let n of neighbors) {
            const t = this.getBlockLocal(x+n[0], y+n[1], z+n[2]);
            if (t === 0 || t === 5 || t === 6) return false;
        }
        return true; 
    }

    dispose() {
        scene.remove(this.meshGroup);
        this.meshGroup.traverse(o => {
            if(o.geometry) o.geometry.dispose();
        });
    }
}

// --- DROPS ---
const drops = [];
const dropGeo = new THREE.BoxGeometry(0.3, 0.3, 0.3);

function spawnDrop(x, y, z, type) {
    if(!materials[type]) return; // don't spawn drops for invalid blocks
    const mesh = new THREE.Mesh(dropGeo, materials[type]);
    mesh.position.set(x + 0.5, y + 0.5, z + 0.5);
    mesh.castShadow = true;
    scene.add(mesh);
    drops.push({
        mesh: mesh,
        type: type,
        vel: new THREE.Vector3((Math.random()-0.5)*2, 5, (Math.random()-0.5)*2),
        creationTime: performance.now()
    });
}

function updateDrops(dt) {
    for (let i = drops.length - 1; i >= 0; i--) {
        const d = drops[i];
        d.vel.y -= GRAVITY * dt;
        d.mesh.position.addScaledVector(d.vel, dt);

        // Simple ground check
        if (world.getBlock(d.mesh.position.x, d.mesh.position.y - 0.15, d.mesh.position.z) !== 0) {
            d.vel.y = 0;
            d.vel.x *= 0.9;
            d.vel.z *= 0.9;
            d.mesh.position.y = Math.ceil(d.mesh.position.y - 0.5) + 0.15;
        }

        d.mesh.rotation.y += dt;

        // Pickup
        const dist = d.mesh.position.distanceTo(player.pos);
        if (dist < PICKUP_RANGE && (performance.now() - d.creationTime > 500)) {
            // Add to inventory
            if (addToInventory(d.type)) {
                scene.remove(d.mesh);
                drops.splice(i, 1);
            }
        }
    }
}

function addToInventory(type, amount = 1) {
    // Try calculate stack
    for(let i=0; i<inventory.length; i++) {
        if (inventory[i] && inventory[i].type === type && inventory[i].count < 64) {
            const space = 64 - inventory[i].count;
            const toAdd = Math.min(space, amount);
            inventory[i].count += toAdd;
            amount -= toAdd;
            if(amount <= 0) {
                renderUI();
                return true;
            }
        }
    }
    // Try empty slot
    while(amount > 0) {
        let emptyIdx = -1;
        for(let i=0; i<inventory.length; i++) {
            if (!inventory[i]) { emptyIdx = i; break; }
        }
        if (emptyIdx !== -1) {
            const toAdd = Math.min(64, amount);
            inventory[emptyIdx] = { type: type, count: toAdd };
            amount -= toAdd;
        } else {
             renderUI();
             return false;
        }
    }
    renderUI();
    return true;
}

// --- WORLD ---
const world = {
    getBlock: (wx, wy, wz) => {
        const cx = Math.floor(wx / CHUNK_SIZE);
        const cz = Math.floor(wz / CHUNK_SIZE);
        const lx = Math.floor(wx) - cx * CHUNK_SIZE;
        const ly = Math.floor(wy);
        const lz = Math.floor(wz) - cz * CHUNK_SIZE;
        
        const chunk = chunks.get(getChunkKey(cx, cz));
        if (!chunk) return 0;
        return chunk.getBlockLocal(lx, ly, lz);
    },
    setBlock: (wx, wy, wz, type) => {
        const cx = Math.floor(wx / CHUNK_SIZE);
        const cz = Math.floor(wz / CHUNK_SIZE);
        const lx = Math.floor(wx) - cx * CHUNK_SIZE;
        const ly = Math.floor(wy);
        const lz = Math.floor(wz) - cz * CHUNK_SIZE;

        const key = getChunkKey(cx, cz);
        
        if (!savedChunkMods.has(key)) savedChunkMods.set(key, []);
        const mods = savedChunkMods.get(key);
        const existIdx = mods.findIndex(m => m.x === lx && m.y === ly && m.z === lz);
        if (existIdx !== -1) mods.splice(existIdx, 1);
        mods.push({x:lx, y:ly, z:lz, type});

        const chunk = chunks.get(key);
        if (chunk) {
            // Spawn drop if breaking
            const currentBlock = chunk.getBlockLocal(lx, ly, lz);
            if (type === 0 && currentBlock !== 0 && currentBlock !== 6) {
                spawnDrop(wx, wy, wz, currentBlock);
            }
            
            chunk.setBlockLocal(lx, ly, lz, type);
            chunk.buildMesh();
        }
    },
    update: (px, pz) => {
        const cx = Math.floor(px / CHUNK_SIZE);
        const cz = Math.floor(pz / CHUNK_SIZE);

        for (let x = cx - RENDER_DISTANCE; x <= cx + RENDER_DISTANCE; x++) {
            for (let z = cz - RENDER_DISTANCE; z <= cz + RENDER_DISTANCE; z++) {
                const key = getChunkKey(x, z);
                if (!chunks.has(key)) {
                    chunks.set(key, new Chunk(x, z));
                }
            }
        }
        for (const [key, chunk] of chunks) {
            const dist = Math.sqrt((chunk.cx - cx)**2 + (chunk.cz - cz)**2);
            if (dist > RENDER_DISTANCE + 1) {
                chunk.dispose();
                chunks.delete(key);
            }
        }
    }
};

// --- GAMEPLAY ---
const controls = new PointerLockControls(camera, document.body);
const player = {
    pos: new THREE.Vector3(0, 30, 0),
    vel: new THREE.Vector3(),
    onGround: false
};
const keys = { w:false, a:false, s:false, d:false, space:false };

camera.position.copy(player.pos);

function checkCollision(newPos) {
    const x = newPos.x;
    const y = newPos.y;
    const z = newPos.z;

    const minX = Math.floor(x - PLAYER_RADIUS);
    const maxX = Math.floor(x + PLAYER_RADIUS);
    const minY = Math.floor(y); 
    const maxY = Math.floor(y + PLAYER_HEIGHT); 
    const minZ = Math.floor(z - PLAYER_RADIUS);
    const maxZ = Math.floor(z + PLAYER_RADIUS);

    for (let bx = minX; bx <= maxX; bx++) {
        for (let by = minY; by <= maxY; by++) {
            for (let bz = minZ; bz <= maxZ; bz++) {
                const block = world.getBlock(bx, by, bz);
                if (block !== 0) { 
                     return true;
                }
            }
        }
    }
    return false;
}

function updatePhysics(dt) {
    if (controls.isLocked) {
        player.vel.y -= GRAVITY * dt;

        const forward = new THREE.Vector3(0,0,-1).applyQuaternion(camera.quaternion);
        forward.y = 0; forward.normalize();
        const right = new THREE.Vector3(1,0,0).applyQuaternion(camera.quaternion);
        right.y = 0; right.normalize();

        const moveDir = new THREE.Vector3();
        if (keys.w) moveDir.add(forward);
        if (keys.s) moveDir.sub(forward);
        if (keys.d) moveDir.add(right);
        if (keys.a) moveDir.sub(right);

        if (moveDir.length() > 0) moveDir.normalize();
        else isSprinting = false; // Disable sprint if stopped
        
        player.vel.x -= player.vel.x * 10 * dt; 
        player.vel.z -= player.vel.z * 10 * dt;
        
        const currentSpeed = isSprinting ? SPEED * 1.8 : SPEED;
        player.vel.x += moveDir.x * currentSpeed * 10 * dt; 
        player.vel.z += moveDir.z * currentSpeed * 10 * dt;

        if (keys.space && player.onGround) {
            player.vel.y = JUMP_FORCE;
            player.onGround = false;
        }
        
        let nextX = player.pos.x + player.vel.x * dt;
        if (checkCollision(new THREE.Vector3(nextX, player.pos.y, player.pos.z))) {
            player.vel.x = 0; 
        } else {
            player.pos.x = nextX;
        }

        let nextZ = player.pos.z + player.vel.z * dt;
        if (checkCollision(new THREE.Vector3(player.pos.x, player.pos.y, nextZ))) {
            player.vel.z = 0;
        } else {
            player.pos.z = nextZ;
        }
        
        let nextY = player.pos.y + player.vel.y * dt;
        if (checkCollision(new THREE.Vector3(player.pos.x, nextY, player.pos.z))) {
             if (player.vel.y < 0) player.onGround = true; 
             player.vel.y = 0;
        } else {
            player.pos.y = nextY;
            player.onGround = false;
        }

        if (player.pos.y < -30) {
            player.pos.set(0, 40, 0);
            player.vel.set(0, 0, 0);
        }

        camera.position.copy(player.pos);
        camera.position.y += PLAYER_HEIGHT * 0.9; 
    }
}

const raycaster = new THREE.Raycaster();
raycaster.far = 5;
const center = new THREE.Vector2(0, 0);

const wireGeo = new THREE.BoxGeometry(1.005, 1.005, 1.005);
const wireMat = new THREE.LineBasicMaterial({ color: 0x000000, linewidth: 2 });
const wireMesh = new THREE.LineSegments(new THREE.EdgesGeometry(wireGeo), wireMat);
scene.add(wireMesh);
wireMesh.visible = false;

let highlightPos = null;
let buildPos = null;

function updateRaycaster() {
    raycaster.setFromCamera(center, camera);
    const targets = Array.from(chunks.values()).map(c => c.meshGroup);
    const intersects = raycaster.intersectObjects(targets, true); 
    
    if (intersects.length > 0) {
        for (let hit of intersects) {
            if (hit.object.isInstancedMesh) {
                const p = hit.point.clone().add(hit.face.normal.clone().multiplyScalar(-0.001));
                const bx = Math.floor(p.x);
                const by = Math.floor(p.y);
                const bz = Math.floor(p.z);
                
                wireMesh.position.set(bx + 0.5, by + 0.5, bz + 0.5);
                wireMesh.visible = true;
                highlightPos = { x: bx, y: by, z: bz };
                
                const bp = hit.point.clone().add(hit.face.normal.clone().multiplyScalar(0.001));
                buildPos = { x: Math.floor(bp.x), y: Math.floor(bp.y), z: Math.floor(bp.z) };
                return;
            }
        }
    }
    wireMesh.visible = false;
    highlightPos = null;
    buildPos = null;
}

// --- UI & EVENTS ---
let activeSlotIndex = 0; // 0-8
const menuOverlay = document.getElementById('menu-overlay');
const resumeBtn = document.getElementById('resume-btn');
const volumeSlider = document.getElementById('volume-slider');
const inventoryScreen = document.getElementById('inventory-screen');
const hotbarDiv = document.getElementById('hotbar');
const inventoryGrid = document.getElementById('inventory-grid');
const inventoryHotbarGrid = document.getElementById('inventory-hotbar-grid');
const cursorItemEl = document.getElementById('cursor-item');

let isInventoryOpen = false;

function renderUI() {
    // Render Hotbar
    hotbarDiv.innerHTML = '';
    for (let i = 0; i < 9; i++) {
        const slotEl = document.createElement('div');
        slotEl.className = 'slot' + (i === activeSlotIndex ? ' active' : '');
        slotEl.dataset.id = i;
        createSlotContent(slotEl, inventory[i]);
        hotbarDiv.appendChild(slotEl);
    }
    
    // Render Inventory Screen
    if (isInventoryOpen) {
        inventoryGrid.innerHTML = '';
        // Main inventory slots (9-35)
        for (let i = 9; i < 36; i++) {
            const slotEl = document.createElement('div');
            slotEl.className = 'slot';
            slotEl.onclick = () => handleSlotClick(i);
            createSlotContent(slotEl, inventory[i]);
            inventoryGrid.appendChild(slotEl);
        }
        
        if (inventoryHotbarGrid) {
            inventoryHotbarGrid.innerHTML = '';
            // Hotbar slots (0-8)
            for (let i = 0; i < 9; i++) {
                const slotEl = document.createElement('div');
                slotEl.className = 'slot';
                slotEl.onclick = () => handleSlotClick(i);
                createSlotContent(slotEl, inventory[i]);
                inventoryHotbarGrid.appendChild(slotEl);
            }
        }
    }
}

function createSlotContent(slot, item) {
    if (item) {
        const img = document.createElement('img');
        img.src = itemIcons[item.type];
        slot.appendChild(img);
        
        const count = document.createElement('div');
        count.className = 'item-count';
        count.innerText = item.count;
        slot.appendChild(count);
    }
}

function handleSlotClick(index) {
    const item = inventory[index];
    
    if (!cursorItem) {
        if (item) {
            cursorItem = item;
            inventory[index] = null;
        }
    } else {
        if (!item) {
            inventory[index] = cursorItem;
            cursorItem = null;
        } else {
            if (item.type === cursorItem.type) {
                const space = 64 - item.count;
                const toAdd = Math.min(space, cursorItem.count);
                item.count += toAdd;
                cursorItem.count -= toAdd;
                if (cursorItem.count <= 0) cursorItem = null;
            } else {
                const temp = item;
                inventory[index] = cursorItem;
                cursorItem = temp; 
            }
        }
    }
    renderUI();
    updateCursorVisual();
}

function updateCursorVisual() {
    if (cursorItem && cursorItemEl) {
        cursorItemEl.style.display = 'block';
        const img = cursorItemEl.querySelector('img');
        if(img) img.src = itemIcons[cursorItem.type];
        const count = cursorItemEl.querySelector('.item-count');
        if(count) count.innerText = cursorItem.count;
    } else if (cursorItemEl) {
        cursorItemEl.style.display = 'none';
    }
}

document.addEventListener('mousemove', (e) => {
    if (cursorItem && cursorItemEl) {
        cursorItemEl.style.left = (e.pageX - 20) + 'px';
        cursorItemEl.style.top = (e.pageY - 20) + 'px';
    }
});

function toggleInventory() {
    isInventoryOpen = !isInventoryOpen;
    if (isInventoryOpen) {
        controls.unlock();
        inventoryScreen.style.display = 'flex';
        renderUI();
        updateCursorVisual();
    } else {
        controls.lock();
        inventoryScreen.style.display = 'none';
        menuOverlay.style.display = 'none';
        
        if (cursorItem) {
             addToInventory(cursorItem.type, cursorItem.count);
             cursorItem = null;
             updateCursorVisual();
        }
    }
}

resumeBtn.addEventListener('click', () => { 
    if(!isInventoryOpen) controls.lock(); 
});
volumeSlider.addEventListener('input', (e) => {
    soundVolume = e.target.value;
    blockBreakSound.volume = soundVolume;
});

controls.addEventListener('lock', () => {
    menuOverlay.style.display = 'none';
    inventoryScreen.style.display = 'none';
    isInventoryOpen = false;
    if(cursorItemEl) cursorItemEl.style.display = 'none';
});
controls.addEventListener('unlock', () => {
    if (!isInventoryOpen) menuOverlay.style.display = 'flex';
});

document.addEventListener('keydown', (e) => {
    if (e.code === 'KeyE') {
        toggleInventory();
        return;
    }
    
    if (isInventoryOpen) return; // Block input when inventory open

    switch (e.code) {
        case 'KeyW': keys.w = true; break;
        case 'KeyA': keys.a = true; break;
        case 'KeyS': keys.s = true; break;
        case 'KeyD': keys.d = true; break;
        case 'Space': keys.space = true; break;
        case 'ControlLeft': isSprinting = !isSprinting; break;
        case 'Digit1': activeSlotIndex = 0; break;
        case 'Digit2': activeSlotIndex = 1; break;
        case 'Digit3': activeSlotIndex = 2; break;
        case 'Digit4': activeSlotIndex = 3; break;
        case 'Digit5': activeSlotIndex = 4; break;
        case 'Digit6': activeSlotIndex = 5; break;
        case 'Digit7': activeSlotIndex = 6; break;
        case 'Digit8': activeSlotIndex = 7; break;
        case 'Digit9': activeSlotIndex = 8; break;
    }
    if(e.code >= 'Digit1' && e.code <= 'Digit9') renderUI();
});
document.addEventListener('keyup', (e) => {
    switch (e.code) {
        case 'KeyW': keys.w = false; break;
        case 'KeyA': keys.a = false; break;
        case 'KeyS': keys.s = false; break;
        case 'KeyD': keys.d = false; break;
        case 'Space': keys.space = false; break;
    }
});
window.addEventListener('wheel', (e) => {
    if (isInventoryOpen) return;
    if (e.deltaY > 0) activeSlotIndex = (activeSlotIndex + 1) % 9;
    else activeSlotIndex = (activeSlotIndex - 1 + 9) % 9;
    renderUI();
});

document.addEventListener('mousedown', (e) => {
    if (!controls.isLocked || isInventoryOpen) return;
    
    if (e.button === 0 && highlightPos) { 
        world.setBlock(highlightPos.x, highlightPos.y, highlightPos.z, 0);
        blockBreakSound.currentTime = 0;
        blockBreakSound.play();
        swingHand();
    }
    if (e.button === 0 && !highlightPos) {
        swingHand();
    }
    if (e.button === 2 && buildPos) { 
        swingHand();
        const item = inventory[activeSlotIndex];
        if (!item) return;

        const pBoxMin = new THREE.Vector3(player.pos.x - 0.3, player.pos.y, player.pos.z - 0.3);
        const pBoxMax = new THREE.Vector3(player.pos.x + 0.3, player.pos.y + 1.8, player.pos.z + 0.3);
        const bBoxMaxPos = new THREE.Vector3(buildPos.x+1, buildPos.y+1, buildPos.z+1);
        
        const intersect = (pBoxMin.x < bBoxMaxPos.x && pBoxMax.x > buildPos.x) &&
                          (pBoxMin.y < bBoxMaxPos.y && pBoxMax.y > buildPos.y) &&
                          (pBoxMin.z < bBoxMaxPos.z && pBoxMax.z > buildPos.z);
                          
        if (!intersect) {
            world.setBlock(buildPos.x, buildPos.y, buildPos.z, item.type);
            item.count--;
            if (item.count <= 0) {
                inventory[activeSlotIndex] = null;
            }
            renderUI();
        }
    }
});

let prevTime = performance.now();

function animate() {
    requestAnimationFrame(animate);

    const time = performance.now();
    const dt = Math.min((time - prevTime) / 1000, 0.1); 
    prevTime = time;

    updatePhysics(dt);
    updateDrops(dt);
    updateHand(dt);
    updateClouds(dt);
    world.update(player.pos.x, player.pos.z);
    updateRaycaster();

    // Render main scene
    renderer.render(scene, camera);
    
    // Render hand on top (no depth clear, just color)
    renderer.autoClear = false;
    renderer.clearDepth();
    renderer.render(handScene, handCamera);
    renderer.autoClear = true;
}

world.update(0,0);
renderUI();
animate();

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    handCamera.aspect = window.innerWidth / window.innerHeight;
    handCamera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});
