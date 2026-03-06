'use strict';

const B = 5;
const MAX_VERTICES = 2000000;
const GRID_SIZE = 10;
const VIEW_HEIGHT = 800;
const WORLD_RADIUS = 2 * VIEW_HEIGHT;

// Named colors - base shades that can be adjusted with bright/shade helpers
const Colors = {
    // White/Blue family
    white:    [0.95, 0.97, 1.00],
    silver:   [0.85, 0.90, 0.98],
    sky:      [0.70, 0.80, 0.95],
    blue:     [0.55, 0.70, 0.92],
    navy:     [0.20, 0.35, 0.68],

    // Yellow/Gold family
    cream:    [1.00, 1.00, 0.90],
    paleGold: [1.00, 0.95, 0.60],
    gold:     [1.00, 0.88, 0.40],
    yellow:   [1.00, 0.75, 0.25],
    amber:    [0.95, 0.62, 0.18],
    orange:   [0.88, 0.50, 0.12],
    brown:    [0.65, 0.32, 0.05],

    // Red family
    salmon:   [1.00, 0.85, 0.82],
    coral:    [1.00, 0.65, 0.60],
    rose:     [1.00, 0.45, 0.40],
    red:      [0.95, 0.32, 0.28],
    crimson:  [0.88, 0.22, 0.18],
    maroon:   [0.65, 0.10, 0.08],

    // Purple family
    lavender: [0.90, 0.82, 0.98],
    orchid:   [0.78, 0.68, 0.92],
    mauve:    [0.65, 0.52, 0.85],
    purple:   [0.52, 0.40, 0.75],
    indigo:   [0.32, 0.22, 0.52],
    darkViolet: [0.14, 0.10, 0.28],

    // Cyan family
    paleCyan: [0.70, 0.98, 0.95],
    aqua:     [0.50, 0.92, 0.88],
    cyan:     [0.35, 0.82, 0.78],
    teal:     [0.18, 0.58, 0.55],
    deepTeal: [0.07, 0.28, 0.26],

    // Green family
    lime:     [0.55, 0.92, 0.48],
    green:    [0.42, 0.82, 0.35],
    forest:   [0.32, 0.70, 0.25],
    darkGreen: [0.16, 0.38, 0.12],

    // Gray/Metal family
    brightGray: [0.92, 0.94, 0.96],
    lightGray:  [0.78, 0.80, 0.84],
    gray:       [0.64, 0.68, 0.72],
    steel:      [0.52, 0.56, 0.60],
    dimGray:    [0.34, 0.38, 0.42],
    darkGray:   [0.18, 0.22, 0.26],
};

const AlienColors = [
    [0.75, 0.92, 0.25],  // bright chartreuse
    [0.42, 0.82, 0.35],  // lime
    [0.32, 0.70, 0.25],  // green
    [0.25, 0.58, 0.20],  // forest
    [0.20, 0.48, 0.16],  // dark green
    [0.50, 0.85, 0.38],  // yellowish green
    [0.48, 0.75, 0.30],  // olive green
    [0.38, 0.65, 0.22],  // muted green
];

const ATOM_TYPES = ['H', 'O', 'C', 'Fe', 'Si', 'Al', 'N', 'Li', 'Ar', 'Ti', 'Nd', 'Au'];

const ATOM_COLORS = {
    H: Colors.white, O: Colors.coral, C: Colors.gray, Fe: Colors.crimson,
    Si: Colors.cyan, Al: Colors.steel, N: Colors.deepTeal, Li: Colors.mauve,
    Ar: Colors.paleCyan, Ti: Colors.brightGray, Nd: Colors.green, Au: Colors.gold
};

const ALIEN_DROP = Cargo({ H: 100, O: 90, C: 85, Fe: 80, Si: 75, Al: 40, N: 35, Li: 25, Ar: 20, Ti: 10, Nd: 8, Au: 5 }).fill();

