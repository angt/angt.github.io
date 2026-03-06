'use strict';

const B = 5;
const MAX_VERTICES = 2000000;
const GRID_SIZE = 10;
const VIEW_HEIGHT = 800;
const WORLD_RADIUS = 2 * VIEW_HEIGHT;

const PALETTE = [
    // 0-7: Deep space backgrounds
    [0.02, 0.02, 0.05], [0.04, 0.03, 0.08], [0.06, 0.04, 0.12], [0.08, 0.06, 0.15],
    [0.05, 0.05, 0.10], [0.07, 0.07, 0.14], [0.09, 0.09, 0.18], [0.03, 0.03, 0.06],
    // 8-15: White/blue highlights
    [0.95, 0.97, 1.00], [0.85, 0.90, 0.98], [0.70, 0.80, 0.95], [0.55, 0.70, 0.92],
    [0.40, 0.60, 0.88], [0.30, 0.50, 0.82], [0.25, 0.42, 0.75], [0.20, 0.35, 0.68],
    // 16-23: Yellow/gold
    [1.00, 1.00, 0.90], [1.00, 0.95, 0.60], [1.00, 0.88, 0.40], [1.00, 0.75, 0.25],
    [0.95, 0.62, 0.18], [0.88, 0.50, 0.12], [0.78, 0.40, 0.08], [0.65, 0.32, 0.05],
    // 24-31: Red
    [1.00, 0.85, 0.82], [1.00, 0.65, 0.60], [1.00, 0.45, 0.40], [0.95, 0.32, 0.28],
    [0.88, 0.22, 0.18], [0.78, 0.15, 0.12], [0.65, 0.10, 0.08], [0.50, 0.06, 0.04],
    // 32-39: Purple
    [0.90, 0.82, 0.98], [0.78, 0.68, 0.92], [0.65, 0.52, 0.85], [0.52, 0.40, 0.75],
    [0.42, 0.30, 0.65], [0.32, 0.22, 0.52], [0.22, 0.15, 0.40], [0.14, 0.10, 0.28],
    // 40-47: Cyan
    [0.70, 0.98, 0.95], [0.50, 0.92, 0.88], [0.35, 0.82, 0.78], [0.25, 0.70, 0.65],
    [0.18, 0.58, 0.55], [0.14, 0.48, 0.45], [0.10, 0.38, 0.35], [0.07, 0.28, 0.26],
    // 48-55: Green
    [0.55, 0.92, 0.48], [0.42, 0.82, 0.35], [0.32, 0.70, 0.25], [0.25, 0.58, 0.20],
    [0.20, 0.48, 0.16], [0.16, 0.38, 0.12], [0.12, 0.30, 0.10], [0.08, 0.22, 0.07],
    // 56-63: Gray/metal
    [0.92, 0.94, 0.96], [0.78, 0.80, 0.84], [0.64, 0.68, 0.72], [0.52, 0.56, 0.60],
    [0.42, 0.46, 0.50], [0.34, 0.38, 0.42], [0.26, 0.30, 0.34], [0.18, 0.22, 0.26]
];

const ATOM_TYPES = ['H', 'O', 'C', 'Fe', 'Si', 'Al', 'N', 'Li', 'Ar', 'Ti', 'Nd', 'Au'];

const ATOM_COLORS = {
    H: 8, O: 26, C: 57, Fe: 28, Si: 42, Al: 58, N: 44, Li: 35, Ar: 41, Ti: 56, Nd: 49, Au: 18
};

const ALIEN_DROP = Cargo({ H: 100, O: 90, C: 85, Fe: 80, Si: 75, Al: 40, N: 35, Li: 25, Ar: 20, Ti: 10, Nd: 8, Au: 5 }).fill();

const ENERGY_BLOCK = {
    name: 'Reactor',
    desc: 'Powers nearby modules. Essential for weapons and collectors.',
    squares: [
        {x:0,y:0,c:16},
        {x:-1,y:0,c:17},{x:1,y:0,c:17},{x:0,y:-1,c:17},{x:0,y:1,c:17},
        {x:-1,y:-1,c:57},{x:1,y:-1,c:57},{x:-1,y:1,c:57},{x:1,y:1,c:57},
        {x:-2,y:-1,c:59},{x:2,y:-1,c:59},{x:-2,y:0,c:59},{x:2,y:0,c:59},{x:-2,y:1,c:59},{x:2,y:1,c:59},
        {x:-1,y:-2,c:59},{x:0,y:-2,c:59},{x:1,y:-2,c:59},
        {x:-1,y:2,c:59},{x:0,y:2,c:59},{x:1,y:2,c:59},
        {x:-3,y:-1,c:61},{x:3,y:-1,c:61},{x:-3,y:0,c:61},{x:3,y:0,c:61},{x:-3,y:1,c:61},{x:3,y:1,c:61},
        {x:0,y:-3,c:19},{x:0,y:3,c:19},{x:-3,y:0,c:19},{x:3,y:0,c:19}
    ],
    hp: 150, energyCost: 0, energyProduce: 75,
    cost: Cargo({ H: 25, O: 10, C: 20, Fe: 35, Si: 25, Al: 10, N: 8, Li: 5, Ar: 3 })
};

