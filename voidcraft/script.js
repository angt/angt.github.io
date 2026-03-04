'use strict';

// ============================================================================
// INITIALIZATION
// ============================================================================

const canvas = document.getElementById('glCanvas');
const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, preserveDrawingBuffer: false });

if (!gl) throw new Error('WebGL2 not supported');

let W = window.innerWidth, H = window.innerHeight;
canvas.width = W; canvas.height = H;
gl.viewport(0, 0, W, H);

function C(idx, bright = 1.0) {
    const c = PALETTE[idx % 64];
    return [c[0] * bright, c[1] * bright, c[2] * bright];
}

const vsSource = `#version 300 es
in vec2 aPos; in vec3 aCol; out vec3 vCol; uniform vec2 uRes;
void main() { vec2 pos = aPos / uRes * 2.0 - 1.0; pos.y = -pos.y; gl_Position = vec4(pos, 0.0, 1.0); vCol = aCol; }`;

const fsSource = `#version 300 es
precision highp float; in vec3 vCol; out vec4 FragColor;
void main() { FragColor = vec4(vCol, 1.0); }`;

function createProgram(vs, fs) {
    const p = gl.createProgram();
    const vsShader = gl.createShader(gl.VERTEX_SHADER);
    gl.shaderSource(vsShader, vs);
    gl.compileShader(vsShader);
    const fsShader = gl.createShader(gl.FRAGMENT_SHADER);
    gl.shaderSource(fsShader, fs);
    gl.compileShader(fsShader);
    gl.attachShader(p, vsShader);
    gl.attachShader(p, fsShader);
    gl.linkProgram(p);
    return p;
}

const prog = createProgram(vsSource, fsSource);
const uRes = gl.getUniformLocation(prog, 'uRes');
const aPos = gl.getAttribLocation(prog, 'aPos');
const aCol = gl.getAttribLocation(prog, 'aCol');

const posBuf = gl.createBuffer();
const colBuf = gl.createBuffer();
const vao = gl.createVertexArray();
gl.bindVertexArray(vao);
gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
gl.enableVertexAttribArray(aPos);
gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
gl.bindBuffer(gl.ARRAY_BUFFER, colBuf);
gl.enableVertexAttribArray(aCol);
gl.vertexAttribPointer(aCol, 3, gl.FLOAT, false, 0, 0);
gl.bindVertexArray(null);

const posArray = new Float32Array(MAX_VERTICES * 2);
const colArray = new Float32Array(MAX_VERTICES * 3);
let vertexCount = 0;

// ============================================================================
// DOM ELEMENTS
// ============================================================================

const statsBar = document.getElementById('stats-bar');
const statusBar = document.getElementById('status-bar');
const atomTable = document.getElementById('atom-table');
const moduleInfo = document.getElementById('module-info');
const moduleList = document.getElementById('module-list');

// ============================================================================
// CONSTANTS
// ============================================================================

const sidebarModuleOrder = ['hull', 'energy', 'storage', 'canon', 'laser', 'radar', 'collector', 'singularity'];

const atomLayout = [
    ['H',  null, null, 'Fe'],
    ['C',   'N',  'O', 'Si'],
    ['Li', 'Al', 'Ar', null],
    ['Ti', null, 'Nd', 'Au']
];

// ============================================================================
// STATUS BAR LOGGING
// ============================================================================

const MAX_STATUS_MESSAGES = 50;
const statusMessages = [];

function logStatus(message, type = 'info') {
    const msgDiv = document.createElement('div');
    msgDiv.className = `status-message status-${type}`;
    msgDiv.innerHTML = message;
    statusBar.appendChild(msgDiv);
    statusMessages.push(msgDiv);

    while (statusMessages.length > MAX_STATUS_MESSAGES) {
        const old = statusMessages.shift();
        if (old && old.parentNode) old.parentNode.removeChild(old);
    }

    statusBar.scrollTop = statusBar.scrollHeight;
}

// ============================================================================
// OBJECT POOLS
// ============================================================================

const pools = {
    projectile: { arr: [], max: 200, create: () => ({ x: 0, y: 0, vx: 0, vy: 0, damage: 0, color: 0, life: 0 }) },
    atom: { arr: [], max: 500, create: () => ({ x: 0, y: 0, type: '', amount: 0, color: 0, phase: 0 }) },
    drone: { arr: [], max: 100, create: () => ({ owner: null, x: 0, y: 0, cargo: null }) },
    shockwave: { arr: [], max: 20, create: () => ({ x: 0, y: 0, radius: 0, maxRadius: 0, life: 0, alpha: 1, type: 'normal' }) },
    singParticle: { arr: [], max: 500, create: () => ({ x: 0, y: 0, angle: 0, radius: 0, speed: 0, brightness: 0, size: 0, life: 0, maxLife: 0, ownerX: 0, ownerY: 0 }) },
    voidRift: { arr: [], max: 20, create: () => ({ x: 0, y: 0, radius: 0, maxRadius: 0, life: 0, maxLife: 0, phase: 0 }) },
    powerParticle: { arr: [], max: 300, create: () => ({ sourceX: 0, sourceY: 0, targetX: 0, targetY: 0, progress: 0, speed: 0, size: 0 }) }
};

function getFromPool(name) {
    const obj = pools[name].arr.pop() || pools[name].create();
    if (name === 'drone') {
        obj.cargo = Cargo(DRONE.capacity._capacity);
        obj.owner = null;
    }
    return obj;
}

function returnToPool(name, obj) {
    if (pools[name].arr.length < pools[name].max) {
        pools[name].arr.push(obj);
    }
}

// ============================================================================
// GAME STATE
// ============================================================================

const blocks = [], bridges = [], aliens = [], projectiles = [], atoms = [], drones = [];
const shockwaves = [], singularityParticles = [], voidRifts = [], powerLinkParticles = [];
let gameTime = 0, elapsedTime = 0, gameOver = false, totalKills = 0, isPaused = false;
let energy = { produced: 0, consumed: 0 };
let coreCargo = CORE_BLOCK.capacity.clone(true);

// ============================================================================
// STORAGE SYSTEM
// ============================================================================

function getAllStorages() {
    const storages = [];
    if (coreCargo) storages.push({ cargo: coreCargo, block: null });
    for (const b of blocks) {
        if (b.type === 'storage' && b.operational && b.cargo) {
            storages.push({ cargo: b.cargo, block: b });
        }
    }
    return storages;
}

function getTotalStorageView() {
    const total = Cargo();
    for (const { cargo } of getAllStorages()) {
        for (const type of ATOM_TYPES) {
            total._capacity[type] = (total._capacity[type] || 0) + cargo.capacity(type);
            if (cargo.get(type) > 0) {
                total._contents[type] = (total._contents[type] || 0) + cargo.get(type);
            }
        }
    }
    return total;
}