function defineBlock(config) {
    return {
        ...config,
        cost: config.cost.fill(),
        create() {
            const { create, ...t } = this;
            return { ...t, cargo: t.cargo?.clone(true) ?? null };
        }
    };
}

const ENERGY_BLOCK = defineBlock({
    name: 'Reactor',
    desc: 'Powers nearby modules. Essential for weapons and collectors.',
    squares: [
        {x:0,y:0,color:Colors.gold},
        {x:-1,y:0,color:Colors.paleGold},{x:1,y:0,color:Colors.paleGold},{x:0,y:-1,color:Colors.paleGold},{x:0,y:1,color:Colors.paleGold},
        {x:-1,y:-1,color:Colors.gray},{x:1,y:-1,color:Colors.gray},{x:-1,y:1,color:Colors.gray},{x:1,y:1,color:Colors.gray},
        {x:-2,y:-1,color:Colors.steel},{x:2,y:-1,color:Colors.steel},{x:-2,y:0,color:Colors.steel},{x:2,y:0,color:Colors.steel},{x:-2,y:1,color:Colors.steel},{x:2,y:1,color:Colors.steel},
        {x:-1,y:-2,color:Colors.steel},{x:0,y:-2,color:Colors.steel},{x:1,y:-2,color:Colors.steel},
        {x:-1,y:2,color:Colors.steel},{x:0,y:2,color:Colors.steel},{x:1,y:2,color:Colors.steel},
        {x:-3,y:-1,color:Colors.dimGray},{x:3,y:-1,color:Colors.dimGray},{x:-3,y:0,color:Colors.dimGray},{x:3,y:0,color:Colors.dimGray},{x:-3,y:1,color:Colors.dimGray},{x:3,y:1,color:Colors.dimGray},
        {x:0,y:-3,color:Colors.yellow},{x:0,y:3,color:Colors.yellow},{x:-3,y:0,color:Colors.yellow},{x:3,y:0,color:Colors.yellow}
    ],
    hp: 150, energyCost: 0, energyProduce: 75,
    damage: 0, range: 0, cooldown: 0,
    cost: Cargo({ H: 25, O: 10, C: 20, Fe: 35, Si: 25, Al: 10, N: 8, Li: 5, Ar: 3 })
});

const STORAGE_BLOCK = defineBlock({
    name: 'Cargo Bay',
    desc: 'Stores collected materials (varied capacity per atom). Build more to expand storage!',
    squares: [
        {x:-2,y:-2,color:Colors.dimGray},{x:-1,y:-2,color:Colors.steel},{x:0,y:-2,color:Colors.steel},{x:1,y:-2,color:Colors.steel},{x:2,y:-2,color:Colors.dimGray},
        {x:-2,y:-1,color:Colors.steel},{x:-1,y:-1,color:Colors.steel},{x:0,y:-1,color:Colors.steel},{x:1,y:-1,color:Colors.steel},{x:2,y:-1,color:Colors.steel},
        {x:-2,y:0,color:Colors.steel},{x:-1,y:0,color:Colors.steel},{x:0,y:0,color:Colors.gray},{x:1,y:0,color:Colors.steel},{x:2,y:0,color:Colors.steel},
        {x:-2,y:1,color:Colors.steel},{x:-1,y:1,color:Colors.steel},{x:0,y:1,color:Colors.steel},{x:1,y:1,color:Colors.steel},{x:2,y:1,color:Colors.steel},
        {x:-2,y:2,color:Colors.dimGray},{x:-1,y:2,color:Colors.steel},{x:0,y:2,color:Colors.steel},{x:1,y:2,color:Colors.steel},{x:2,y:2,color:Colors.dimGray},
        {x:-3,y:-1,color:Colors.lightGray},{x:-3,y:0,color:Colors.lightGray},{x:-3,y:1,color:Colors.lightGray},{x:3,y:-1,color:Colors.lightGray},{x:3,y:0,color:Colors.lightGray},{x:3,y:1,color:Colors.lightGray}
    ],
    hp: 180, energyCost: 5, energyProduce: 0,
    damage: 0, range: 0, cooldown: 0,
    cargo: ALIEN_DROP.clone().scale(10),
    cost: Cargo({ H: 15, O: 10, C: 25, Fe: 30, Si: 15, Al: 20, N: 5, Li: 3, Ar: 2 })
});