const STORAGE_BLOCK = {
    name: 'Cargo Bay',
    desc: 'Stores collected materials (varied capacity per atom). Build more to expand storage!',
    squares: [
        {x:-2,y:-2,c:61},{x:-1,y:-2,c:59},{x:0,y:-2,c:59},{x:1,y:-2,c:59},{x:2,y:-2,c:61},
        {x:-2,y:-1,c:59},{x:-1,y:-1,c:58},{x:0,y:-1,c:58},{x:1,y:-1,c:58},{x:2,y:-1,c:59},
        {x:-2,y:0,c:59},{x:-1,y:0,c:58},{x:0,y:0,c:57},{x:1,y:0,c:58},{x:2,y:0,c:59},
        {x:-2,y:1,c:59},{x:-1,y:1,c:58},{x:0,y:1,c:58},{x:1,y:1,c:58},{x:2,y:1,c:59},
        {x:-2,y:2,c:61},{x:-1,y:2,c:59},{x:0,y:2,c:59},{x:1,y:2,c:59},{x:2,y:2,c:61},
        {x:-3,y:-1,c:60},{x:-3,y:0,c:60},{x:-3,y:1,c:60},{x:3,y:-1,c:60},{x:3,y:0,c:60},{x:3,y:1,c:60}
    ],
    hp: 180, energyCost: 5, energyProduce: 0,
    capacity: ALIEN_DROP.clone().scale(25).fill(),
    cost: Cargo({ H: 15, O: 10, C: 25, Fe: 30, Si: 15, Al: 20, N: 5, Li: 3, Ar: 2 })
};

const CANON_BLOCK = {
    name: 'Plasma Cannon',
    desc: 'Heavy projectile weapon. High damage, slow fire rate.',
    squares: [
        {x:-1,y:1,c:61},{x:0,y:1,c:60},{x:1,y:1,c:61},
        {x:-1,y:0,c:59},{x:0,y:0,c:58},{x:1,y:0,c:59},
        {x:2,y:0,c:60},{x:3,y:0,c:61},
        {x:4,y:0,c:26},{x:5,y:0,c:27},{x:6,y:0,c:28},
        {x:-1,y:-1,c:59},{x:0,y:-1,c:58},{x:1,y:-1,c:59},
        {x:0,y:-2,c:28},{x:2,y:-1,c:28},{x:2,y:1,c:28},
        {x:7,y:-1,c:25},{x:7,y:0,c:24},{x:7,y:1,c:25},
        {x:-2,y:0,c:60},{x:-2,y:-1,c:61},{x:-2,y:1,c:61}
    ],
    hp: 120, energyCost: 15, energyProduce: 0,
    range: 200, damage: 45, cooldown: 750,
    cost: Cargo({ H: 10, O: 20, C: 30, Fe: 45, Si: 15, Al: 10, N: 8, Ti: 5, Nd: 3 })
};

const LASER_BLOCK = {
    name: 'Laser Array',
    desc: 'Continuous beam weapon. Fast fire rate, lower damage.',
    squares: [
        {x:-1,y:1,c:61},{x:0,y:1,c:60},{x:1,y:1,c:61},
        {x:-1,y:0,c:59},{x:0,y:0,c:58},{x:1,y:0,c:59},
        {x:-1,y:-1,c:59},{x:0,y:-1,c:58},{x:1,y:-1,c:59},
        {x:2,y:-1,c:60},{x:2,y:0,c:59},{x:2,y:1,c:60},{x:3,y:0,c:61},
        {x:4,y:-1,c:60},{x:4,y:0,c:42},{x:4,y:1,c:60},{x:5,y:0,c:59},
        {x:6,y:-1,c:60},{x:6,y:0,c:43},{x:6,y:1,c:60},{x:7,y:0,c:59},
        {x:8,y:-1,c:44},{x:8,y:0,c:40},{x:8,y:1,c:44},
        {x:0,y:-2,c:43},{x:3,y:-2,c:43},{x:5,y:-2,c:43},{x:7,y:-2,c:43},
        {x:-2,y:0,c:60},{x:-2,y:-1,c:61},{x:-2,y:1,c:61}
    ],
    hp: 90, energyCost: 10, energyProduce: 0,
    range: 400, damage: 4, cooldown: 33,
    cost: Cargo({ H: 8, O: 25, C: 12, Fe: 20, Si: 40, Al: 8, N: 5, Ar: 3 })
};