function hasStorageSpace(atomType, amount = 1) {
    return getTotalStorageView().hasSpace(atomType, amount);
}

function checkAnyStorageHasSpace() {
    return ATOM_TYPES.some(type => getTotalStorageView().space(type) > 0);
}

function canAfford(costObj) {
    const cost = costObj._capacity || costObj;
    const total = getTotalStorageView();
    return Object.entries(cost).every(([type, needed]) => total.get(type) >= needed);
}

function deductResources(costObj) {
    const cost = costObj._capacity || costObj;
    for (const type of ATOM_TYPES) {
        let needed = cost[type] || 0;
        if (needed <= 0) continue;
        for (const { cargo } of getAllStorages()) {
            if (needed <= 0) break;
            needed -= cargo.remove(type, needed);
        }
    }
}

// ============================================================================
// NETWORK STRUCTURE
// ============================================================================

function rebuildShipNetwork() {
    for (let i = bridges.length - 1; i >= 0; i--) {
        const { from, to } = bridges[i];
        if (!blocks.includes(from) || !blocks.includes(to)) {
            bridges.splice(i, 1);
        }
    }

    const children = new Map();
    for (const b of blocks) children.set(b, []);
    for (const bridge of bridges) {
        children.get(bridge.from).push(bridge.to);
    }

    for (const b of blocks) b.operational = false;

    const core = blocks.find(b => b.type === 'core');
    if (!core) return;

    const queue = [core];
    const visited = new Set([core]);
    core.operational = true;

    let produced = BLOCKS.core.energyProduce;
    const consumers = [];

    while (queue.length > 0) {
        const current = queue.shift();

        for (const child of children.get(current)) {
            if (visited.has(child)) continue;
            visited.add(child);

            const def = BLOCKS[child.type];

            if (def.energyProduce > 0) {
                produced += def.energyProduce;
                child.operational = true;
            } else if (def.energyCost > 0) {
                consumers.push({ block: child, cost: def.energyCost });
            } else {
                child.operational = true;
            }

            queue.push(child);
        }
    }

    shuffleArray(consumers);
    let available = produced;

    for (const { block, cost } of consumers) {
        if (available >= cost) {
            available -= cost;
            block.operational = true;
        }
    }

    energy.produced = produced;
    energy.consumed = produced - available;

    for (const b of blocks) if (b.type === 'collector') b.droneCount = 0;
    for (const d of drones) {
        const c = blocks.find(b => b.type === 'collector' && b.operational && b.droneCount < 6);
        if (c) { d.owner = c; c.droneCount++; }
        else d.owner = null;
    }
}

// ============================================================================
// UI RENDERING
// ============================================================================

function getAtomCSSColor(atomType) {
    const idx = ATOM_COLORS[atomType];
    const c = PALETTE[idx] || [0.5, 0.5, 0.5];
    return `rgb(${Math.floor(c[0]*255)}, ${Math.floor(c[1]*255)}, ${Math.floor(c[2]*255)})`;
}

function renderAtomTable(costObj = null) {
    const total = getTotalStorageView();

    let html = '';
    for (const row of atomLayout) {
        for (const atom of row) {
            if (atom === null) {
                html += '<div class="atom-cell empty"><span class="atom-symbol">-</span><span class="atom-count">&nbsp;</span></div>';
            } else if (costObj) {
                const needed = costObj[atom] || 0;
                const have = total.get(atom);
                const hasResource = have >= needed;
                const color = getAtomCSSColor(atom);

                html += `<div class="atom-cell ${needed > 0 ? (hasResource ? '' : 'missing') : 'empty'}">`;
                html += `<span class="atom-symbol" style="color: ${color};">${atom}</span>`;
                html += `<span class="atom-count">${needed}</span></div>`;
            } else {
                const have = total.get(atom);
                const max = total.capacity(atom);
                const isFull = have >= max && max > 0;
                const color = getAtomCSSColor(atom);

                html += `<div class="atom-cell${isFull ? ' full' : ''}">`;
                html += `<span class="atom-symbol" style="color: ${color};">${atom}</span>`;
                html += `<span class="atom-count">${have}/${max}</span></div>`;
            }
        }
    }
    atomTable.innerHTML = html;
}

function showModuleInfo(type) {
    const def = BLOCKS[type];
    if (!def) return;

    const costObj = def.cost._capacity || def.cost;
    renderAtomTable(costObj);

    moduleInfo.innerHTML = `
        <div class="info-name">${def.name}</div>
        <div class="info-desc">${def.desc}</div>
    `;
    moduleInfo.classList.add('visible');
}

function hideModuleInfo() {
    renderAtomTable();
    moduleInfo.classList.remove('visible');
    moduleInfo.innerHTML = '';
}

function updateUI() {
    if (!draggingBlock) {
        renderAtomTable();
    }

    statsBar.innerHTML = `
        <div class="stat-time">${Math.floor(gameTime / 1000)}s</div>
        <div class="stat-kills">${totalKills}</div>
    `;
}

function updatePanelAffordability() {
    const items = moduleList.querySelectorAll('.module-item');
    items.forEach(item => {
        const def = BLOCKS[item._blockType];
        if (!def) return;
        item.classList.toggle('unaffordable', !canAfford(def.cost));
    });
}

// ============================================================================
// MODULE PREVIEW RENDERING
// ============================================================================

function renderModulePreview(type, canvas) {
    const def = BLOCKS[type];
    if (!def) return;

    const ctx = canvas.getContext('2d');
    const size = canvas.width;
    ctx.clearRect(0, 0, size, size);

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const sq of def.squares) {
        minX = Math.min(minX, sq.x);
        maxX = Math.max(maxX, sq.x);
        minY = Math.min(minY, sq.y);
        maxY = Math.max(maxY, sq.y);
    }

    const rangeX = maxX - minX + 1;
    const rangeY = maxY - minY + 1;
    const scale = Math.min(size / (rangeX * 1.15), size / (rangeY * 1.15));
    const offsetX = (size - rangeX * scale) / 2 - minX * scale;
    const offsetY = (size - rangeY * scale) / 2 - minY * scale;

    for (const sq of def.squares) {
        const c = PALETTE[sq.c] || [0.5, 0.5, 0.5];
        ctx.fillStyle = `rgb(${Math.floor(c[0]*255)}, ${Math.floor(c[1]*255)}, ${Math.floor(c[2]*255)})`;
        ctx.fillRect(offsetX + sq.x * scale, offsetY + sq.y * scale, scale - 0.5, scale - 0.5);
    }
}

// ============================================================================
// MAIN PANEL INITIALIZATION
// ============================================================================