const CANON_BLOCK = defineBlock({
    name: 'Plasma Cannon',
    desc: 'Heavy projectile weapon. High damage, slow fire rate.',
    squares: [
        {x:-1,y:1,color:Colors.dimGray},{x:0,y:1,color:Colors.lightGray},{x:1,y:1,color:Colors.dimGray},
        {x:-1,y:0,color:Colors.steel},{x:0,y:0,color:Colors.steel},{x:1,y:0,color:Colors.steel},
        {x:2,y:0,color:Colors.lightGray},{x:3,y:0,color:Colors.dimGray},
        {x:4,y:0,color:Colors.coral},{x:5,y:0,color:Colors.salmon},{x:6,y:0,color:Colors.rose},
        {x:-1,y:-1,color:Colors.steel},{x:0,y:-1,color:Colors.steel},{x:1,y:-1,color:Colors.steel},
        {x:0,y:-2,color:Colors.rose},{x:2,y:-1,color:Colors.rose},{x:2,y:1,color:Colors.rose},
        {x:7,y:-1,color:Colors.salmon},{x:7,y:0,color:Colors.cream},{x:7,y:1,color:Colors.salmon},
        {x:-2,y:0,color:Colors.lightGray},{x:-2,y:-1,color:Colors.dimGray},{x:-2,y:1,color:Colors.dimGray}
    ],
    hp: 120, energyCost: 15, energyProduce: 0,
    range: 200, damage: 45, cooldown: 750,
    cost: Cargo({ H: 10, O: 20, C: 30, Fe: 45, Si: 15, Al: 10, N: 8, Ti: 5, Nd: 3 })
});

const LASER_BLOCK = defineBlock({
    name: 'Laser Array',
    desc: 'Continuous beam weapon. Fast fire rate, lower damage.',
    squares: [
        {x:-1,y:1,color:Colors.dimGray},{x:0,y:1,color:Colors.lightGray},{x:1,y:1,color:Colors.dimGray},
        {x:-1,y:0,color:Colors.steel},{x:0,y:0,color:Colors.steel},{x:1,y:0,color:Colors.steel},
        {x:-1,y:-1,color:Colors.steel},{x:0,y:-1,color:Colors.steel},{x:1,y:-1,color:Colors.steel},
        {x:2,y:-1,color:Colors.lightGray},{x:2,y:0,color:Colors.steel},{x:2,y:1,color:Colors.lightGray},{x:3,y:0,color:Colors.dimGray},
        {x:4,y:-1,color:Colors.lightGray},{x:4,y:0,color:Colors.cyan},{x:4,y:1,color:Colors.lightGray},{x:5,y:0,color:Colors.steel},
        {x:6,y:-1,color:Colors.lightGray},{x:6,y:0,color:Colors.teal},{x:6,y:1,color:Colors.lightGray},{x:7,y:0,color:Colors.steel},
        {x:8,y:-1,color:Colors.deepTeal},{x:8,y:0,color:Colors.paleCyan},{x:8,y:1,color:Colors.deepTeal},
        {x:0,y:-2,color:Colors.teal},{x:3,y:-2,color:Colors.teal},{x:5,y:-2,color:Colors.teal},{x:7,y:-2,color:Colors.teal},
        {x:-2,y:0,color:Colors.lightGray},{x:-2,y:-1,color:Colors.dimGray},{x:-2,y:1,color:Colors.dimGray}
    ],
    hp: 90, energyCost: 10, energyProduce: 0,
    range: 400, damage: 4, cooldown: 33,
    cost: Cargo({ H: 8, O: 25, C: 12, Fe: 20, Si: 40, Al: 8, N: 5, Ar: 3 })
});

