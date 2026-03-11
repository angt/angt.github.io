'use strict';

// ============================================================================
// INITIALIZATION
// ============================================================================

const canvas = document.getElementById('glCanvas');
const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, preserveDrawingBuffer: false });
if (!gl) throw new Error('WebGL2 not supported');

const vsSource = `#version 300 es
in vec2 aCenter;
in float aSize;
in vec3 aColor;
uniform vec2 uViewSize;
uniform vec2 uCamera;
out vec3 vColor;

void main() {
    int vid = gl_VertexID;
    vec2 corner = vec2(float(vid & 1), float((vid >> 1) & 1)) - 0.5;
    vec2 worldPos = aCenter + corner * aSize;
    vec2 clipPos = (worldPos - uCamera) / uViewSize * 2.0;
    clipPos.y = -clipPos.y;
    gl_Position = vec4(clipPos, 0.0, 1.0);
    vColor = aColor;
}`;

const fsSource = `#version 300 es
precision highp float;
in vec3 vColor;
out vec4 FragColor;

void main() {
    FragColor = vec4(vColor, 1.0);
}`;

function createProgram(vs, fs) {
    const p = gl.createProgram();
    const vsShader = gl.createShader(gl.VERTEX_SHADER);
    gl.shaderSource(vsShader, vs);
    gl.compileShader(vsShader);
    if (!gl.getShaderParameter(vsShader, gl.COMPILE_STATUS)) {
        console.error('VS Error:', gl.getShaderInfoLog(vsShader));
    }
    const fsShader = gl.createShader(gl.FRAGMENT_SHADER);
    gl.shaderSource(fsShader, fs);
    gl.compileShader(fsShader);
    if (!gl.getShaderParameter(fsShader, gl.COMPILE_STATUS)) {
        console.error('FS Error:', gl.getShaderInfoLog(fsShader));
    }
    gl.attachShader(p, vsShader);
    gl.attachShader(p, fsShader);
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
        console.error('Link Error:', gl.getProgramInfoLog(p));
    }
    return p;
}

const prog = createProgram(vsSource, fsSource);
const uViewSize = gl.getUniformLocation(prog, 'uViewSize');
const uCamera = gl.getUniformLocation(prog, 'uCamera');
const aCenter = gl.getAttribLocation(prog, 'aCenter');
const aSize = gl.getAttribLocation(prog, 'aSize');
const aColor = gl.getAttribLocation(prog, 'aColor');

// ============================================================================
// COLOR HELPERS
// ============================================================================

function bright(color, factor = 1.0) {
    return [color[0] * factor, color[1] * factor, color[2] * factor];
}

function shade(color, amount) {
    if (amount >= 0) {
        const f = 1 + amount * 0.5;
        return [Math.min(1, color[0] * f), Math.min(1, color[1] * f), Math.min(1, color[2] * f)];
    }
    const f = 1 + amount * 0.5;
    return [color[0] * f, color[1] * f, color[2] * f];
}

function toCSS(color) {
    return `rgb(${Math.floor(color[0]*255)}, ${Math.floor(color[1]*255)}, ${Math.floor(color[2]*255)})`;
}

// ============================================================================
// INSTANCE BUFFER SETUP - Each quad is one instance
// ============================================================================

const instanceVao = gl.createVertexArray();
gl.bindVertexArray(instanceVao);

const STRIDE = 6 * 4;
const instanceBuffer = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, instanceBuffer);

gl.enableVertexAttribArray(aCenter);
gl.vertexAttribPointer(aCenter, 2, gl.FLOAT, false, STRIDE, 0);
gl.vertexAttribDivisor(aCenter, 1);

gl.enableVertexAttribArray(aSize);
gl.vertexAttribPointer(aSize, 1, gl.FLOAT, false, STRIDE, 8);
gl.vertexAttribDivisor(aSize, 1);

gl.enableVertexAttribArray(aColor);
gl.vertexAttribPointer(aColor, 3, gl.FLOAT, false, STRIDE, 12);
gl.vertexAttribDivisor(aColor, 1);

gl.bindVertexArray(null);

const MAX_QUADS = Math.floor(MAX_VERTICES / 6);
const instanceData = new Float32Array(MAX_QUADS * 6);
let quadCount = 0;

// ============================================================================
// CAMERA SETUP
// ============================================================================

const camera = Camera();
camera.setViewHeight(VIEW_HEIGHT);
camera.setMaxRadius(WORLD_RADIUS);

function handleResize() {
    const W = document.documentElement.clientWidth;
    const H = document.documentElement.clientHeight;
    canvas.width = W;
    canvas.height = H;
    gl.viewport(0, 0, W, H);
    camera.setSize(W, H);
}

handleResize();
createInputHandler(camera, canvas);

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
// GAME STATE
// ============================================================================

const bridges = new Set();
const drones = new Set();
const atoms = new Set();
const blocks = new Set();
const aliens = new Set();
const projectiles = [];
const storages = [];
const shockwaves = [];
const singularityParticles = [];
const voidRifts = [];
let gameTime = 0, gameOver = false, totalKills = 0, isPaused = false;