function initMainPanel() {
    for (const type of sidebarModuleOrder) {
        const def = BLOCKS[type];
        if (!def) continue;

        const item = document.createElement('div');
        item.className = 'module-item';
        item.dataset.type = type;

        const previewCanvas = document.createElement('canvas');
        previewCanvas.width = 32;
        previewCanvas.height = 32;
        renderModulePreview(type, previewCanvas);

        item.innerHTML = `
            <div class="module-preview"></div>
            <div class="module-details">
                <div class="module-name">${def.name}</div>
            </div>
        `;

        item.querySelector('.module-preview').appendChild(previewCanvas);
        item._blockType = type;

        moduleList.appendChild(item);
    }

    moduleList.addEventListener('mousedown', e => {
        const item = e.target.closest('.module-item');
        if (item) dragStart(item._blockType, e.clientX, e.clientY);
    });

    moduleList.addEventListener('touchstart', e => {
        e.preventDefault();
        const touch = e.touches[0];
        const item = document.elementFromPoint(touch.clientX, touch.clientY)?.closest('.module-item');
        if (item) dragStart(item._blockType, touch.clientX, touch.clientY);
    }, { passive: false });
}

// ============================================================================
// BLOCK CREATION
// ============================================================================

function createBlock(type, x, y) {
    const def = BLOCKS[type];

    const block = {
        type,
        x, y,
        hp: def.hp,
        operational: false,
        rotation: 0,
        animOffset: Math.random() * 100,
        animPulse: 0,
        cooldown: 0,
        defenseCooldown: 0,
        droneCount: 0,
        cargo: null,
        buildCost: def.cost.clone ? def.cost.clone(true) : Cargo(def.cost._capacity || def.cost),
        triggerCooldown: 0,
        isCharging: false,
        chargeLevel: 0,
        chargeStartTime: 0,
        chargeDuration: def.cooldown || 1500,
        laserTarget: null,
        nearbyAtoms: {},
    };

    if (type === 'storage' && def.capacity) {
        block.cargo = Cargo(def.capacity._capacity);
    }

    return block;
}

function spawnAtomsFromCargo(cargo, x, y, spread = 30) {
    for (const type of cargo.types()) {
        const angle = Math.random() * Math.PI * 2;
        const dist = Math.random() * spread;
        const atom = getFromPool('atom');
        atom.x = x + Math.cos(angle) * dist;
        atom.y = y + Math.sin(angle) * dist;
        atom.type = type;
        atom.amount = cargo.get(type);
        atom.color = ATOM_COLORS[type];
        atom.phase = Math.random() * Math.PI * 2;
        atoms.push(atom);
    }
}

// ============================================================================
// DRAG & DROP
// ============================================================================

let draggingBlock = null;

function findValidLinkTarget(type, x, y) {
    let nearest = null;
    let nearestDist = Infinity;
    const maxDist = 350;

    const energyConsumers = ['storage', 'canon', 'laser', 'collector', 'singularity'];
    const weapons = ['canon', 'laser', 'singularity'];
    const powerSources = ['core', 'energy', 'hull'];

    for (const b of blocks) {
        if (b === draggingBlock) continue;

        const d = Math.hypot(b.x - x, b.y - y);
        if (d > maxDist) continue;

        let isValid = false;

        switch (type) {
            case 'energy':
                isValid = energyConsumers.includes(b.type);
                break;
            case 'hull':
                isValid = powerSources.includes(b.type);
                break;
            case 'canon':
            case 'laser':
            case 'collector':
            case 'storage':
            case 'singularity':
                isValid = powerSources.includes(b.type);
                break;
            case 'radar':
                isValid = weapons.includes(b.type);
                break;
        }

        if (isValid && d < nearestDist) {
            nearestDist = d;
            nearest = b;
        }
    }

    return nearest;
}

function shuffleArray(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
}

function createBridge(b1, b2) {
    const dx = b2.x - b1.x, dy = b2.y - b1.y;
    const dist = Math.hypot(dx, dy);
    const steps = Math.floor(dist / (B * 2.5));
    const squares = [];
    for (let i = 1; i < steps; i++) {
        const t = i / steps;
        squares.push({ x: b1.x + dx * t, y: b1.y + dy * t, c: i % 2 === 0 ? 60 : 62, phase: Math.random() * Math.PI * 2 });
    }
    bridges.push({ from: b1, to: b2, squares });
}

function placeBlock(block) {
    const def = BLOCKS[block.type];
    deductResources(def.cost);
    createBridge(block.nearestBlock, block);
    delete block.canPlace;
    delete block.needsMoreEnergy;
    delete block.nearestBlock;
    delete block.dragStartTime;
    rebuildShipNetwork();
    logStatus(`${def.name} built`, 'success');
}

function dragStart(type, x, y) {
    if (gameOver || !canAfford(BLOCKS[type].cost)) return;

    const nearestBlock = findValidLinkTarget(type, x, y);
    const def = BLOCKS[type];

    draggingBlock = createBlock(type, x, y);
    draggingBlock.initialRotation = Math.floor(Math.random() * 4);
    draggingBlock.rotation = draggingBlock.initialRotation;
    draggingBlock.dragStartTime = gameTime;
    draggingBlock.canPlace = nearestBlock !== null;
    draggingBlock.needsMoreEnergy = def.energyCost > 0 && nearestBlock?.type === 'hull';
    draggingBlock.nearestBlock = nearestBlock;

    blocks.push(draggingBlock);
    showModuleInfo(type);
}

function moveEvent(x, y) {
    if (!draggingBlock) return;

    draggingBlock.x = x;
    draggingBlock.y = y;
    const nearestBlock = findValidLinkTarget(draggingBlock.type, x, y);
    const def = BLOCKS[draggingBlock.type];

    draggingBlock.nearestBlock = nearestBlock;
    draggingBlock.canPlace = nearestBlock !== null && canAfford(def.cost);
    draggingBlock.needsMoreEnergy = def.energyCost > 0 && nearestBlock?.type === 'hull';
}

function moveEnd(cancel = false) {
    if (!draggingBlock) return;

    if (!cancel && draggingBlock.canPlace) {
        placeBlock(draggingBlock);
    } else {
        const idx = blocks.indexOf(draggingBlock);
        if (idx !== -1) blocks.splice(idx, 1);
    }
    draggingBlock = null;
    hideModuleInfo();
}

canvas.addEventListener('contextmenu', e => e.preventDefault());
canvas.addEventListener('mouseleave', () => moveEnd(true));
canvas.addEventListener('mousemove', e => moveEvent(e.clientX, e.clientY));
canvas.addEventListener('touchmove', e => {
    e.preventDefault();
    if (e.touches.length) moveEvent(e.touches[0].clientX, e.touches[0].clientY);
}, { passive: false });