const RADAR_BLOCK = defineBlock({
    name: 'Sensor Array',
    desc: 'Extends detection and targeting range for nearby weapons. No power required.',
    squares: [
        {x:0,y:0,color:Colors.steel},
        {x:-1,y:0,color:Colors.steel},{x:1,y:0,color:Colors.steel},{x:0,y:-1,color:Colors.steel},{x:0,y:1,color:Colors.steel},
        {x:-1,y:-1,color:Colors.lightGray},{x:1,y:-1,color:Colors.lightGray},{x:-1,y:1,color:Colors.lightGray},{x:1,y:1,color:Colors.lightGray},
        {x:-2,y:-2,color:Colors.dimGray},{x:-1,y:-2,color:Colors.steel},{x:0,y:-2,color:Colors.steel},{x:1,y:-2,color:Colors.steel},{x:2,y:-2,color:Colors.dimGray},
        {x:-2,y:2,color:Colors.dimGray},{x:-1,y:2,color:Colors.steel},{x:0,y:2,color:Colors.steel},{x:1,y:2,color:Colors.steel},{x:2,y:2,color:Colors.dimGray},
        {x:-3,y:-1,color:Colors.dimGray},{x:-3,y:0,color:Colors.lightGray},{x:-3,y:1,color:Colors.dimGray},
        {x:3,y:-1,color:Colors.dimGray},{x:3,y:0,color:Colors.lightGray},{x:3,y:1,color:Colors.dimGray},
        {x:0,y:-3,color:Colors.sky},{x:0,y:3,color:Colors.sky},{x:-3,y:0,color:Colors.sky},{x:3,y:0,color:Colors.sky},
        {x:-2,y:0,color:Colors.blue},{x:2,y:0,color:Colors.blue},{x:0,y:-2,color:Colors.blue},{x:0,y:2,color:Colors.blue},
        {x:-4,y:0,color:Colors.dimGray},{x:4,y:0,color:Colors.dimGray},{x:0,y:-4,color:Colors.dimGray},{x:0,y:4,color:Colors.dimGray}
    ],
    hp: 20, energyCost: 0, energyProduce: 0, rangeBoost: 1.3,
    damage: 0, range: 0, cooldown: 0,
    cost: Cargo({ H: 20, O: 15, C: 10, Fe: 15, Si: 45, Al: 12, N: 15, Ar: 5, Au: 10 })
});

const COLLECTOR_BLOCK = defineBlock({
    name: 'Drone Bay',
    desc: 'Launches drones to collect resources. Drones need storage space!',
    squares: [
        {x:-2,y:-1,color:Colors.dimGray},{x:-1,y:-1,color:Colors.lightGray},{x:0,y:-1,color:Colors.lightGray},{x:1,y:-1,color:Colors.lightGray},{x:2,y:-1,color:Colors.dimGray},
        {x:-1,y:0,color:Colors.steel},{x:0,y:0,color:Colors.steel},{x:1,y:0,color:Colors.steel},
        {x:-1,y:1,color:Colors.lightGray},{x:0,y:1,color:Colors.steel},{x:1,y:1,color:Colors.lightGray},{x:0,y:2,color:Colors.dimGray},
        {x:-2,y:0,color:Colors.mauve},{x:2,y:0,color:Colors.mauve},
        {x:-1,y:-2,color:Colors.purple},{x:0,y:-2,color:Colors.orchid},{x:1,y:-2,color:Colors.purple},{x:0,y:3,color:Colors.indigo},
        {x:-3,y:0,color:Colors.lightGray},{x:3,y:0,color:Colors.lightGray},{x:-2,y:1,color:Colors.dimGray},{x:2,y:1,color:Colors.dimGray}
    ],
    hp: 80, energyCost: 8, energyProduce: 0,
    damage: 0, range: 300, cooldown: 1000,
    droneMax: 6,
    cost: Cargo({ H: 18, O: 12, C: 22, Fe: 25, Si: 20, Al: 15, N: 20, Li: 3 })
});