// ============================================================================
// STORAGE SYSTEM
// ============================================================================

function totalStorage() {
    const total = Cargo();
    for (const b of storages) {
        total.mergeFrom(b.cargo);
    }
    return total;
}

function buyBlock(cost) {
    for (const s of storages) s.cargo.storeTo(cost);
}

// ============================================================================
// SHIP
// ============================================================================

function updateShip() {
    for (const b of bridges) {
        if (!blocks.has(b.from) || !blocks.has(b.to)) {
            bridges.delete(b);
        }
    }
    const children = new Map();

    for (const b of blocks) {
        b.operational = false;
        children.set(b, []);
    }
    for (const b of bridges) {
        children.get(b.from).push(b.to);
    }
    const linked = new Set([coreBlock]);
    const queue = [coreBlock];
    while (queue.length > 0) {
        const current = queue.shift();
        for (const child of children.get(current)) {
            if (!linked.has(child)) {
                linked.add(child);
                queue.push(child);
            }
        }
    }

    // Auto-reconnect
    for (const b of blocks) {
        if (linked.has(b)) continue;
        const nearest = findValidLinkTarget(b);
        if (nearest) {
            bridges.add({
                from: nearest,
                to: b,
                reverse: b.energyProduce > nearest.energyProduce
            });
            linked.add(b);
        }
    }

    let totalPower = 0;

    for (const b of linked) {
        const power = b.energyProduce - b.energyCost;
        if (power >= 0) {
            totalPower += power;
            b.operational = true;
        }
    }
    for (const b of linked) {
        if (b.operational) continue;
        totalPower += b.energyProduce - b.energyCost;
        if (totalPower >= 0) b.operational = true;
    }
    storages.length = 0;

    for (const b of blocks) {
        if (b.cargo && b.operational) {
            storages.push(b);
        }
    }
    for (const b of blocks) {
        if (b.range > 0) {
            let range = b.range;
            for (const bridge of bridges) {
                if (bridge.from === b && bridge.to.rangeBoost) {
                    range *= bridge.to.rangeBoost;
                }
            }
            b.rangeBoosted = range;
        }
    }
}

// ============================================================================
// UI RENDERING
// ============================================================================

function formatAtomCount(n) {
    if (n >= 1e9) return (n / 1e9).toFixed(1) + 'G';
    if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
    return n.toString();
}