document.addEventListener('mouseup', () => moveEnd());
document.addEventListener('touchend', e => { e.preventDefault(); moveEnd(); });
document.addEventListener('touchcancel', () => moveEnd(true));

// ============================================================================
// ALIEN SPAWNING
// ============================================================================

let spawnAngle = Math.random() * Math.PI * 2;
let spawnDist = 0;
let spawnTime = 0;
let spawnUpdateTime = 0;

function updateSpawning() {
    if (gameTime < spawnUpdateTime + 1000) return;
    spawnUpdateTime = gameTime;

    if (Math.random() < 0.3) {
        const dt = (gameTime - spawnTime) / 1000;
        const r = Math.random() * Math.random() * gameTime / 1000;
        for (let i = 0; i < 1 + Math.floor(dt * dt + r); i++) {
            spawnAlien();
        }
        spawnTime = gameTime;
    }
}

function spawnAlien() {
    const minDist = Math.max(W, H) * 0.6;
    const maxDist = Math.max(W, H) * 1.0;

    spawnAngle += (Math.random() - 0.5) * 0.1;
    spawnDist += (Math.random() - 0.5) * 20;
    spawnDist = Math.max(minDist, Math.min(maxDist, spawnDist));
    const size = 0.5 + Math.random() * Math.random() * 4;

    aliens.push({
        x: W / 2 + Math.cos(spawnAngle) * spawnDist,
        y: H / 2 + Math.sin(spawnAngle) * spawnDist,
        size: size,
        hp: size * 20,
        damage: size * 5,
        speed: Math.max(0.1, 0.5 - size * 0.08 + Math.random() * 0.1),
        phase: Math.random() * Math.PI * 2,
        seed: Math.random() * 1000,
        attackCooldown: 0
    });
}

let singularityWarningActive = false;
let storageFullWarned = false;

// ============================================================================
// SINGULARITY PULSE
// ============================================================================

function fireSingularity(block) {
    const def = BLOCKS.singularity;
    const range = def.range;

    singularityWarningActive = false;
    logStatus('SINGULARITY PULSE ACTIVATED!', 'special');
    block.isCharging = false;

    const sw = getFromPool('shockwave');
    sw.x = block.x; sw.y = block.y; sw.radius = 0; sw.maxRadius = range; sw.life = 1500; sw.alpha = 1; sw.type = 'singularity';
    shockwaves.push(sw);

    const rift = getFromPool('voidRift');
    rift.x = block.x; rift.y = block.y; rift.radius = range * 0.8; rift.maxRadius = range; rift.life = 3000; rift.maxLife = 3000; rift.phase = 0;
    voidRifts.push(rift);

    let killedCount = 0;
    for (let i = aliens.length - 1; i >= 0; i--) {
        const a = aliens[i];
        if (Math.hypot(a.x - block.x, a.y - block.y) < range) {
            totalKills++;
            killedCount++;
            for (let j = 0; j < Math.floor(a.size * 12); j++) {
                const p = getFromPool('singParticle');
                p.x = a.x; p.y = a.y;
                p.angle = Math.random() * Math.PI * 2;
                p.radius = Math.hypot(a.x - block.x, a.y - block.y);
                p.speed = 0.08 + Math.random() * 0.06;
                p.brightness = 0.8 + Math.random() * 0.2;
                p.size = 1.5 + Math.random() * 2;
                p.life = 500 + Math.random() * 500; p.maxLife = p.life;
                p.ownerX = block.x; p.ownerY = block.y;
                singularityParticles.push(p);
            }
            aliens.splice(i, 1);
        }
    }

    let atomsDestroyed = 0;
    for (let i = atoms.length - 1; i >= 0; i--) {
        if (Math.hypot(atoms[i].x - block.x, atoms[i].y - block.y) < range) {
            atomsDestroyed++;
            returnToPool('atom', atoms[i]);
            atoms.splice(i, 1);
        }
    }

    logStatus(`Singularity destroyed ${killedCount} enemies, ${atomsDestroyed} atoms lost`, 'warning');
    block.triggerCooldown = def.cooldown;
    block.chargeLevel = 0;
}

// ============================================================================
// DRONE SYSTEM
// ============================================================================

function moveToward(drone, targetX, targetY, speed) {
    const angle = Math.atan2(targetY - drone.y, targetX - drone.x);
    const moveSpeed = speed * (elapsedTime / 16);
    drone.x += Math.cos(angle) * moveSpeed;
    drone.y += Math.sin(angle) * moveSpeed;
}

function orbitAround(drone, targetX, targetY, speed) {
    const angle = Math.atan2(drone.y - targetY, drone.x - targetX) + Math.PI/2 + (Math.random() - 0.5);
    const moveSpeed = speed * (elapsedTime / 16);
    drone.x += Math.cos(angle) * moveSpeed;
    drone.y += Math.sin(angle) * moveSpeed;
    drone.x += (targetX - drone.x) * 0.008 * (elapsedTime / 16);
    drone.y += (targetY - drone.y) * 0.008 * (elapsedTime / 16);
}

function updateDrone(drone) {
    const owner = drone.owner;
    const ownerOperational = owner && blocks.includes(owner) && owner.operational;

    let bestTarget = null;
    let bestDist = Infinity;
    let isStorage = false;

    if (!drone.cargo.isEmpty()) {
        const coreBlock = blocks.find(b => b.type === 'core');
        for (const { cargo, block } of getAllStorages()) {
            if (!drone.cargo.canStore(cargo)) continue;
            const storageBlock = block || coreBlock;
            if (!storageBlock) continue;
            const dist = Math.hypot(storageBlock.x - drone.x, storageBlock.y - drone.y);
            if (dist < bestDist) {
                bestDist = dist;
                bestTarget = storageBlock;
                isStorage = true;
            }
        }
    }

    if (ownerOperational && owner.nearbyAtoms) {
        for (const type in drone.cargo._capacity) {
            if (drone.cargo.space(type) <= 0) continue;
            if (!hasStorageSpace(type, 1)) continue;
            for (const a of owner.nearbyAtoms[type] || []) {
                const dist = Math.hypot(a.x - drone.x, a.y - drone.y);
                if (dist < bestDist) {
                    bestDist = dist;
                    bestTarget = a;
                    isStorage = false;
                }
            }
        }
    }

    if (!bestTarget) {
        let nearest = null, nearestDist = Infinity;
        for (const b of blocks) {
            const dist = Math.hypot(b.x - drone.x, b.y - drone.y);
            if (dist < nearestDist) { nearestDist = dist; nearest = b; }
        }
        if (nearest) orbitAround(drone, nearest.x, nearest.y, DRONE.speed);
        return;
    }

    if (bestDist < DRONE.range) {
        if (isStorage) {
            const cargo = bestTarget.type === 'core' ? coreCargo : bestTarget.cargo;
            if (cargo && drone.cargo.storeTo(cargo) > 0) {
                bestTarget.animPulse = 1;
            }
        } else {
            const collected = drone.cargo.add(bestTarget.type, bestTarget.amount);
            bestTarget.amount -= collected;
            if (bestTarget.amount <= 0) {
                const idx = atoms.indexOf(bestTarget);
                if (idx !== -1) {
                    returnToPool('atom', bestTarget);
                    atoms.splice(idx, 1);
                }
            }
        }
    } else {
        moveToward(drone, bestTarget.x, bestTarget.y, DRONE.speed);
    }
}

