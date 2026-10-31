'use strict';
// Element data + electron configurations for the atom library.
// Masses are standard atomic weights (most stable isotope for the
// short-lived synthetic elements). The nuclei are real isotopes from
// nuclides.js (IAEA/NUBASE2020) — not masses rounded to whole numbers.
(function (root) {
    const CATEGORY = {
        alkali:     { name: 'alkali metal',     color: '#ff8b6b', blurb: 'Soft, shiny metals that react dramatically with water — watch sodium fizz in a pond!' },
        alkaline:   { name: 'alkaline earth',   color: '#ffc570', blurb: 'Sturdy metals like magnesium and calcium — bones, chalk, and fireworks!' },
        transition: { name: 'transition metal', color: '#5b9dff', blurb: 'The metals in the middle: iron, gold, copper. Strong, shiny, and brilliantly coloured!' },
        post:       { name: 'post-transition',  color: '#59d8c3', blurb: 'Gentle everyday metals — aluminium, tin, and lead live here.' },
        metalloid:  { name: 'metalloid',        color: '#b3e04f', blurb: 'Half metal, half not — silicon and germanium run your computer chips!' },
        nonmetal:   { name: 'nonmetal',         color: '#63e6a0', blurb: 'The chemistry of life: carbon, oxygen, nitrogen, phosphorus, sulfur!' },
        halogen:    { name: 'halogen',          color: '#ffe14f', blurb: 'Fizzy, reactive elements — a green gas (chlorine), a red liquid (bromine), purple iodine!' },
        noble:      { name: 'noble gas',        color: '#c99bff', blurb: 'The quiet ones — so calm they barely react with anything. They glow in neon signs!' },
        lanthanide: { name: 'lanthanide',       color: '#ff9de0', blurb: 'The rare-earth metals — magnets, phone screens, and glow-in-the-dark colours!' },
        actinide:   { name: 'actinide',         color: '#ff6f91', blurb: 'Heavy, radioactive metals — uranium and plutonium fuel nuclear reactors!' },
    };

    // [symbol, name, mass, category]
    const RAW = [
        ['H','Hydrogen',1.008,'nonmetal'],
        ['He','Helium',4.0026,'noble'],
        ['Li','Lithium',6.94,'alkali'],
        ['Be','Beryllium',9.0122,'alkaline'],
        ['B','Boron',10.81,'metalloid'],
        ['C','Carbon',12.011,'nonmetal'],
        ['N','Nitrogen',14.007,'nonmetal'],
        ['O','Oxygen',15.999,'nonmetal'],
        ['F','Fluorine',18.998,'halogen'],
        ['Ne','Neon',20.18,'noble'],
        ['Na','Sodium',22.99,'alkali'],
        ['Mg','Magnesium',24.305,'alkaline'],
        ['Al','Aluminium',26.982,'post'],
        ['Si','Silicon',28.085,'metalloid'],
        ['P','Phosphorus',30.974,'nonmetal'],
        ['S','Sulfur',32.06,'nonmetal'],
        ['Cl','Chlorine',35.45,'halogen'],
        ['Ar','Argon',39.95,'noble'],
        ['K','Potassium',39.098,'alkali'],
        ['Ca','Calcium',40.078,'alkaline'],
        ['Sc','Scandium',44.956,'transition'],
        ['Ti','Titanium',47.867,'transition'],
        ['V','Vanadium',50.942,'transition'],
        ['Cr','Chromium',51.996,'transition'],
        ['Mn','Manganese',54.938,'transition'],
        ['Fe','Iron',55.845,'transition'],
        ['Co','Cobalt',58.933,'transition'],
        ['Ni','Nickel',58.693,'transition'],
        ['Cu','Copper',63.546,'transition'],
        ['Zn','Zinc',65.38,'transition'],
        ['Ga','Gallium',69.723,'post'],
        ['Ge','Germanium',72.63,'metalloid'],
        ['As','Arsenic',74.922,'metalloid'],
        ['Se','Selenium',78.971,'nonmetal'],
        ['Br','Bromine',79.904,'halogen'],
        ['Kr','Krypton',83.798,'noble'],
        ['Rb','Rubidium',85.468,'alkali'],
        ['Sr','Strontium',87.62,'alkaline'],
        ['Y','Yttrium',88.906,'transition'],
        ['Zr','Zirconium',91.224,'transition'],
        ['Nb','Niobium',92.906,'transition'],
        ['Mo','Molybdenum',95.95,'transition'],
        ['Tc','Technetium',98,'transition'],
        ['Ru','Ruthenium',101.07,'transition'],
        ['Rh','Rhodium',102.91,'transition'],
        ['Pd','Palladium',106.42,'transition'],
        ['Ag','Silver',107.87,'transition'],
        ['Cd','Cadmium',112.41,'transition'],
        ['In','Indium',114.82,'post'],
        ['Sn','Tin',118.71,'post'],
        ['Sb','Antimony',121.76,'metalloid'],
        ['Te','Tellurium',127.6,'metalloid'],
        ['I','Iodine',126.9,'halogen'],
        ['Xe','Xenon',131.29,'noble'],
        ['Cs','Caesium',132.91,'alkali'],
        ['Ba','Barium',137.33,'alkaline'],
        ['La','Lanthanum',138.91,'lanthanide'],
        ['Ce','Cerium',140.12,'lanthanide'],
        ['Pr','Praseodymium',140.91,'lanthanide'],
        ['Nd','Neodymium',144.24,'lanthanide'],
        ['Pm','Promethium',145,'lanthanide'],
        ['Sm','Samarium',150.36,'lanthanide'],
        ['Eu','Europium',151.96,'lanthanide'],
        ['Gd','Gadolinium',157.25,'lanthanide'],
        ['Tb','Terbium',158.93,'lanthanide'],
        ['Dy','Dysprosium',162.5,'lanthanide'],
        ['Ho','Holmium',164.93,'lanthanide'],
        ['Er','Erbium',167.26,'lanthanide'],
        ['Tm','Thulium',168.93,'lanthanide'],
        ['Yb','Ytterbium',173.05,'lanthanide'],
        ['Lu','Lutetium',174.97,'lanthanide'],
        ['Hf','Hafnium',178.49,'transition'],
        ['Ta','Tantalum',180.95,'transition'],
        ['W','Tungsten',183.84,'transition'],
        ['Re','Rhenium',186.21,'transition'],
        ['Os','Osmium',190.23,'transition'],
        ['Ir','Iridium',192.22,'transition'],
        ['Pt','Platinum',195.08,'transition'],
        ['Au','Gold',196.97,'transition'],
        ['Hg','Mercury',200.59,'transition'],
        ['Tl','Thallium',204.38,'post'],
        ['Pb','Lead',207.2,'post'],
        ['Bi','Bismuth',208.98,'post'],
        ['Po','Polonium',209,'post'],
        ['At','Astatine',210,'halogen'],
        ['Rn','Radon',222,'noble'],
        ['Fr','Francium',223,'alkali'],
        ['Ra','Radium',226,'alkaline'],
        ['Ac','Actinium',227,'actinide'],
        ['Th','Thorium',232.04,'actinide'],
        ['Pa','Protactinium',231.04,'actinide'],
        ['U','Uranium',238.03,'actinide'],
        ['Np','Neptunium',237,'actinide'],
        ['Pu','Plutonium',244,'actinide'],
        ['Am','Americium',243,'actinide'],
        ['Cm','Curium',247,'actinide'],
        ['Bk','Berkelium',247,'actinide'],
        ['Cf','Californium',251,'actinide'],
        ['Es','Einsteinium',252,'actinide'],
        ['Fm','Fermium',257,'actinide'],
        ['Md','Mendelevium',258,'actinide'],
        ['No','Nobelium',259,'actinide'],
        ['Lr','Lawrencium',266,'actinide'],
        ['Rf','Rutherfordium',267,'transition'],
        ['Db','Dubnium',268,'transition'],
        ['Sg','Seaborgium',269,'transition'],
        ['Bh','Bohrium',270,'transition'],
        ['Hs','Hassium',269,'transition'],
        ['Mt','Meitnerium',278,'transition'],
        ['Ds','Darmstadtium',281,'transition'],
        ['Rg','Roentgenium',282,'transition'],
        ['Cn','Copernicium',285,'transition'],
        ['Nh','Nihonium',286,'post'],
        ['Fl','Flerovium',289,'post'],
        ['Mc','Moscovium',290,'post'],
        ['Lv','Livermorium',293,'post'],
        ['Ts','Tennessine',294,'halogen'],
        ['Og','Oganesson',294,'noble'],
    ];

    const GAS = new Set([1, 2, 7, 8, 9, 10, 17, 18, 36, 54, 86]);
    const LIQUID = new Set([35, 80]);

    // Filling order (n, l) — the Aufbau building rule kids learn.
    const AUFBAU = [
        [1, 0], [2, 0], [2, 1], [3, 0], [3, 1], [4, 0], [3, 2], [4, 1], [5, 0],
        [4, 2], [5, 1], [6, 0], [4, 3], [5, 2], [6, 1], [7, 0], [5, 3], [6, 2], [7, 1],
    ];
    const CAP = (l) => 2 * (2 * l + 1);
    const SUBNAME = ['s', 'p', 'd', 'f', 'g'];

    // A handful of famous exceptions to the plain Aufbau rule
    // (half-filled and filled subshells win one electron back).
    const EXCEPT = {
        24: { '3d': 5, '4s': 1 },   29: { '3d': 10, '4s': 1 },
        41: { '4d': 4, '5s': 1 },   42: { '4d': 5, '5s': 1 },
        44: { '4d': 7, '5s': 1 },   45: { '4d': 8, '5s': 1 },
        46: { '4d': 10, '5s': 0 },  47: { '4d': 10, '5s': 1 },
        57: { '4f': 0, '5d': 1 },   58: { '4f': 1, '5d': 1 },
        64: { '4f': 7, '5d': 1 },   78: { '5d': 9, '6s': 1 },
        79: { '5d': 10, '6s': 1 },  89: { '5f': 0, '6d': 1 },
        90: { '5f': 0, '6d': 2 },   91: { '5f': 2, '6d': 1 },
        92: { '5f': 3, '6d': 1 },   93: { '5f': 4, '6d': 1 },
        96: { '5f': 7, '6d': 1 },  103: { '6d': 0, '7p': 1 },
    };

    function configuration (z) {
        let left = z;
        const subs = [];
        for (const [n, l] of AUFBAU) {
            if (left <= 0) break;
            const k = Math.min(CAP(l), left);
            subs.push({ n, l, k, cap: CAP(l) });
            left -= k;
        }
        const ex = EXCEPT[z];
        if (ex) {
            for (const key in ex) {
                const n = +key[0], l = SUBNAME.indexOf(key[1]);
                const found = subs.find((s) => s.n === n && s.l === l);
                if (found) found.k = ex[key];
                else if (ex[key] > 0) subs.push({ n, l, k: ex[key], cap: CAP(l) });
            }
        }
        return subs.filter((s) => s.k > 0); // keep filling order for display
    }

    // Group / period / grid cell / block from the atomic number. The f-block
    // rows sit outside the group columns and carry no group.
    function placement (z) {
        if (z === 1) return { col: 1, row: 1, period: 1, group: 1, block: 's' };
        if (z === 2) return { col: 18, row: 1, period: 1, group: 18, block: 's' };
        if (z <= 10) return { col: z <= 4 ? z - 2 : z + 8, row: 2, period: 2, group: z <= 4 ? z - 2 : z + 8, block: z <= 4 ? 's' : 'p' };
        if (z <= 18) return { col: z <= 12 ? z - 10 : z, row: 3, period: 3, group: z <= 12 ? z - 10 : z, block: z <= 12 ? 's' : 'p' };
        if (z <= 36) return { col: z - 18, row: 4, period: 4, group: z - 18, block: z <= 20 ? 's' : z <= 30 ? 'd' : 'p' };
        if (z <= 54) return { col: z - 36, row: 5, period: 5, group: z - 36, block: z <= 38 ? 's' : z <= 48 ? 'd' : 'p' };
        if (z <= 56) return { col: z - 54, row: 6, period: 6, group: z - 54, block: 's' };
        if (z <= 71) return { col: z - 54, row: 9, period: 6, group: null, block: 'f' }; // La–Lu
        if (z <= 86) return { col: z - 68, row: 6, period: 6, group: z - 68, block: z <= 80 ? 'd' : 'p' };
        if (z <= 88) return { col: z - 86, row: 7, period: 7, group: z - 86, block: 's' };
        if (z <= 103) return { col: z - 86, row: 10, period: 7, group: null, block: 'f' }; // Ac–Lr
        return { col: z - 100, row: 7, period: 7, group: z - 100, block: z <= 112 ? 'd' : 'p' };
    }

    const SHELLS = ['K', 'L', 'M', 'N', 'O', 'P', 'Q'];

    const ELEMENTS = RAW.map((e, i) => {
        const z = i + 1;
        const subs = configuration(z);
        const shells = [];
        for (const s of subs) {
            let sh = shells.find((x) => x.n === s.n);
            if (!sh) { sh = { n: s.n, k: 0 }; shells.push(sh); }
            sh.k += s.k;
        }
        shells.sort((a, b) => a.n - b.n);
        const nMax = shells[shells.length - 1].n;
        // Real isotopes from nuclides.js (IAEA/NUBASE2020), sorted by mass
        // number. `home` is the isotope the nucleus shows first: the one
        // nature actually uses most (abundance decides), or for elements that
        // never occur in nature, the longest-lived one known.
        const nominal = Math.round(e[2]);
        const iso = (root.AtomNuclides[z] || []).map(([a, hl, pct]) => ({
            a, n: a - z, hl, pct, stable: hl === 0,
        }));
        const rank = (it) => (it.hl === 0 ? Infinity : it.hl);
        let home = null;
        for (const it of iso) {
            if (!home) { home = it; continue; }
            const better = it.pct !== home.pct ? it.pct > home.pct
                : rank(it) !== rank(home) ? rank(it) > rank(home)
                : Math.abs(it.a - nominal) < Math.abs(home.a - nominal);
            if (better) home = it;
        }
        return {
            z, symbol: e[0], name: e[1], mass: e[2], category: e[3],
            phase: z >= 104 ? 'unknown' : GAS.has(z) ? 'gas' : LIQUID.has(z) ? 'liquid' : 'solid',
            isotopes: iso, home,
            subs, shells, nMax,
            ...placement(z),
        };
    });

    root.AtomData = { CATEGORY, ELEMENTS, SHELLS, SUBNAME };
})(typeof window !== 'undefined' ? window : this);