const RADAR_BLOCK = {
    name: 'Sensor Array',
    desc: 'Extends detection and targeting range for nearby weapons. No power required.',
    squares: [
        {x:0,y:0,c:58},
        {x:-1,y:0,c:59},{x:1,y:0,c:59},{x:0,y:-1,c:59},{x:0,y:1,c:59},
        {x:-1,y:-1,c:60},{x:1,y:-1,c:60},{x:-1,y:1,c:60},{x:1,y:1,c:60},
        {x:-2,y:-2,c:61},{x:-1,y:-2,c:59},{x:0,y:-2,c:59},{x:1,y:-2,c:59},{x:2,y:-2,c:61},
        {x:-2,y:2,c:61},{x:-1,y:2,c:59},{x:0,y:2,c:59},{x:1,y:2,c:59},{x:2,y:2,c:61},
        {x:-3,y:-1,c:61},{x:-3,y:0,c:60},{x:-3,y:1,c:61},
        {x:3,y:-1,c:61},{x:3,y:0,c:60},{x:3,y:1,c:61},
        {x:0,y:-3,c:11},{x:0,y:3,c:11},{x:-3,y:0,c:11},{x:3,y:0,c:11},
        {x:-2,y:0,c:12},{x:2,y:0,c:12},{x:0,y:-2,c:12},{x:0,y:2,c:12},
        {x:-4,y:0,c:61},{x:4,y:0,c:61},{x:0,y:-4,c:61},{x:0,y:4,c:61}
    ],
    hp: 100, energyCost: 0, energyProduce: 0, rangeBoost: 1.3,
    cost: Cargo({ H: 8, O: 15, C: 10, Fe: 15, Si: 45, Al: 12, N: 15, Ar: 5 })
};

const COLLECTOR_BLOCK = {
    name: 'Drone Bay',
    desc: 'Launches drones to collect resources. Drones need storage space!',
    squares: [
        {x:-2,y:-1,c:61},{x:-1,y:-1,c:60},{x:0,y:-1,c:60},{x:1,y:-1,c:60},{x:2,y:-1,c:61},
        {x:-1,y:0,c:59},{x:0,y:0,c:58},{x:1,y:0,c:59},
        {x:-1,y:1,c:60},{x:0,y:1,c:59},{x:1,y:1,c:60},{x:0,y:2,c:61},
        {x:-2,y:0,c:35},{x:2,y:0,c:35},
        {x:-1,y:-2,c:36},{x:0,y:-2,c:37},{x:1,y:-2,c:36},{x:0,y:3,c:34},
        {x:-3,y:0,c:60},{x:3,y:0,c:60},{x:-2,y:1,c:61},{x:2,y:1,c:61}
    ],
    hp: 80, energyCost: 8, energyProduce: 0,
    range: 300, droneMax: 6, cooldown: 1000,
    cost: Cargo({ H: 18, O: 12, C: 22, Fe: 25, Si: 20, Al: 15, N: 20, Li: 3 })
};

const HULL_BLOCK = {
    name: 'Hull Section',
    desc: 'Structural connector. Cheap way to extend your ship. Passes power through.',
    squares: [
        {x:-2,y:-1,c:61},{x:-1,y:-1,c:60},{x:0,y:-1,c:60},{x:1,y:-1,c:60},{x:2,y:-1,c:61},
        {x:-2,y:0,c:59},{x:-1,y:0,c:58},{x:0,y:0,c:57},{x:1,y:0,c:58},{x:2,y:0,c:59},
        {x:-2,y:1,c:61},{x:-1,y:1,c:60},{x:0,y:1,c:60},{x:1,y:1,c:60},{x:2,y:1,c:61},
        {x:-3,y:0,c:61},{x:3,y:0,c:61}
    ],
    hp: 200, energyCost: 0, energyProduce: 0,
    cost: Cargo({ H: 10, O: 5, C: 15, Fe: 20, Si: 5, Al: 5, N: 3 })
};