const HULL_BLOCK = defineBlock({
    name: 'Hull Section',
    desc: 'Structural connector. Cheap way to extend your ship. Passes power through.',
    squares: [
        {x:-2,y:-1,color:Colors.dimGray},{x:-1,y:-1,color:Colors.lightGray},{x:0,y:-1,color:Colors.lightGray},{x:1,y:-1,color:Colors.lightGray},{x:2,y:-1,color:Colors.dimGray},
        {x:-2,y:0,color:Colors.steel},{x:-1,y:0,color:Colors.steel},{x:0,y:0,color:Colors.gray},{x:1,y:0,color:Colors.steel},{x:2,y:0,color:Colors.steel},
        {x:-2,y:1,color:Colors.dimGray},{x:-1,y:1,color:Colors.lightGray},{x:0,y:1,color:Colors.lightGray},{x:1,y:1,color:Colors.lightGray},{x:2,y:1,color:Colors.dimGray},
        {x:-3,y:0,color:Colors.dimGray},{x:3,y:0,color:Colors.dimGray}
    ],
    hp: 200, energyCost: 0, energyProduce: 0,
    damage: 0, range: 0, cooldown: 0,
    cost: Cargo({ H: 10, O: 5, C: 15, Fe: 20, Si: 5, Al: 5, N: 3 })
});

const SINGULARITY_BLOCK = defineBlock({
    name: 'Singularity Pulse',
    desc: 'Ultimate weapon. Creates a black hole that annihilates ALL matter in range.',
    squares: [
        {x:0,y:0,color:Colors.white},
        {x:-1,y:0,color:Colors.lavender},{x:1,y:0,color:Colors.lavender},{x:0,y:-1,color:Colors.lavender},{x:0,y:1,color:Colors.lavender},
        {x:-1,y:-1,color:Colors.orchid},{x:1,y:-1,color:Colors.orchid},{x:-1,y:1,color:Colors.orchid},{x:1,y:1,color:Colors.orchid},
        {x:-2,y:0,color:Colors.orchid},{x:2,y:0,color:Colors.orchid},{x:0,y:-2,color:Colors.orchid},{x:0,y:2,color:Colors.orchid},
        {x:-2,y:-1,color:Colors.purple},{x:2,y:-1,color:Colors.purple},{x:-2,y:1,color:Colors.purple},{x:2,y:1,color:Colors.purple},
        {x:-1,y:-2,color:Colors.purple},{x:1,y:-2,color:Colors.purple},{x:-1,y:2,color:Colors.purple},{x:1,y:2,color:Colors.purple},
        {x:-3,y:0,color:Colors.purple},{x:3,y:0,color:Colors.purple},{x:0,y:-3,color:Colors.purple},{x:0,y:3,color:Colors.purple},
        {x:-3,y:-1,color:Colors.mauve},{x:3,y:-1,color:Colors.mauve},{x:-3,y:1,color:Colors.mauve},{x:3,y:1,color:Colors.mauve},
        {x:-1,y:-3,color:Colors.mauve},{x:1,y:-3,color:Colors.mauve},{x:-1,y:3,color:Colors.mauve},{x:1,y:3,color:Colors.mauve},
        {x:-2,y:-2,color:Colors.lightGray},{x:2,y:-2,color:Colors.lightGray},{x:-2,y:2,color:Colors.lightGray},{x:2,y:2,color:Colors.lightGray},
        {x:-4,y:0,color:Colors.lavender},{x:4,y:0,color:Colors.lavender},{x:0,y:-4,color:Colors.lavender},{x:0,y:4,color:Colors.lavender},
        {x:-4,y:-1,color:Colors.dimGray},{x:4,y:-1,color:Colors.dimGray},{x:-4,y:1,color:Colors.dimGray},{x:4,y:1,color:Colors.dimGray},
        {x:-1,y:-4,color:Colors.dimGray},{x:1,y:-4,color:Colors.dimGray},{x:-1,y:4,color:Colors.dimGray},{x:1,y:4,color:Colors.dimGray},
        {x:-3,y:-2,color:Colors.purple},{x:3,y:-2,color:Colors.purple},{x:-3,y:2,color:Colors.purple},{x:3,y:2,color:Colors.purple},
        {x:-2,y:-3,color:Colors.purple},{x:2,y:-3,color:Colors.purple},{x:-2,y:3,color:Colors.purple},{x:2,y:3,color:Colors.purple},
        {x:-5,y:0,color:Colors.orchid},{x:5,y:0,color:Colors.orchid},{x:0,y:-5,color:Colors.orchid},{x:0,y:5,color:Colors.orchid},
        {x:-5,y:-1,color:Colors.dimGray},{x:5,y:-1,color:Colors.dimGray},{x:-5,y:1,color:Colors.dimGray},{x:5,y:1,color:Colors.dimGray},
        {x:-1,y:-5,color:Colors.dimGray},{x:1,y:-5,color:Colors.dimGray},{x:-1,y:5,color:Colors.dimGray},{x:1,y:5,color:Colors.dimGray}
    ],
    hp: 1000, energyCost: 500, energyProduce: 0,
    damage: 0, range: 400, cooldown: 15000,
    triggerThreshold: 8,
    cost: Cargo({ H: 400, O: 500, C: 800, Fe: 700, Si: 800, Al: 300, N: 250, Li: 200, Ar: 150, Ti: 350, Nd: 400, Au: 250 })
});