// ============================================================================
// GAME UPDATE
// ============================================================================

function getWeaponRange(weapon) {
    const base = BLOCKS[weapon.type].range;
    for (const b of bridges) {
        if (b.from === weapon && b.to.type === 'radar' && b.to.operational) {
            return base * BLOCKS.radar.rangeBoost;
        }
    }
    return base;
}

let atomUpdateTime = 0;

function refreshAtomCaches() {
    if (gameTime < atomUpdateTime + 1000) return;
    atomUpdateTime = gameTime;
    const range = BLOCKS.collector.range;
    for (const b of blocks) {
        if (b.type === 'collector' && b.operational) {
            for (const type of ATOM_TYPES) b.nearbyAtoms[type] = [];
            for (const a of atoms) {
                if (Math.hypot(a.x - b.x, a.y - b.y) <= range) {
                    b.nearbyAtoms[a.type].push(a);
                }
            }
        }
    }
}

function update() {
    refreshAtomCaches();

    if (draggingBlock && gameTime > draggingBlock.dragStartTime + 1000) {
        const dt = Math.floor((gameTime - draggingBlock.dragStartTime) / 1000);
        draggingBlock.rotation = (draggingBlock.initialRotation + dt) % 4;
    }

    for (const b of blocks) b.laserTarget = null;

    updateSpawning();

    // Singularity particles
    for (let i = singularityParticles.length - 1; i >= 0; i--) {
        const p = singularityParticles[i];
        p.angle += p.speed * (elapsedTime / 16);
        p.radius -= 1.5 * (elapsedTime / 16);
        p.x = p.ownerX + Math.cos(p.angle) * Math.max(0, p.radius);
        p.y = p.ownerY + Math.sin(p.angle) * Math.max(0, p.radius);
        p.life -= elapsedTime;
        p.brightness *= Math.pow(0.98, elapsedTime / 16);
        if (p.life <= 0 || p.radius <= 0) {
            returnToPool('singParticle', p);
            singularityParticles.splice(i, 1);
        }
    }

    // Void rifts
    for (let i = voidRifts.length - 1; i >= 0; i--) {
        voidRifts[i].life -= elapsedTime;
        if (voidRifts[i].life <= 0) {
            returnToPool('voidRift', voidRifts[i]);
            voidRifts.splice(i, 1);
        } else {
            voidRifts[i].phase += 0.05 * (elapsedTime / 16);
        }
    }

    // Power link particles
    for (let i = powerLinkParticles.length - 1; i >= 0; i--) {
        powerLinkParticles[i].progress += powerLinkParticles[i].speed * (elapsedTime / 16);
        if (powerLinkParticles[i].progress >= 1) {
            returnToPool('powerParticle', powerLinkParticles[i]);
            powerLinkParticles.splice(i, 1);
        }
    }

    // Spawn power particles
    for (const bridge of bridges) {
        const toDef = BLOCKS[bridge.to.type];
        if (bridge.to.operational && toDef.energyCost > 0 && Math.random() < 0.06 * (elapsedTime / 16)) {
            const p = getFromPool('powerParticle');
            p.sourceX = bridge.from.x; p.sourceY = bridge.from.y;
            p.targetX = bridge.to.x; p.targetY = bridge.to.y;
            p.progress = 0;
            p.speed = 0.02;
            p.size = 0.5;
            powerLinkParticles.push(p);
        }
    }

    // Storage warning
    const storageHasSpace = checkAnyStorageHasSpace();
    if (!storageHasSpace && !storageFullWarned) {
        logStatus('STORAGE FULL! Build Cargo Bays!', 'danger');
        storageFullWarned = true;
    } else if (storageHasSpace) {
        storageFullWarned = false;
    }

    // Block updates
    for (const b of blocks) {
        const def = BLOCKS[b.type];

        // Core defense
        if (b.type === 'core') {
            b.defenseCooldown = Math.max(0, b.defenseCooldown - elapsedTime);
            if (b.defenseCooldown <= 0) {
                let closest = null, minD = def.defenseRange;
                for (const a of aliens) {
                    const d = Math.hypot(a.x - b.x, a.y - b.y);
                    if (d < minD) { minD = d; closest = a; }
                }
                if (closest) {
                    const angle = Math.atan2(closest.y - b.y, closest.x - b.x);
                    const p = getFromPool('projectile');
                    p.x = b.x; p.y = b.y;
                    p.vx = Math.cos(angle) * 8; p.vy = Math.sin(angle) * 8;
                    p.damage = def.defenseDamage; p.color = 12; p.life = 2000;
                    projectiles.push(p);
                    b.defenseCooldown = def.defenseCooldown;
                    b.animPulse = 1;
                }
            }
        }

        // Plasma Cannon
        if (b.type === 'canon' && b.operational) {
            b.cooldown = Math.max(0, b.cooldown - elapsedTime);
            if (b.cooldown <= 0) {
                let closest = null, minD = getWeaponRange(b);
                for (const a of aliens) {
                    const d = Math.hypot(a.x - b.x, a.y - b.y);
                    if (d < minD) { minD = d; closest = a; }
                }
                if (closest) {
                    const angle = Math.atan2(closest.y - b.y, closest.x - b.x);
                    const p = getFromPool('projectile');
                    p.x = b.x; p.y = b.y;
                    p.vx = Math.cos(angle) * 12; p.vy = Math.sin(angle) * 12;
                    p.damage = def.damage; p.color = 28; p.life = 2500;
                    projectiles.push(p);
                    b.cooldown = def.cooldown;
                    b.animPulse = 1;
                }
            }
        }

        // Laser Array
        if (b.type === 'laser' && b.operational) {
            b.cooldown = Math.max(0, b.cooldown - elapsedTime);
            if (b.cooldown <= 0) {
                let closest = null, minD = getWeaponRange(b);
                for (const a of aliens) {
                    const d = Math.hypot(a.x - b.x, a.y - b.y);
                    if (d < minD) { minD = d; closest = a; }
                }
                if (closest) {
                    closest.hp -= def.damage;
                    b.laserTarget = closest;
                    b.animPulse = 1;
                    b.cooldown = def.cooldown;
                }
            }
        }

        // Singularity
        if (b.type === 'singularity' && b.operational) {
            b.triggerCooldown = Math.max(0, b.triggerCooldown - elapsedTime);

            if (Math.random() < 0.3 * (elapsedTime / 16) && !b.isCharging) {
                const p = getFromPool('singParticle');
                const angle = Math.random() * Math.PI * 2;
                const r = 25 + Math.random() * 15;
                p.x = b.x + Math.cos(angle) * r;
                p.y = b.y + Math.sin(angle) * r;
                p.angle = angle; p.radius = r;
                p.speed = 0.02 + Math.random() * 0.03;
                p.brightness = 0.4 + Math.random() * 0.3;
                p.size = 0.8 + Math.random() * 1.2;
                p.life = 600 + Math.random() * 600; p.maxLife = p.life;
                p.ownerX = b.x; p.ownerY = b.y;
                singularityParticles.push(p);
            }

            if (b.triggerCooldown <= 0 && !b.isCharging) {
                let count = 0;
                for (const a of aliens) {
                    if (Math.hypot(a.x - b.x, a.y - b.y) < def.range) count++;
                }
                if (count >= def.triggerThreshold) {
                    b.isCharging = true;
                    b.chargeLevel = 0;
                    b.chargeStartTime = gameTime;
                    b.animPulse = 2;
                    if (!singularityWarningActive) {
                        singularityWarningActive = true;
                        logStatus('SINGULARITY CHARGING!', 'special');
                    }
                }
            }

            if (b.isCharging) {
                b.chargeLevel = Math.min(1, b.chargeLevel + 0.012 * (elapsedTime / 16));
                b.animPulse = 1 + b.chargeLevel;
                if (gameTime - b.chargeStartTime >= b.chargeDuration) fireSingularity(b);
            } else {
                b.chargeLevel = Math.max(0, b.chargeLevel - 0.02 * (elapsedTime / 16));
                b.animPulse = 0.3 + 0.2 * Math.sin(gameTime * 0.00008 + b.animOffset);
            }
        }

        // Radar animation
        if (b.type === 'radar' && b.operational) {
            b.animPulse = 0.5 + 0.5 * Math.sin(gameTime * 0.00005 + b.animOffset);
        }

        // Drone Bay
        if (b.type === 'collector' && b.operational) {
            b.cooldown = b.cooldown - elapsedTime;
            if (b.cooldown <= 0 && b.droneCount < def.droneMax) {
                const d = getFromPool('drone');
                d.owner = b;
                d.x = b.x;
                d.y = b.y;
                drones.push(d);
                b.droneCount++;
                b.cooldown = def.cooldown;
            }
            b.animPulse = 0.2;
        }

        // Reactor animation
        if (b.type === 'energy') {
            b.animPulse = 0.6 + 0.4 * Math.sin(gameTime * 0.00006 + b.animOffset);
        }

        // Core animation
        if (b.type === 'core') {
            b.animPulse = 0.4 + 0.3 * Math.sin(gameTime * 0.00004);
        }

        b.animPulse = Math.max(0, (b.animPulse || 0) - 0.02 * (elapsedTime / 16));
    }

    // Shockwaves
    for (let i = shockwaves.length - 1; i >= 0; i--) {
        const sw = shockwaves[i];
        sw.radius += (sw.maxRadius - sw.radius) * 0.12 * (elapsedTime / 16);
        sw.life -= elapsedTime;
        sw.alpha = sw.life / (sw.type === 'singularity' ? 1500 : 1000);
        if (sw.life <= 0) {
            returnToPool('shockwave', sw);
            shockwaves.splice(i, 1);
        }
    }

    // Drones
    for (const drone of drones) {
        updateDrone(drone);
    }

    // Aliens
    for (const a of aliens) {
        if (a.target && blocks.includes(a.target)) {
            const angle = Math.atan2(a.target.y - a.y, a.target.x - a.x);
            const moveSpeed = a.speed * (elapsedTime / 16);
            a.x += Math.cos(angle) * moveSpeed;
            a.y += Math.sin(angle) * moveSpeed;

            a.attackCooldown = Math.max(0, a.attackCooldown - elapsedTime);
            if (Math.hypot(a.target.x - a.x, a.target.y - a.y) < B && a.attackCooldown <= 0) {
                a.target.hp -= a.damage;
                a.attackCooldown = 300;
            }
        } else {
            let minD = Infinity;
            for (const b of blocks) {
                const d = Math.hypot(b.x - a.x, b.y - a.y);
                if (d < minD) { minD = d; a.target = b; }
            }
        }
        a.phase += 0.04 * (elapsedTime / 16);

        // Drone collision
        for (let i = drones.length - 1; i >= 0; i--) {
            const d = drones[i];
            if (Math.hypot(a.x - d.x, a.y - d.y) < B) {
                if (d.owner) d.owner.droneCount--;
                returnToPool('drone', d);
                drones.splice(i, 1);
            }
        }
    }

    // Projectiles
    for (let i = projectiles.length - 1; i >= 0; i--) {
        const p = projectiles[i];
        p.x += p.vx * (elapsedTime / 16);
        p.y += p.vy * (elapsedTime / 16);
        p.life -= elapsedTime;
        if (p.life <= 0) {
            returnToPool('projectile', p);
            projectiles.splice(i, 1);
            continue;
        }
        for (const a of aliens) {
            if (Math.hypot(a.x - p.x, a.y - p.y) < 15 * a.size) {
                a.hp -= p.damage;
                p.life = 0;
                break;
            }
        }
    }

    // Alien death
    for (let i = aliens.length - 1; i >= 0; i--) {
        const a = aliens[i];
        if (a.hp <= 0) {
            totalKills++;
            const cargo = ALIEN_DROP.clone().scale(a.size * 0.5).fill();
            spawnAtomsFromCargo(cargo, a.x, a.y);
            aliens.splice(i, 1);
        }
    }

    // Block destruction
    for (let i = blocks.length - 1; i >= 0; i--) {
        const b = blocks[i];
        if (b.hp <= 0) {
            logStatus(`${BLOCKS[b.type].name} destroyed!`, 'danger');
            if (b.type === 'core') {
                gameOver = true;
                logStatus('GAME OVER!', 'danger');
                return;
            }
            if (b.type === 'collector') {
                for (let d = drones.length - 1; d >= 0; d--) {
                    if (drones[d].owner === b) {
                        drones[d].owner = null;
                    }
                }
            }
            const dropCargo = b.cargo ? b.cargo.mergedWith(b.buildCost) : b.buildCost;
            spawnAtomsFromCargo(dropCargo, b.x, b.y);
            blocks.splice(i, 1);
            rebuildShipNetwork();
        }
    }

    // Clean up laser targets
    for (const b of blocks) {
        if (b.laserTarget && !aliens.includes(b.laserTarget)) b.laserTarget = null;
    }

    updateUI();
    updatePanelAffordability();
}