function renderAtomTable(costObj = null) {
    const total = totalStorage();

    let html = '';
    for (const row of atomLayout) {
        for (const atom of row) {
            if (atom === null) {
                html += '<div class="atom-cell empty"><span class="atom-symbol">-</span></div>';
            } else if (costObj) {
                const needed = costObj[atom] || 0;
                const have = total.get(atom);
                const hasResource = have >= needed;
                const color = toCSS(ATOM_COLORS[atom]);
                html += `<div class="atom-cell ${needed > 0 ? (hasResource ? '' : 'missing') : 'empty'}">`;
                html += `<span class="atom-symbol" style="color: ${color};">${atom}</span>`;
                html += `<span class="atom-count">${formatAtomCount(needed)}</span></div>`;
            } else {
                const have = total.get(atom);
                const max = total.capacity(atom);
                const isFull = have >= max && max > 0;
                const color = toCSS(ATOM_COLORS[atom]);
                html += `<div class="atom-cell${isFull ? ' full' : ''}">`;
                html += `<span class="atom-symbol" style="color: ${color};">${atom}</span>`;
                html += `<span class="atom-count">${formatAtomCount(have)}/${formatAtomCount(max)}</span></div>`;
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
        item.classList.toggle('unaffordable', !totalStorage().canFill(def.cost));
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
        ctx.fillStyle = toCSS(sq.color);
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

    updatePanelAffordability();
}

// ============================================================================
// BLOCK CREATION
// ============================================================================

function createBlock(type, x, y) {
    return {
        ...BLOCKS[type].create(),
        type,
        x, y,
        operational: false,
        rotation: 0,
        animOffset: Math.random() * 100,
        animPulse: 0,
        lastTime: 0,
    };
}

function spawnAtomsFromCargo(cargo, x, y, spread = 30) {
    for (const type of cargo.types()) {
        const angle = Math.random() * Math.PI * 2;
        const dist = Math.random() * spread;
        atoms.add({
            x: x + Math.cos(angle) * dist,
            y: y + Math.sin(angle) * dist,
            type,
            amount: cargo.get(type),
            color: ATOM_COLORS[type],
            phase: Math.random() * Math.PI * 2
        });
    }
}

function destroyDrone(drone) {
    if (!drone) return;
    if (drone.cargo) {
        spawnAtomsFromCargo(drone.cargo, drone.x, drone.y);
    }
    drones.delete(drone);
}

function dist2(x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    return dx * dx + dy * dy;
}

// ============================================================================
// DRAG & DROP
// ============================================================================

let draggingBlock = null;

function getEventCoords(e) {
    const touch = e.touches?.[0];
    return touch ? { x: touch.clientX, y: touch.clientY } : { x: e.clientX, y: e.clientY };
}

function canConnect(from, to) {
    return (from.energyProduce > 0 && to.energyCost > 0)
        || (from.energyCost > 0 && to.energyProduce > to.energyCost)
        || (from.range && to.rangeBoost > 0)
}

function findValidLinkTarget(block) {
    let nearest = null;
    let nearestDist = Infinity;
    const maxDist = 350 * 350;
    for (const b of blocks) {
        const d = dist2(b.x, b.y, block.x, block.y);
        if (d > maxDist) continue;
        if (canConnect(b, block) && d < nearestDist) {
            nearestDist = d;
            nearest = b;
        }
    }
    return nearest;
}

function dragStart(e) {
    const item = e.target.closest('.module-item');
    if (!item || gameOver) return;

    e.preventDefault();

    const { x, y } = getEventCoords(e);
    const worldPos = camera.screenToWorld(x, y);

    draggingBlock = createBlock(item.dataset.type, worldPos.x, worldPos.y);
    draggingBlock.initialRotation = Math.floor(Math.random() * 4);
    draggingBlock.rotation = draggingBlock.initialRotation;
    draggingBlock.dragStartTime = gameTime;

    showModuleInfo(draggingBlock.type);
}

document.addEventListener('mousedown', dragStart, { capture: true });
document.addEventListener('touchstart', dragStart, { passive: false, capture: true });

function moveEvent(e) {
    if (!draggingBlock || gameOver) return;

    e.preventDefault();

    const { x, y } = getEventCoords(e);
    const worldPos = camera.screenToWorld(x, y);
    draggingBlock.x = worldPos.x;
    draggingBlock.y = worldPos.y;
}

document.addEventListener('mousemove', moveEvent, { capture: true });
document.addEventListener('touchmove', moveEvent, { passive: false, capture: true });

function moveEnd(shouldCancel = false) {
    if (!draggingBlock || gameOver) return;

    const block = draggingBlock;
    draggingBlock = null;
    hideModuleInfo();

    if (shouldCancel || !block.nearestBlock) return;
    if (!totalStorage().canFill(block.cost)) {
        logStatus(`Not enough resources for ${block.name}`, 'warning');
        return;
    }
    buyBlock(block.cost);
    bridges.add({
        from: block.nearestBlock,
        to: block,
        reverse: block.energyProduce > block.nearestBlock.energyProduce
    });
    delete block.dragStartTime;
    delete block.initialRotation;
    delete block.nearestBlock;

    blocks.add(block);
    updateShip();

    logStatus(`${block.name} built`, 'success');
}

document.addEventListener('mouseup', () => moveEnd(), { capture: true });
document.addEventListener('touchend', () => moveEnd(), { capture: true });
document.addEventListener('touchcancel', () => moveEnd(true), { capture: true });

document.addEventListener('contextmenu', e => e.preventDefault(), { capture: true });

// ============================================================================
// ALIEN SPAWNING
// ============================================================================

let spawnAngle = Math.random() * Math.PI * 2;
let spawnDist = WORLD_RADIUS + 200;
let spawnUpdateTime = 0;

function updateSpawning() {
    if (gameTime < spawnUpdateTime + 1000) return;
    spawnUpdateTime = gameTime;
    if (Math.random() < 0.3) {
        const r = Math.random() * Math.random() * gameTime / 800;
        for (let i = 0; i < 10 + Math.floor(r); i++) {
            spawnAlien();
        }
    }
}

function spawnAlien() {
    spawnAngle += (Math.random() - 0.5) * 0.08;
    spawnDist += (Math.random() - 0.5) * 10;
    spawnDist = Math.max(WORLD_RADIUS + 100, Math.min(WORLD_RADIUS + 400, spawnDist));
    const size = 1 + Math.random() * Math.random() * 4;
    aliens.add({
        x: Math.cos(spawnAngle) * spawnDist,
        y: Math.sin(spawnAngle) * spawnDist,
        size,
        hp: size * 20,
        damage: size * 5,
        speed: 0.01 + Math.random() * 0.05,
        phase: Math.random() * Math.PI * 2,
        seed: Math.random(),
        attackCooldown: 0,
        target: null
    });
}

let singularityWarningActive = false;
let storageFullWarned = false;

// ============================================================================
// SINGULARITY PULSE
// ============================================================================

function fireSingularity(block) {
    const range = block.range ** 2;

    singularityWarningActive = false;
    logStatus('SINGULARITY PULSE ACTIVATED!', 'special');
    block.isCharging = false;

    shockwaves.push({
        x: block.x, y: block.y,
        radius: 0, maxRadius: block.range,
        life: 1500, alpha: 1, type: 'singularity'
    });

    voidRifts.push({
        x: block.x, y: block.y,
        radius: block.range * 0.8, maxRadius: block.range,
        life: 3000, maxLife: 3000, phase: 0
    });

    let killedCount = 0;
    for (const a of aliens) {
        const d = dist2(a.x, a.y, block.x, block.y);
        if (d < range) {
            for (let j = 0; j < Math.floor(a.size * 12); j++) {
                singularityParticles.push({
                    x: a.x, y: a.y,
                    angle: Math.random() * Math.PI * 2,
                    radius: Math.sqrt(d),
                    speed: 0.005 + Math.random() * 0.00375,
                    brightness: 0.8 + Math.random() * 0.2,
                    size: 1.5 + Math.random() * 2,
                    life: 500 + Math.random() * 500, maxLife: 500 + Math.random() * 500,
                    ownerX: block.x, ownerY: block.y
                });
            }
            aliens.delete(a);
            killedCount++;
        }
    }

    totalKills += killedCount;

    let atomsDestroyed = 0;
    for (const a of atoms) {
        if (dist2(a.x, a.y, block.x, block.y) < range) {
            atoms.delete(a);
            atomsDestroyed++;
        }
    }

    logStatus(`Singularity destroyed ${killedCount} enemies, ${atomsDestroyed} atoms lost`, 'warning');
    block.triggerCooldown = gameTime + block.cooldown;
    block.chargeLevel = 0;
}

function moveToward(obj, targetX, targetY) {
    const angle = Math.atan2(targetY - obj.y, targetX - obj.x);
    const moveSpeed = obj.speed * elapsedTime;
    obj.x += Math.cos(angle) * moveSpeed;
    obj.y += Math.sin(angle) * moveSpeed;
}

function orbitAround(obj, targetX, targetY) {
    const dy = obj.y - targetY;
    const dx = obj.x - targetX;
    const angle = Math.atan2(dy, dx) + Math.PI / 2;
    const moveSpeed = obj.speed * elapsedTime;
    obj.x += Math.cos(angle) * moveSpeed - dx * 0.0001 * elapsedTime;
    obj.y += Math.sin(angle) * moveSpeed - dy * 0.0001 * elapsedTime;
}

// ============================================================================
// DRONE SYSTEM
// ============================================================================

function updateDrone(drone) {
    let bestTarget = null;
    let bestDist = Infinity;
    let action = null;

    if (!drone.cargo.isEmpty()) {
        for (const b of storages) {
            if (!drone.cargo.canStore(b.cargo)) continue;
            const dist = dist2(b.x, b.y, drone.x, drone.y);
            if (dist < bestDist) {
                bestDist = dist;
                bestTarget = b;
                action = 'drop';
            }
        }
    }

    if (drone.owner && drone.owner.operational) {
        for (const type of drone.cargo.typesWithSpace()) {
            for (const a of drone.owner.nearbyAtoms?.[type] || []) {
                const dist = dist2(a.x, a.y, drone.x, drone.y);
                if (dist < bestDist) {
                    bestDist = dist;
                    bestTarget = a;
                    action = 'add';
                }
            }
        }
    }

    if (!bestTarget) {
        for (const b of blocks) {
            const dist = dist2(b.x, b.y, drone.x, drone.y);
            if (dist < bestDist) {
                bestDist = dist;
                bestTarget = b;
            }
        }
        orbitAround(drone, bestTarget.x, bestTarget.y);
        return;
    }

    if (action && bestDist < DRONE.range * DRONE.range) {
        switch (action) {
            case 'drop':
                if (drone.cargo.storeTo(bestTarget.cargo) > 0) {
                    bestTarget.animPulse = 1;
                }
                break;
            case 'add':
                bestTarget.amount -= drone.cargo.add(bestTarget.type, bestTarget.amount);
                if (bestTarget.amount <= 0) {
                    atoms.delete(bestTarget);
                }
                break;
        }
    }
    moveToward(drone, bestTarget.x, bestTarget.y);
}

// ============================================================================
// GAME UPDATE
// ============================================================================

function getWeaponRange(block) {
    return block.rangeBoosted || block.range || 0;
}

let atomUpdateTime = 0;

function updateAtoms() {
    if (gameTime < atomUpdateTime + 300) return;
    atomUpdateTime = gameTime;
    for (const a of atoms) {
        if (Math.random() < 0.00346) {
            atoms.delete(a);
        }
    }
    for (const b of blocks) {
        if (b.droneMax > 0 && b.operational) {
            b.nearbyAtoms = b.nearbyAtoms || {};
            const range = b.rangeBoosted ** 2;
            for (const type of ATOM_TYPES) b.nearbyAtoms[type] = [];
            for (const a of atoms) {
                if (dist2(a.x, a.y, b.x, b.y) <= range) {
                    b.nearbyAtoms[a.type].push(a);
                }
            }
        }
    }
}

function update() {
    updateAtoms();

    if (draggingBlock && gameTime > draggingBlock.dragStartTime + 1000) {
        const dt = Math.floor((gameTime - draggingBlock.dragStartTime) / 1000);
        draggingBlock.rotation = (draggingBlock.initialRotation + dt) % 4;
    }

    updateSpawning();

    // Singularity particles
    for (let i = singularityParticles.length - 1; i >= 0; i--) {
        const p = singularityParticles[i];
        p.angle += p.speed * elapsedTime;
        p.radius -= 0.09375 * elapsedTime;
        p.x = p.ownerX + Math.cos(p.angle) * Math.max(0, p.radius);
        p.y = p.ownerY + Math.sin(p.angle) * Math.max(0, p.radius);
        p.life -= elapsedTime;
        p.brightness *= Math.pow(0.98, elapsedTime / 16);
        if (p.life <= 0 || p.radius <= 0) {
            singularityParticles.splice(i, 1);
        }
    }

    // Void rifts
    for (let i = voidRifts.length - 1; i >= 0; i--) {
        voidRifts[i].life -= elapsedTime;
        if (voidRifts[i].life <= 0) {
            voidRifts.splice(i, 1);
        } else {
            voidRifts[i].phase += 0.05 * elapsedTime / 16;
        }
    }

    // Storage warning
    const storageHasSpace = totalStorage().hasAnySpace();
    if (!storageHasSpace && !storageFullWarned) {
        logStatus('STORAGE FULL! Build Cargo Bays!', 'danger');
        storageFullWarned = true;
    } else if (storageHasSpace) {
        storageFullWarned = false;
    }

    // Block updates
    for (const b of blocks) {
        if (!b.operational) continue;

        if (b.projectile) {
            if (gameTime >= b.lastTime) {
                const range = getWeaponRange(b) ** 2;
                for (const a of aliens) {
                    if (a.hp > 0 && dist2(a.x, a.y, b.x, b.y) < range) {
                        const angle = Math.atan2(a.y - b.y, a.x - b.x);
                        projectiles.push({
                            x: b.x, y: b.y,
                            vx: Math.cos(angle) * b.projectile.speed,
                            vy: Math.sin(angle) * b.projectile.speed,
                            damage: b.projectile.damage,
                            color: b.projectile.color,
                            life: 10000,
                        });
                        b.lastTime = gameTime + b.cooldown;
                        b.animPulse = 1;
                        break;
                    }
                }
            }
        }

        if (b.laser) {
            if (gameTime >= b.lastTime) {
                const range = getWeaponRange(b) ** 2;
                for (const a of aliens) {
                    if (a.hp > 0 && dist2(a.x, a.y, b.x, b.y) < range) {
                        a.hp -= b.laser.damage;
                        b.laserTarget = a;
                        b.animPulse = 1;
                        b.lastTime = gameTime + b.cooldown;
                        break;
                    }
                }
            }
        }

        if (b.singularity) {
            b.triggerCooldown = b.triggerCooldown ?? 0;
            b.isCharging = b.isCharging ?? false;
            b.chargeLevel = b.chargeLevel ?? 0;

            if (Math.random() < 0.01875 * elapsedTime && !b.isCharging) {
                const angle = Math.random() * Math.PI * 2;
                const r = 25 + Math.random() * 15;
                singularityParticles.push({
                    x: b.x + Math.cos(angle) * r,
                    y: b.y + Math.sin(angle) * r,
                    angle, radius: r,
                    speed: 0.00125 + Math.random() * 0.001875,
                    brightness: 0.4 + Math.random() * 0.3,
                    size: 0.8 + Math.random() * 1.2,
                    life: 600 + Math.random() * 600, maxLife: 600 + Math.random() * 600,
                    ownerX: b.x, ownerY: b.y
                });
            }

            if (gameTime >= b.triggerCooldown && !b.isCharging) {
                const range = b.range ** 2;
                let count = 0;
                for (const a of aliens) {
                    if (dist2(a.x, a.y, b.x, b.y) < range) {
                        if (++count >= b.singularity.triggerThreshold) break;
                    }
                }
                if (count >= b.singularity.triggerThreshold) {
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
                b.chargeLevel = Math.min(1, b.chargeLevel + 0.00075 * elapsedTime);
                b.animPulse = 1 + b.chargeLevel;
                if (gameTime - b.chargeStartTime >= 3000) fireSingularity(b);
            } else {
                b.chargeLevel = Math.max(0, b.chargeLevel - 0.00125 * elapsedTime);
                b.animPulse = 0.3 + 0.2 * Math.sin(gameTime * 0.00008 + b.animOffset);
            }
        }

        // Radar animation
        if (b.type === 'radar') {
            b.animPulse = 0.5 + 0.5 * Math.sin(gameTime * 0.00005 + b.animOffset);
        }

        // Drone Bay
        if (b.type === 'collector') {
            if (gameTime >= b.lastTime) {
                let ownedCount = 0;
                let unowned = null;
                for (const d of drones) {
                    if (d.owner === b) ownedCount++;
                    else if (!unowned && !d.owner) unowned = d;
                }
                if (ownedCount < b.droneMax) {
                    if (unowned) {
                        unowned.owner = b;
                    } else {
                        drones.add({
                            owner: b,
                            x: b.x, y: b.y,
                            cargo: Cargo(DRONE.cargo._capacity),
                            speed: DRONE.speed
                        });
                    }
                }
                b.lastTime = gameTime + b.cooldown;
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

        b.animPulse = Math.max(0, (b.animPulse || 0) - 0.00125 * elapsedTime);
    }

    // Shockwaves
    for (let i = shockwaves.length - 1; i >= 0; i--) {
        const sw = shockwaves[i];
        sw.radius += (sw.maxRadius - sw.radius) * 0.0075 * elapsedTime;
        sw.life -= elapsedTime;
        sw.alpha = sw.life / (sw.type === 'singularity' ? 1500 : 1000);
        if (sw.life <= 0) {
            shockwaves.splice(i, 1);
        }
    }

    // Drones
    for (const drone of drones) {
        updateDrone(drone);
    }

    // Aliens
    for (const a of aliens) {
        const dt = elapsedTime;
        const range = 16 * B2;

        for (const b of blocks) {
            if (b.hp > 0 && dist2(a.x, a.y, b.x, b.y) < range) {
                b.hp -= a.damage * dt / 1000;
                break;
            }
        }
        for (const d of drones) {
            if (dist2(a.x, a.y, d.x, d.y) < range) {
                destroyDrone(d);
                break;
            }
        }
        moveToward(a, 0,0);
    }

    // Projectiles
    for (let i = projectiles.length - 1; i >= 0; i--) {
        const range = 16 * B2;
        const p = projectiles[i];
        p.x += p.vx * elapsedTime;
        p.y += p.vy * elapsedTime;
        p.life -= elapsedTime;
        for (const a of aliens) {
            if (p.damage <= 0) break;
            if (a.hp > 0 && dist2(a.x, a.y, p.x, p.y) < range) {
                const damageDealt = Math.min(p.damage, a.hp);
                a.hp -= damageDealt;
                p.damage -= damageDealt;
                break;
            }
        }
        if (p.life <= 0 || p.damage <= 0) {
            projectiles.splice(i, 1);
            continue;
        }
    }

    // Alien death
    for (const a of aliens) {
        if (a.hp <= 0) {
            totalKills++;
            const cargo = ALIEN_DROP.clone().scale(a.size * 0.1).fill();
            spawnAtomsFromCargo(cargo, a.x, a.y);
            aliens.delete(a);
        }
    }

    if (coreBlock.hp <= 0) {
        gameOver = true;
        logStatus('GAME OVER!', 'danger');
        return;
    }

    // Block destruction
    for (const b of blocks) {
        if (b.laserTarget && !aliens.has(b.laserTarget))
            b.laserTarget = null;
        if (b.hp <= 0) {
            logStatus(`${b.name} destroyed!`, 'danger');
            if (b.type === 'collector') {
                drones.forEach(d => { if (d.owner === b) d.owner = null; });
            }
            // cost filled by buyBlock
            const cargo = b.cargo?.mergeFrom(b.cost) || b.cost;
            spawnAtomsFromCargo(cargo, b.x, b.y);
            blocks.delete(b);
        }
    }

    updateShip();
    updateUI();
    updatePanelAffordability();
}

// ============================================================================
// RENDERING
// ============================================================================

function addQuad(px, py, size, c) {
    let c0 = c[0], c1 = c[1], c2 = c[2];
    if (gameOver) {
        c0 = Math.min(1, Math.sqrt(c0 * c0 + c1 * c1 + c2 * c2));
        c1 = 0;
        c2 = 0;
    }
    const i = quadCount * 6;
    instanceData[i + 0] = px;
    instanceData[i + 1] = py;
    instanceData[i + 2] = size;
    instanceData[i + 3] = c0;
    instanceData[i + 4] = c1;
    instanceData[i + 5] = c2;
    quadCount++;
}

function rotateCoord(x, y, rotation) {
    for (let i = 0; i < rotation; i++) [x, y] = [y, -x];
    return [x, y];
}

function renderBlock(block) {
    const def = BLOCKS[block.type];
    if (!def) return;

    const brightness = 1;
    const rotation = block.rotation || 0;
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

    const baseX = block.x - (minX + maxX) * B * 0.5;
    const baseY = block.y - (minY + maxY) * B * 0.5;

    for (const sq of def.squares) {
        const [rx, ry] = rotateCoord(sq.x, sq.y, rotation);
        const breathe = block.operational ? Math.sin(gameTime * 0.00003 + (sq.x * 127 + sq.y * 311 + animOffset) * 0.01) * 0.15 : 0;
        let c = bright(sq.color, 1.0 + pulse * 0.3);
        if (block.type == 'singularity' && block.operational) {
            const charge = chargeLevel * 0.8;
            if (sq.color === Colors.white) c = bright(sq.color, 0.9 + 0.1 * Math.sin(gameTime * 0.00015) + charge);
            else if (sq.color === Colors.lavender || sq.color === Colors.orchid || sq.color === Colors.purple || sq.color === Colors.mauve) {
                c = bright(sq.color, brightness + pulse * 0.5 + charge + Math.sin(gameTime * 0.0001 + sq.x * 0.5 + sq.y * 0.3) * 0.3);
            }
        }
        if (!block.operational && !block.dragStartTime) c = [c[0] * 0.5 + 0.25, c[1] * 0.25, c[2] * 0.25];
        addQuad(baseX + rx * B + breathe, baseY + ry * B + breathe, B, c);
    }
}

function render() {
    gl.clearColor(0.008, 0.008, 0.015, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    quadCount = 0;

    // Atoms
    for (const a of atoms) {
        const c = bright(a.color, a.amount / 100);
        addQuad(a.x, a.y, B / 2, c);
    }

    // Void rifts
    for (const rift of voidRifts) {
        const alpha = rift.life / rift.maxLife;
        for (let i = 0; i < 64; i++) {
            const angle = (i / 64) * Math.PI * 2 + rift.phase;
            const wobble = Math.sin(rift.phase * 2 + i * 0.5) * 30;
            const r = rift.radius * (0.85 + 0.15 * Math.sin(angle * 3 + rift.phase * 3)) + wobble;
            const x1 = rift.x + Math.cos(angle) * r;
            const y1 = rift.y + Math.sin(angle) * r;
            const c = bright(Colors.teal, alpha * (0.5 + 0.5 * Math.sin(rift.phase * 4 + i * 0.3)));
            addQuad(x1, y1, B * 3, c);
        }
    }

    // Bridges
    for (const b of bridges) {
        const wl = 200;
        const flow = (gameTime * 0.5) % wl;
        const size = B * 0.7;
        const c = bright(Colors.lightGray, 0.3);
        const dx = b.to.x - b.from.x;
        const dy = b.to.y - b.from.y;
        const len = Math.hypot(dx, dy);
        for (let d = 0; d < len; d += 8) {
            const x = b.from.x + dx * d / len;
            const y = b.from.y + dy * d / len;
            if (b.to.operational && b.from.operational) {
                const a = (b.reverse ? d + flow : d - flow) / wl;
                const f = Math.max(0, Math.cos(a * Math.PI * 2));
                addQuad(x, y, size + (1 + f) * 0.5 - 0.5, [
                    c[0] + f * (1.2 - c[0]),
                    c[1] + f * (1.0 - c[1]),
                    c[2] * (1 - f * 0.9)
                ]);
            } else {
                addQuad(x, y, size, c);
            }
        }
    }

    // Preview bridges
    if (draggingBlock) {
        draggingBlock.nearestBlock = findValidLinkTarget(draggingBlock);
        if (draggingBlock.nearestBlock) {
            const b = draggingBlock;
            const nb = draggingBlock.nearestBlock;
            const size = B * 0.7;
            const c = bright(Colors.lightGray, 0.3);
            const dx = nb.x - b.x;
            const dy = nb.y - b.y;
            const len = Math.hypot(dx, dy);
            for (let d = 0; d < len; d += 8) {
                const x = b.x + dx * d / len;
                const y = b.y + dy * d / len;
                addQuad(x, y, size, c);
            }
        }
    }

    // Blocks
    for (const b of blocks)
        renderBlock(b);

    if (draggingBlock)
        renderBlock(draggingBlock);

    // Singularity range indicator
    for (const b of blocks) {
        if (b.singularity && b.operational) {
            for (let i = 0; i < 48; i++) {
                const angle = (i / 48) * Math.PI * 2 + gameTime * 0.00002;
                for (let layer = 0; layer < 3; layer++) {
                    const r = b.range * (0.3 + layer * 0.25) + Math.sin(gameTime * 0.00005 + i * 0.4 + layer) * 30;
                    const x1 = b.x + Math.cos(angle + layer * 0.3) * r;
                    const y1 = b.y + Math.sin(angle + layer * 0.3) * r;
                    const c = bright(shade(Colors.mauve, -layer), 0.1 + 0.08 * Math.sin(gameTime * 0.00008 + i * 0.2 + layer));
                    addQuad(x1, y1, B, c);
                }
            }
        }
    }

    // Singularity particles
    for (const p of singularityParticles) {
        const alpha = p.brightness * (p.life / p.maxLife);
        const c = bright(alpha > 0.7 ? Colors.white : alpha > 0.5 ? Colors.lavender : Colors.orchid, alpha);
        addQuad(p.x, p.y, B * p.size, c);
    }

    // Laser beams
    for (const b of blocks) {
        if (b.laserTarget && b.operational) {
            const dx = b.laserTarget.x - b.x;
            const dy = b.laserTarget.y - b.y;
            const len = Math.hypot(dx, dy);
            const offset = (gameTime * 0.4) % B;
            for (let d = offset; d < len; d += B) {
                const x = b.x + dx * d / len;
                const y = b.y + dy * d / len;
                const fade = 1 - d / len * 0.6;
                addQuad(x, y, B * 0.8, bright(b.laser.color, fade));
            }
        }
    }

    // Projectiles
    for (const p of projectiles) {
        for (let ring = 3; ring >= 1; ring--) {
            addQuad(p.x, p.y, B * (1 + ring * 1.5), bright(p.color, 0.15 / ring));
        }
        addQuad(p.x, p.y, B * 1.5, bright(p.color, 1.2));
        addQuad(p.x, p.y, B * 0.8, [1, 1, 1]);
        const trailLen = 5;
        for (let i = 1; i <= trailLen; i++) {
            const tx = p.x - p.vx * i * 12;
            const ty = p.y - p.vy * i * 12;
            const fade = 1 - i / trailLen;
            const size = B * (1.2 - i * 0.15);
            addQuad(tx, ty, size, bright(p.color, 0.5 * fade));
        }
        for (let i = 0; i < 2; i++) {
            const angle = gameTime * 0.05 + i * Math.PI + p.x * 0.1;
            const r = B * 0.8;
            const sx = p.x + Math.cos(angle) * r;
            const sy = p.y + Math.sin(angle) * r;
            addQuad(sx, sy, B * 0.3, bright(p.color, 0.8));
        }
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
                    const c = bright(Colors.mauve, sw.alpha * (1 - ring * 0.25) * (0.6 + 0.4 * Math.sin(gameTime * 0.0002 + i * 0.5)));
                    addQuad(x1, y1, B * 2, c);
                }
            }
        } else {
            for (let i = 0; i < 48; i++) {
                const angle = (i / 48) * Math.PI * 2;
                const x1 = sw.x + Math.cos(angle) * sw.radius;
                const y1 = sw.y + Math.sin(angle) * sw.radius;
                const c = bright(Colors.lavender, sw.alpha * (0.8 + 0.2 * Math.sin(gameTime * 0.0002 + i * 0.5)));
                addQuad(x1, y1, B * 2, c);
            }
        }
    }

    // Drones
    for (const d of drones) {
        addQuad(d.x, d.y, B / 2, bright(Colors.mauve, 1.4));
    }

    // Aliens
    for (const a of aliens) {
        const count = Math.floor(4 + a.size * 6);
        const spread = 1.0 + a.size * 0.7;
        const rotSpeed = 0.001 + (a.seed % 100) / 100 * 0.003;
        const rotDir = Math.sin(a.seed * 7.3) > 0 ? 1 : -1;
        const rotation = gameTime * rotSpeed * rotDir + a.seed;
        const pulseSpeed = 0.003 + Math.sin(a.seed * 3.7) * 0.002;
        const pulse = 1 + 0.15 * Math.sin(gameTime * pulseSpeed + a.phase);
        for (let i = 0; i < count; i++) {
            const baseAngle = (i / count) * Math.PI * 2;
            const angleOffset = Math.sin(a.seed * (i + 1) * 3.1) * 0.5;
            const angle = baseAngle + rotation + angleOffset;
            const radiusMult = 0.3 + Math.abs(Math.sin(a.seed * i * 2.7 + i)) * 0.7;
            const r = spread * B * radiusMult * pulse;
            const wobble = Math.sin(gameTime * 0.01 + a.seed + i * 2.3) * 0.08;
            const px = a.x + Math.cos(angle + wobble) * r;
            const py = a.y + Math.sin(angle + wobble) * r;
            const flicker = Math.sin(gameTime * 0.008 + i * 1.5 + a.seed * 2) * 0.15;
            const c = bright(AlienColors[i % 8], 0.7 + 0.3 * Math.sin(gameTime * 0.005 + i * 0.4 + a.phase) + flicker);
            const sizeVar = 0.6 + Math.sin(a.seed + i * 4.1) * 0.4;
            addQuad(px, py, B * pulse * sizeVar, c);
        }
    }

    if (quadCount > 0) {
        gl.useProgram(prog);
        gl.uniform2f(uViewSize, camera.viewWidth, camera.viewHeight);
        gl.uniform2f(uCamera, camera.x, camera.y);
        gl.bindBuffer(gl.ARRAY_BUFFER, instanceBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, instanceData.subarray(0, quadCount * 6), gl.DYNAMIC_DRAW);
        gl.bindVertexArray(instanceVao);
        gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, quadCount);
    }
}

// ============================================================================
// INIT
// ============================================================================

window.addEventListener('resize', handleResize);
window.addEventListener('orientationchange', () => setTimeout(handleResize, 100));
document.addEventListener('visibilitychange', () => isPaused = document.hidden);

initMainPanel();

const coreBlock = createBlock('core', 0, 0);
blocks.add(coreBlock);
updateShip();

logStatus('Build modules to survive!', 'info');
logStatus('Right-click or 2-finger drag to pan view', 'info');

let initTime = 0;
let lastTime = 0;
let currentTime = 0;
let elapsedTime = 0;

function gameLoop(now) {
    if (!initTime) initTime = now;
    lastTime = currentTime;
    currentTime = now;
    elapsedTime = Math.max(0, currentTime - lastTime);
    camera.update(elapsedTime);
    if (!gameOver && !isPaused) {
        gameTime = currentTime - initTime;
        if (elapsedTime > 0) update();
    }
    render();
    requestAnimationFrame(gameLoop);
}
requestAnimationFrame(gameLoop);