const SINGULARITY_BLOCK = {
    name: 'Singularity Pulse',
    desc: 'Ultimate weapon. Creates a black hole that annihilates ALL matter in range.',
    squares: [
        {x:0,y:0,c:8},
        {x:-1,y:0,c:32},{x:1,y:0,c:32},{x:0,y:-1,c:32},{x:0,y:1,c:32},
        {x:-1,y:-1,c:33},{x:1,y:-1,c:33},{x:-1,y:1,c:33},{x:1,y:1,c:33},
        {x:-2,y:0,c:33},{x:2,y:0,c:33},{x:0,y:-2,c:33},{x:0,y:2,c:33},
        {x:-2,y:-1,c:34},{x:2,y:-1,c:34},{x:-2,y:1,c:34},{x:2,y:1,c:34},
        {x:-1,y:-2,c:34},{x:1,y:-2,c:34},{x:-1,y:2,c:34},{x:1,y:2,c:34},
        {x:-3,y:0,c:34},{x:3,y:0,c:34},{x:0,y:-3,c:34},{x:0,y:3,c:34},
        {x:-3,y:-1,c:35},{x:3,y:-1,c:35},{x:-3,y:1,c:35},{x:3,y:1,c:35},
        {x:-1,y:-3,c:35},{x:1,y:-3,c:35},{x:-1,y:3,c:35},{x:1,y:3,c:35},
        {x:-2,y:-2,c:60},{x:2,y:-2,c:60},{x:-2,y:2,c:60},{x:2,y:2,c:60},
        {x:-4,y:0,c:32},{x:4,y:0,c:32},{x:0,y:-4,c:32},{x:0,y:4,c:32},
        {x:-4,y:-1,c:61},{x:4,y:-1,c:61},{x:-4,y:1,c:61},{x:4,y:1,c:61},
        {x:-1,y:-4,c:61},{x:1,y:-4,c:61},{x:-1,y:4,c:61},{x:1,y:4,c:61},
        {x:-3,y:-2,c:36},{x:3,y:-2,c:36},{x:-3,y:2,c:36},{x:3,y:2,c:36},
        {x:-2,y:-3,c:36},{x:2,y:-3,c:36},{x:-2,y:3,c:36},{x:2,y:3,c:36},
        {x:-5,y:0,c:37},{x:5,y:0,c:37},{x:0,y:-5,c:37},{x:0,y:5,c:37},
        {x:-5,y:-1,c:61},{x:5,y:-1,c:61},{x:-5,y:1,c:61},{x:5,y:1,c:61},
        {x:-1,y:-5,c:61},{x:1,y:-5,c:61},{x:-1,y:5,c:61},{x:1,y:5,c:61}
    ],
    hp: 1000, energyCost: 500, energyProduce: 0,
    range: 400, triggerThreshold: 8, cooldown: 15000,
    cost: Cargo({ H: 400, O: 500, C: 800, Fe: 700, Si: 800, Al: 300, N: 250, Li: 200, Ar: 150, Ti: 350, Nd: 400, Au: 250 })
};

const CORE_BLOCK = {
    name: 'Command Core',
    desc: 'Central hub. Powers nearby modules. Auto-defends small threats. LIMITED storage.',
    squares: [
        {x:0,y:0,c:8},
        {x:-1,y:0,c:9},{x:1,y:0,c:9},{x:0,y:-1,c:9},{x:0,y:1,c:9},
        {x:-1,y:-1,c:57},{x:1,y:-1,c:57},{x:-1,y:1,c:57},{x:1,y:1,c:57},
        {x:-2,y:0,c:58},{x:2,y:0,c:58},{x:0,y:-2,c:58},{x:0,y:2,c:58},
        {x:-2,y:-1,c:59},{x:2,y:-1,c:59},{x:-2,y:1,c:59},{x:2,y:1,c:59},
        {x:-1,y:-2,c:59},{x:1,y:-2,c:59},{x:-1,y:2,c:59},{x:1,y:2,c:59},
        {x:-3,y:0,c:60},{x:3,y:0,c:60},{x:0,y:-3,c:60},{x:0,y:3,c:60},
        {x:-2,y:-2,c:61},{x:2,y:-2,c:61},{x:-2,y:2,c:61},{x:2,y:2,c:61},
        {x:-3,y:-1,c:12},{x:3,y:-1,c:12},{x:-3,y:1,c:12},{x:3,y:1,c:12},
        {x:-1,y:-3,c:12},{x:1,y:-3,c:12},{x:-1,y:3,c:12},{x:1,y:3,c:12}
    ],
    hp: 2000, energyCost: 0, energyProduce: 50,
    range: 220, damage: 15, cooldown: 300,
    cost: {},
    capacity: Cargo()
        .addCapacity(ENERGY_BLOCK.cost._capacity)
        .addCapacity(CANON_BLOCK.cost._capacity)
        .addCapacity(COLLECTOR_BLOCK.cost._capacity)
        .fill()
};

const BLOCKS = {
    core: CORE_BLOCK,
    energy: ENERGY_BLOCK,
    storage: STORAGE_BLOCK,
    canon: CANON_BLOCK,
    laser: LASER_BLOCK,
    radar: RADAR_BLOCK,
    collector: COLLECTOR_BLOCK,
    hull: HULL_BLOCK,
    singularity: SINGULARITY_BLOCK,
};

const DRONE = {
    speed: 3,
    capacity: Cargo({ H: 5, O: 4, C: 4, Fe: 3, Si: 3, Al: 3, N: 4, Li: 3, Ar: 3, Ti: 2, Nd: 2, Au: 1}),
    range: 12,
};