// ============================================================================
// RENDERING
// ============================================================================

function addQuad(px, py, size, c0, c1, c2) {
    if (gameOver) {
        c0 = Math.min(1, Math.sqrt(c0 * c0 + c1 * c1 + c2 * c2));
        c1 = 0;
        c2 = 0;
    }
    const i = vertexCount * 2, ci = vertexCount * 3;
    posArray[i] = px; posArray[i + 1] = py;
    posArray[i + 2] = px + size; posArray[i + 3] = py;
    posArray[i + 4] = px + size; posArray[i + 5] = py + size;
    posArray[i + 6] = px; posArray[i + 7] = py;
    posArray[i + 8] = px + size; posArray[i + 9] = py + size;
    posArray[i + 10] = px; posArray[i + 11] = py + size;
    for (let j = 0; j < 6; j++) {
        colArray[ci + j * 3] = c0;
        colArray[ci + j * 3 + 1] = c1;
        colArray[ci + j * 3 + 2] = c2;
    }
    vertexCount += 6;
}

function rotateCoord(x, y, rotation) {
    for (let i = 0; i < rotation; i++) [x, y] = [y, -x];
    return [x, y];
}

function renderBlock(block) {
    const def = BLOCKS[block.type];
    if (!def) return;

    const isPlacing = block.canPlace !== undefined;
    const brightness = isPlacing 
        ? (block.canPlace ? (block.needsMoreEnergy ? 0.55 : 0.7) : 0.18)
        : (block.operational ? 1.0 : (def.energyCost > 0 ? 0.35 : 0.55));

    const needsEnergy = !isPlacing && !block.operational && def.energyCost > 0;

    const rotation = block.rotation || 0;
    const scaledB = B * (block.scale || 1);
    const pulse = block.animPulse || 0;
    const animOffset = block.animOffset || 0;
    const chargeLevel = block.chargeLevel || 0;

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const sq of def.squares) {
        const [rx, ry] = rotateCoord(sq.x, sq.y, rotation);
        minX = Math.min(minX, rx);
        maxX = Math.max(maxX, rx);
        minY = Math.min(minY, ry);
        maxY = Math.max(maxY, ry);
    }

    const baseX = block.x - (minX + maxX) * scaledB * 0.5;
    const baseY = block.y - (minY + maxY) * scaledB * 0.5;

    for (const sq of def.squares) {
        const [rx, ry] = rotateCoord(sq.x, sq.y, rotation);
        const breathe = block.operational ? Math.sin(gameTime * 0.00003 + (sq.x * 127 + sq.y * 311 + animOffset) * 0.01) * 0.15 : 0;

        let c = C(sq.c, brightness + pulse * 0.3);

        if (block.type === 'singularity' && block.operational) {
            const charge = chargeLevel * 0.8;
            if (sq.c === 8) c = C(sq.c, 0.9 + 0.1 * Math.sin(gameTime * 0.00015) + charge);
            else if (sq.c >= 32 && sq.c <= 37) c = C(sq.c, brightness + pulse * 0.5 + charge + Math.sin(gameTime * 0.0001 + sq.x * 0.5 + sq.y * 0.3) * 0.3);
        }

        if (needsEnergy) c = [c[0] * 0.5 + 0.35, c[1] * 0.25, c[2] * 0.25];

        addQuad(baseX + rx * scaledB + breathe, baseY + ry * scaledB + breathe, scaledB, c[0], c[1], c[2]);
    }
}