const CORE_BLOCK = defineBlock({
    name: 'Command Core',
    desc: 'Central hub. Powers nearby modules. Auto-defends small threats. LIMITED storage.',
    squares: [
        {x:0,y:0,color:Colors.white},
        {x:-1,y:0,color:Colors.silver},{x:1,y:0,color:Colors.silver},{x:0,y:-1,color:Colors.silver},{x:0,y:1,color:Colors.silver},
        {x:-1,y:-1,color:Colors.gray},{x:1,y:-1,color:Colors.gray},{x:-1,y:1,color:Colors.gray},{x:1,y:1,color:Colors.gray},
        {x:-2,y:0,color:Colors.steel},{x:2,y:0,color:Colors.steel},{x:0,y:-2,color:Colors.steel},{x:0,y:2,color:Colors.steel},
        {x:-2,y:-1,color:Colors.steel},{x:2,y:-1,color:Colors.steel},{x:-2,y:1,color:Colors.steel},{x:2,y:1,color:Colors.steel},
        {x:-1,y:-2,color:Colors.steel},{x:1,y:-2,color:Colors.steel},{x:-1,y:2,color:Colors.steel},{x:1,y:2,color:Colors.steel},
        {x:-3,y:0,color:Colors.lightGray},{x:3,y:0,color:Colors.lightGray},{x:0,y:-3,color:Colors.lightGray},{x:0,y:3,color:Colors.lightGray},
        {x:-2,y:-2,color:Colors.dimGray},{x:2,y:-2,color:Colors.dimGray},{x:-2,y:2,color:Colors.dimGray},{x:2,y:2,color:Colors.dimGray},
        {x:-3,y:-1,color:Colors.blue},{x:3,y:-1,color:Colors.blue},{x:-3,y:1,color:Colors.blue},{x:3,y:1,color:Colors.blue},
        {x:-1,y:-3,color:Colors.blue},{x:1,y:-3,color:Colors.blue},{x:-1,y:3,color:Colors.blue},{x:1,y:3,color:Colors.blue}
    ],
    hp: 2000, energyCost: 0, energyProduce: 50,
    range: 220, damage: 15, cooldown: 300,
    cost: Cargo(),
    cargo: Cargo()
        .addCapacity(ENERGY_BLOCK.cost)
        .addCapacity(CANON_BLOCK.cost)
        .addCapacity(COLLECTOR_BLOCK.cost)
        .fill()
});

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
    cargo: Cargo({ H: 5, O: 4, C: 4, Fe: 3, Si: 3, Al: 3, N: 4, Li: 3, Ar: 3, Ti: 2, Nd: 2, Au: 1}),
    range: 12,
};