function render() {
    gl.clearColor(0.008, 0.008, 0.015, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    vertexCount = 0;

    // Atoms
    for (const a of atoms) {
        const c = C(a.color || 57, (0.5 + 0.5 * Math.sin(gameTime * 0.00008 + a.phase)) * 0.6);
        addQuad(a.x - B / 4, a.y - B / 4, B / 2, c[0], c[1], c[2]);
    }

    // Void rifts
    for (const rift of voidRifts) {
        const alpha = rift.life / rift.maxLife;
        for (let i = 0; i < 48; i++) {
            const angle = (i / 48) * Math.PI * 2 + rift.phase;
            const wobble = Math.sin(rift.phase * 2 + i * 0.5) * 20;
            const r = rift.radius * (0.9 + 0.1 * Math.sin(angle * 3 + rift.phase * 3)) + wobble;
            const x1 = rift.x + Math.cos(angle) * r;
            const y1 = rift.y + Math.sin(angle) * r;
            const c = C(38, alpha * (0.3 + 0.3 * Math.sin(rift.phase * 4 + i * 0.3)));
            addQuad(x1 - B, y1 - B, B * 2, c[0], c[1], c[2]);
        }
    }

    // Bridges
    for (const bridge of bridges) {
        const powered = bridge.to.operational;
        for (const sq of bridge.squares) {
            const pulse = 0.2 + 0.1 * Math.sin(gameTime * 0.00004 + sq.phase);
            const c = C(sq.c, powered ? 0.6 + pulse : 0.2);
            addQuad(sq.x - B / 2, sq.y - B / 2, B, c[0], c[1], c[2]);
        }
    }

    // Power link particles
    for (const p of powerLinkParticles) {
        const x = p.sourceX + (p.targetX - p.sourceX) * p.progress;
        const y = p.sourceY + (p.targetY - p.sourceY) * p.progress;
        const bright = 1.4 + 0.2 * Math.sin(gameTime * 0.0003 + p.progress * 10);
        const size = B * 0.6;
        const c = C(17, bright * 0.5);
        addQuad(x - size / 2, y - size / 2, size, c[0], c[1], c[2]);
    }

    // Blocks
    for (const b of blocks) renderBlock(b);

    // Placement preview bridge
    for (const b of blocks) {
        if (b.nearestBlock && b.canPlace) {
            const nb = b.nearestBlock;
            const dx = nb.x - b.x, dy = nb.y - b.y;
            const steps = Math.floor(Math.hypot(dx, dy) / 8);
            for (let i = 1; i < steps; i++) {
                const t = i / steps;
                const c = C(60, 0.3 + Math.sin(gameTime * 0.00008 + i * 0.25) * 0.15);
                addQuad(b.x + dx * t - B / 2, b.y + dy * t - B / 2, B, c[0], c[1], c[2]);
            }
        }
    }

    // Singularity range indicator
    for (const b of blocks) {
        if (b.type === 'singularity' && b.operational) {
            const def = BLOCKS.singularity;
            for (let i = 0; i < 48; i++) {
                const angle = (i / 48) * Math.PI * 2 + gameTime * 0.00002;
                for (let layer = 0; layer < 3; layer++) {
                    const r = def.range * (0.3 + layer * 0.25) + Math.sin(gameTime * 0.00005 + i * 0.4 + layer) * 30;
                    const x1 = b.x + Math.cos(angle + layer * 0.3) * r;
                    const y1 = b.y + Math.sin(angle + layer * 0.3) * r;
                    const c = C(35 - layer, 0.1 + 0.08 * Math.sin(gameTime * 0.00008 + i * 0.2 + layer));
                    addQuad(x1 - B / 2, y1 - B / 2, B, c[0], c[1], c[2]);
                }
            }
        }
    }

    // Singularity particles
    for (const p of singularityParticles) {
        const alpha = p.brightness * (p.life / p.maxLife);
        const c = C(alpha > 0.7 ? 8 : alpha > 0.5 ? 32 : 33, alpha);
        addQuad(p.x - B * p.size / 2, p.y - B * p.size / 2, B * p.size, c[0], c[1], c[2]);
    }

    // Laser beams
    for (const b of blocks) {
        if (b.type === 'laser' && b.laserTarget && aliens.includes(b.laserTarget)) {
            const dx = b.laserTarget.x - b.x, dy = b.laserTarget.y - b.y;
            const steps = Math.floor(Math.hypot(dx, dy) / B);
            for (let i = 0; i < steps; i++) {
                const t = i / steps;
                const c = C(40, 0.8 - t * 0.4 + Math.sin(gameTime * 0.0003 + i * 0.35) * 0.1);
                addQuad(b.x + dx * t - B / 2, b.y + dy * t - B / 2, B, c[0], c[1], c[2]);
            }
        }
    }

    // Projectiles
    for (const p of projectiles) {
        const c = C(p.color, 1.0 + Math.sin(gameTime * 0.00035 + p.x) * 0.1);
        addQuad(p.x - B / 2, p.y - B / 2, B, c[0], c[1], c[2]);
    }

    // Shockwaves
    for (const sw of shockwaves) {
        if (sw.type === 'singularity') {
            for (let ring = 0; ring < 3; ring++) {
                const r = sw.radius * (0.6 + ring * 0.2);
                for (let i = 0; i < 64; i++) {
                    const angle = (i / 64) * Math.PI * 2;
                    const wobble = Math.sin(gameTime * 0.00015 + i * 0.4 + ring) * 15;
                    const x1 = sw.x + Math.cos(angle) * (r + wobble);
                    const y1 = sw.y + Math.sin(angle) * (r + wobble);
                    const c = C(ring < 1 ? 8 : 32 + ring, sw.alpha * (1 - ring * 0.25) * (0.6 + 0.4 * Math.sin(gameTime * 0.0002 + i * 0.5)));
                    addQuad(x1 - B, y1 - B, B * 2, c[0], c[1], c[2]);
                }
            }
        } else {
            for (let i = 0; i < 48; i++) {
                const angle = (i / 48) * Math.PI * 2;
                const x1 = sw.x + Math.cos(angle) * sw.radius;
                const y1 = sw.y + Math.sin(angle) * sw.radius;
                const c = C(32, sw.alpha * (0.8 + 0.2 * Math.sin(gameTime * 0.0002 + i * 0.5)));
                addQuad(x1 - B, y1 - B, B * 2, c[0], c[1], c[2]);
            }
        }
    }

    // Drones
    for (const d of drones) {
        const c = C(35, 1.4);
        const size = B / 2;
        addQuad(d.x - size / 2, d.y - size / 2, size, c[0], c[1], c[2]);
    }

    // Aliens
    for (const a of aliens) {
        const count = Math.floor(4 + a.size * 6);
        const spread = 1.0 + a.size * 0.7;
        for (let i = 0; i < count; i++) {
            const angle = (i / count) * Math.PI * 2;
            const r = spread * B * (0.4 + 0.6 * Math.sin(a.seed + i * 2.0));
            const px = a.x + Math.cos(angle + Math.sin(gameTime * 0.00002 + i) * 0.3) * r + Math.sin(a.phase + i * 0.5) * 2 - B / 2;
            const py = a.y + Math.sin(angle + Math.sin(gameTime * 0.00002 + i) * 0.3) * r + Math.sin(a.phase + i * 0.5) * 2 - B / 2;
            const c = C(48 + (i % 8), 0.7 + 0.3 * Math.sin(a.phase + i * 0.4));
            addQuad(px, py, B, c[0], c[1], c[2]);
        }
    }

    if (vertexCount > 0) {
        gl.useProgram(prog);
        gl.uniform2f(uRes, W, H);
        gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
        gl.bufferData(gl.ARRAY_BUFFER, posArray.subarray(0, vertexCount * 2), gl.DYNAMIC_DRAW);
        gl.bindBuffer(gl.ARRAY_BUFFER, colBuf);
        gl.bufferData(gl.ARRAY_BUFFER, colArray.subarray(0, vertexCount * 3), gl.DYNAMIC_DRAW);
        gl.bindVertexArray(vao);
        gl.drawArrays(gl.TRIANGLES, 0, vertexCount);
    }
}

// ============================================================================
// RESIZE & INIT
// ============================================================================

function handleResize() {
    W = window.innerWidth; H = window.innerHeight;
    canvas.width = W; canvas.height = H;
    gl.viewport(0, 0, W, H);
}

window.addEventListener('resize', handleResize);
window.addEventListener('orientationchange', () => setTimeout(handleResize, 100));
document.addEventListener('visibilitychange', () => isPaused = document.hidden);

initMainPanel();

blocks.push({
    type: 'core',
    x: W / 2,
    y: H / 2,
    hp: CORE_BLOCK.hp,
    operational: true,
    rotation: 0,
    animOffset: Math.random() * 100,
    animPulse: 0,
    cooldown: 0,
    defenseCooldown: 0,
    droneCount: 0,
    cargo: null,
    buildCost: Cargo(),
});
rebuildShipNetwork();

logStatus('Build modules to survive!', 'info');

let initTime = 0;

function gameLoop(now) {
    if (!initTime) initTime = now;
    const tmp = gameTime;
    gameTime = now - initTime;
    elapsedTime = gameTime - tmp;
    if (elapsedTime > 0) {
        if (!gameOver && !isPaused) update();
        render();
    }
    requestAnimationFrame(gameLoop);
}
requestAnimationFrame(gameLoop);
