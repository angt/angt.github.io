'use strict';
(function () {
    const { CATEGORY, ELEMENTS, SHELLS, SUBNAME } = window.AtomData;
    const { matMul, rotX, rotZ } = window.Orbital;
    const $ = (id) => document.getElementById(id);

    // ---------- small helpers ----------

    const SUP = { '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹' };
    const sup = (n) => String(n).split('').map((c) => SUP[c] || c).join('');
    const smoother = (u) => u * u * u * (u * (u * 6 - 15) + 10);

    // Real-orbital names for the m variants (tesseral harmonics).
    const NAMES = {
        0: { 0: 's' },
        1: { 0: 'p_z', 1: 'p_x', '-1': 'p_y' },
        2: { 0: 'd_z²', 1: 'd_xz', '-1': 'd_yz', 2: 'd_x²−y²', '-2': 'd_xy' },
        3: { 0: 'f_z³', 1: 'f_xz²', '-1': 'f_yz²', 2: 'f_z(x²−y²)', '-2': 'f_xyz', 3: 'f_x(x²−3y²)', '-3': 'f_y(3x²−y²)' },
        4: { 0: 'g_z⁴' },
    };
    const nameOf = (l, m) => (NAMES[l] && NAMES[l][m]) || (SUBNAME[l] + (m ? ' (m=' + (m > 0 ? '+' : '') + m + ')' : ''));

    function subLabel (s) { return s.n + SUBNAME[s.l]; }
    function ketOf (s) { return '|' + s.n + ', ' + s.l + ', ' + s.m + '⟩'; }
    function nodesOf (s) {
        const r = s.n - s.l - 1;
        return (r ? r + ' radial node' + (r > 1 ? 's' : '') : 'no radial nodes') +
               ' · ' + (s.l ? s.l + ' angular node' + (s.l > 1 ? 's' : '') : 'no angular nodes');
    }

    // m variants of a subshell, in teaching order: m = 0, +1, -1, +2, -2...
    function mVariants (l) {
        const out = [0];
        for (let m = 1; m <= l; m++) { out.push(m); out.push(-m); }
        return out;
    }

    // ---------- orbital viewer (holds, then morphs through zero) ----------

    // The glow's dials. level = the strongest share of the wave that
    // forms the body/surface (0.15 = the strongest 15% of its probability,
    // the level auto-adapts per state); body hardens the accumulated glow
    // into a solid (0 = the pure glow); light shades the medium itself.
    const look = { level: 0.15, body: 0.65, light: 0.55 };

    const HOLD = 5.4, MORPH = 1.9, CYCLE = HOLD + MORPH;

    function makeViewer (canvasId, ketId, noteId) {
        const ketEl = $(ketId), noteEl = $(noteId);
        let canvas = $(canvasId);
        let R = null, mode = 'solid';
        let states = [], vt = 0, segBase = 0, freeze = 0, last = null, shown = '';
        let rotT = 1.7, uRot = [1, 0, 0, 0, 1, 0, 0, 0, 1], vYaw = 0, vPitch = 0;
        let dragging = false, lastX = 0, lastY = 0, lastT = 0;

        // A canvas holds one kind of context forever, so switching drawing
        // modes swaps in a fresh canvas node first. Falls back to the dot
        // renderer whenever WebGL2 is unavailable.
        function buildRenderer () {
            const fresh = canvas.cloneNode(false);
            canvas.replaceWith(fresh);
            canvas = fresh;
            R = (mode !== 'dots' && window.OrbitalVolume &&
                 window.OrbitalVolume.createRenderer(canvas, mode)) ||
                window.Orbital.createRenderer(canvas);
            attachPointer();
        }

        // ---- orbit around the atom with the cursor ----
        // Drag turns the atom (yaw about the vertical, pitch about the
        // screen-horizontal axis), a flick coasts with inertia, and the
        // slow auto-tumble holds still while you are holding the atom.
        // The state is one rotation matrix; every turn multiplies another
        // SO(3) factor into it, so the orbit is free — no gimbal to lock,
        // nothing to clamp.

        const K = 0.006; // radians of turn per CSS pixel dragged

        // Compose one orbit step into uRot: rotX(dpitch)·rotZ(dyaw) on the
        // left (world frame), the same frame the tumble lives in.
        function orbit (dyaw, dpitch) {
            uRot = matMul(rotX(dpitch), matMul(rotZ(dyaw), uRot));
        }

        function attachPointer () {
            canvas.style.touchAction = 'pan-y'; // vertical swipes still scroll the page
            canvas.addEventListener('pointerdown', (ev) => {
                dragging = true; vYaw = 0; vPitch = 0;
                lastX = ev.clientX; lastY = ev.clientY; lastT = ev.timeStamp;
                canvas.classList.add('drag');
                if (canvas.setPointerCapture) canvas.setPointerCapture(ev.pointerId);
            });
            canvas.addEventListener('pointermove', (ev) => {
                if (!dragging) return;
                const dx = ev.clientX - lastX, dy = ev.clientY - lastY;
                const dtm = Math.max(0.008, (ev.timeStamp - lastT) / 1000);
                lastX = ev.clientX; lastY = ev.clientY; lastT = ev.timeStamp;
                orbit(-dx * K, -dy * K);
                if (reduce) {
                    still();
                } else {
                    vYaw = Math.max(-7, Math.min(7, -dx * K / dtm));
                    vPitch = Math.max(-7, Math.min(7, -dy * K / dtm));
                }
            });
            const release = () => {
                if (!dragging) return;
                dragging = false;
                canvas.classList.remove('drag');
            };
            canvas.addEventListener('pointerup', release);
            canvas.addEventListener('pointercancel', release);
        }

        buildRenderer();

        function setMode (m) {
            if (m === mode) return;
            mode = m;
            buildRenderer();
            resize();
            still();
        }

        // Clouds are generated on first use, so switching elements stays snappy.
        const ensure = (s) => s.cloud || (s.cloud = window.Orbital.makeCloud(s.n, s.l, s.m));

        function setStates (list, start) {
            states = list;
            segBase = start || 0;
            vt = segBase * CYCLE;
            freeze = 0; shown = '';
        }
        function jump (i) {
            if (!states[i]) return;
            segBase = i; vt = i * CYCLE; freeze = 20;
        }
        function drawAt (T, rt) {
            const n = states.length;
            if (!n) return;
            const seg = Math.floor(T / CYCLE);
            const ia = seg % n, ib = (seg + 1) % n;
            const phase = T - seg * CYCLE;
            const A = states[ia], B = states[n === 1 ? ia : ib];
            let e = 0, txt, note;
            if (phase < HOLD || n === 1) {
                txt = ketOf(A) + ' · ' + A.name;
                note = A.note;
            } else {
                e = smoother((phase - HOLD) / MORPH);
                txt = ketOf(A) + ' → ' + ketOf(B);
                note = 'morphing through zero — nodes stay honest';
            }
            if (txt !== shown && ketEl) {
                shown = txt;
                ketEl.textContent = txt;
                if (noteEl) noteEl.textContent = note;
            }
            const rot = window.Orbital.makeRotation(rt, uRot);
            if (R.volume) R.draw(A, B, e, rot, look);
            else R.draw(ensure(A), ensure(B), e, rot);
        }
        function frame (now) {
            if (last !== null) {
                const dt = Math.min(0.1, now - last);
                if (freeze > 0) {
                    freeze -= dt;
                    if (freeze <= 0) vt = segBase * CYCLE;
                } else if (!dragging) {
                    vt += dt;
                }
                if (!dragging) {
                    rotT += dt;
                    if (vYaw || vPitch) {
                        orbit(vYaw * dt, vPitch * dt);
                        const decay = Math.exp(-3.5 * dt);
                        vYaw *= decay; vPitch *= decay;
                        if (Math.abs(vYaw) < 0.03) vYaw = 0;
                        if (Math.abs(vPitch) < 0.03) vPitch = 0;
                    }
                }
            }
            last = now;
            drawAt(vt, rotT);
        }
        function still () { drawAt(segBase * CYCLE, rotT); }
        function resize () { R.resize(); }
        return { setStates, jump, frame, still, resize, setMode };
    }

    // ---------- periodic table ----------

    const ptEl = $('pt');
    const cellByZ = [];
    function buildTable () {
        const frag = document.createDocumentFragment();
        for (const el of ELEMENTS) {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'cell';
            b.style.gridColumn = el.col;
            b.style.gridRow = el.row;
            b.style.setProperty('--c', CATEGORY[el.category].color);
            b.innerHTML = '<i>' + el.z + '</i><b>' + el.symbol + '</b>';
            b.title = el.z + ' ' + el.name;
            b.addEventListener('click', () => select(el.z, true));
            frag.appendChild(b);
            cellByZ[el.z] = b;
        }
        for (const [txt, row] of [['57–71', 6], ['89–103', 7]]) {
            const b = document.createElement('div');
            b.className = 'cell placeholder';
            b.style.gridColumn = 3;
            b.style.gridRow = row;
            b.textContent = txt;
            frag.appendChild(b);
        }
        for (const [txt, row] of [['lanthanides', 9], ['actinides', 10]]) {
            const b = document.createElement('div');
            b.className = 'rowlabel';
            b.style.gridRow = row;
            b.textContent = txt;
            frag.appendChild(b);
        }
        ptEl.appendChild(frag);

        $('catLegend').innerHTML = Object.keys(CATEGORY).map((k) =>
            '<span class="lg-item"><i style="background:' + CATEGORY[k].color + '"></i>' +
            CATEGORY[k].name + '</span>').join('');
    }

    // ---------- element detail panel ----------

    const elViewer = makeViewer('elOrb', 'elKet', 'elNote');
    let currentZ = 6;

    // The complete catalogue of orbital shapes (1s … 4f, all 30). Every
    // element can show all of them, filled or not.
    const GALLERY = [[1, 0], [2, 0], [2, 1], [3, 0], [3, 1], [3, 2], [4, 0], [4, 1], [4, 2], [4, 3]];

    function statesFor (el) {
        const out = [];
        for (const sub of el.subs) {
            for (const m of mVariants(sub.l)) {
                out.push({
                    n: sub.n, l: sub.l, m,
                    name: nameOf(sub.l, m),
                    cloud: null,
                    note: subLabel(sub) + ' subshell · ' + sub.k + ' electron' + (sub.k > 1 ? 's' : '') +
                          ' · ' + nodesOf({ n: sub.n, l: sub.l, m }),
                });
            }
        }
        const galleryStart = out.length;
        for (const [n, l] of GALLERY) {
            const own = el.subs.find((s) => s.n === n && s.l === l);
            for (const m of mVariants(l)) {
                out.push({
                    n, l, m,
                    name: nameOf(l, m),
                    cloud: null,
                    note: (own ? subLabel(own) + ' — ' + own.k + ' electron' + (own.k > 1 ? 's' : '') + ' of ' + el.name
                                : 'empty in ' + el.name + ' — the shape an excited electron would take') +
                          ' · ' + nodesOf({ n, l, m }),
                });
            }
        }
        return { states: out, galleryStart };
    }

    const configString = (el) => el.subs.map((s) => subLabel(s) + sup(s.k)).join(' ');

    function select (z, scroll) {
        currentZ = ((z - 1 + ELEMENTS.length) % ELEMENTS.length) + 1;
        const el = ELEMENTS[currentZ - 1];
        const cat = CATEGORY[el.category];

        $('elSym').textContent = el.symbol;
        $('elSym').style.color = cat.color;
        $('elName').textContent = el.name;
        $('elZ').textContent = el.z;
        $('elMass').textContent = el.mass + ' u';
        $('elPlace').textContent = (el.group ? 'group ' + el.group + ' · ' : '') +
            'period ' + el.period + ' · ' + el.block + '-block';
        $('elCat').textContent = cat.name;
        $('elCat').style.color = cat.color;
        $('elCat').style.borderColor = cat.color;
        $('elPhase').textContent = el.phase === 'unknown' ? 'unknown — made one atom at a time' : el.phase;
        $('elNuclear').innerHTML = 'typical atom: <b>' + el.z + '</b> protons · <b>' + el.neutrons + '</b> neutrons · <b>' + el.z + '</b> electrons';
        $('elConfig').textContent = configString(el);
        $('elShells').innerHTML = el.shells.map((s, i) =>
            '<span class="shell"><i>' + SHELLS[i] + '</i>' + s.k + '</span>').join('');
        $('elBlurb').textContent = cat.blurb;

        const { states, galleryStart } = statesFor(el);
        $('elChips').innerHTML = el.subs.map((s) => {
            const idx = states.findIndex((x) => x.n === s.n && x.l === s.l);
            return '<button type="button" class="chip' + (idx === 0 ? ' on' : '') + '" data-i="' + idx + '">' +
                subLabel(s) + '<i>' + s.k + '</i></button>';
        }).join('') +
            '<button type="button" class="chip" data-i="' + galleryStart + '">every shape<i>✦</i></button>';
        $('elChips').querySelectorAll('.chip').forEach((c) => {
            c.addEventListener('click', () => {
                $('elChips').querySelectorAll('.chip').forEach((x) => x.classList.remove('on'));
                c.classList.add('on');
                elViewer.jump(+c.dataset.i);
            });
        });

        elViewer.setStates(states);
        elViewer.resize();
        layoutNucleus(el);
        if (reduce) elViewer.still();

        if (cellByZ[currentZ]) {
            ptEl.querySelectorAll('.cell.sel').forEach((x) => x.classList.remove('sel'));
            cellByZ[currentZ].classList.add('sel');
        }
        if (scroll) $('detail').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    // ---------- Bohr shell diagram ----------

    const bohr = $('bohr');
    const bctx = bohr.getContext('2d');
    let nucleons = [];

    // Exactly z protons mixed through the cluster. The labels are shuffled
    // with a fixed seed (interleaving them in order along the spiral reads
    // as false spiral stripes), and the disk is recentred afterwards, so
    // even a single nucleon sits in the middle — hydrogen's nucleus used
    // to be drawn visibly off-axis.
    function layoutNucleus (el) {
        const A = Math.max(1, Math.round(el.mass)), GA = Math.PI * (1 + Math.sqrt(5));
        let seed = el.z * 97 + 13;
        const rnd = () => (seed = (1103515245 * seed + 12345) % 2147483648) / 2147483648;
        const proton = new Array(A);
        for (let i = 0; i < A; i++) proton[i] = i < el.z;
        for (let i = A - 1; i > 0; i--) {
            const j = Math.floor(rnd() * (i + 1));
            const t = proton[i]; proton[i] = proton[j]; proton[j] = t;
        }
        nucleons = [];
        let cx = 0, cy = 0;
        for (let i = 0; i < A; i++) {
            const a = GA * i, r = Math.sqrt((i + 0.5) / A);
            const p = { x: r * Math.cos(a), y: r * Math.sin(a), proton: proton[i] };
            cx += p.x; cy += p.y;
            nucleons.push(p);
        }
        cx /= A; cy /= A;
        let mr = 0;
        for (const p of nucleons) {
            p.x -= cx; p.y -= cy;
            const d = Math.sqrt(p.x * p.x + p.y * p.y);
            if (d > mr) mr = d;
        }
        if (mr > 1) for (const p of nucleons) { p.x /= mr; p.y /= mr; }
    }

    function drawBohr (T) {
        const el = ELEMENTS[currentZ - 1];
        const W = bohr.clientWidth, H = bohr.clientHeight;
        if (!W || !H) return;
        const DPR = Math.min(3, window.devicePixelRatio || 1);
        const Wp = Math.round(W * DPR), Hp = Math.round(H * DPR);
        // Both buffer axes update together — a stale height squashes the
        // drawing vertically (that is how the school model got distorted).
        if (bohr.width !== Wp || bohr.height !== Hp) { bohr.width = Wp; bohr.height = Hp; }
        const ctx = bctx;
        ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
        ctx.clearRect(0, 0, W, H);
        const cx = W / 2, cy = H / 2, S = Math.min(W, H) / 300;

        // nucleus: rose = protons (positive), grey = neutrons
        const rn = (4 + 2 * Math.cbrt(nucleons.length)) * S;
        // Packing-based ball size: nucleons touch instead of melting into
        // one blob on heavy atoms.
        const nr = Math.max(1.1, Math.min(2.4, rn / Math.sqrt(nucleons.length) * 1.15)) * S;
        for (const nu of nucleons) {
            ctx.beginPath();
            ctx.arc(cx + nu.x * rn, cy + nu.y * rn, nr, 0, 2 * Math.PI);
            ctx.fillStyle = nu.proton ? 'rgba(255,120,170,0.85)' : 'rgba(139,152,173,0.7)';
            ctx.fill();
        }

        // electron shells, gently counter-rotating
        const shells = el.shells;
        for (let i = 0; i < shells.length; i++) {
            const rr = (34 + i * 16) * S;
            ctx.beginPath();
            ctx.arc(cx, cy, rr, 0, 2 * Math.PI);
            ctx.strokeStyle = 'rgba(230,237,243,0.08)';
            ctx.lineWidth = 1;
            ctx.stroke();
            const c = shells[i].k;
            const w = (i % 2 ? -1 : 1) * T * 0.35 / (i + 1);
            for (let j = 0; j < c; j++) {
                const a = (j / c) * 2 * Math.PI + w;
                const x = cx + rr * Math.cos(a), y = cy + rr * Math.sin(a);
                ctx.beginPath();
                ctx.arc(x, y, 5 * S, 0, 2 * Math.PI);
                ctx.fillStyle = 'rgba(125,185,255,0.16)';
                ctx.fill();
                ctx.beginPath();
                ctx.arc(x, y, 2.4 * S, 0, 2 * Math.PI);
                ctx.fillStyle = 'rgba(150,195,255,0.95)';
                ctx.fill();
            }
        }
    }

    // ---------- wiring ----------

    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    function resizeAll () {
        elViewer.resize();
        if (reduce) { elViewer.still(); drawBohr(1.2); }
    }

    buildTable();
    select(6, false);
    resizeAll();

    if (reduce) {
        elViewer.still();
        drawBohr(1.2);
    } else {
        const t0 = performance.now() / 1000;
        requestAnimationFrame(function tick (nowMs) {
            requestAnimationFrame(tick);
            const now = nowMs / 1000 - t0;
            elViewer.frame(now);
            drawBohr(now);
        });
    }

    window.addEventListener('resize', resizeAll);
    $('prevEl').addEventListener('click', () => select(currentZ - 1, false));
    $('nextEl').addEventListener('click', () => select(currentZ + 1, false));

    // ---------- drawing mode: solid / glow / dots + the glow's dials ----------
    const HOW = {
        solid: 'solid = the surface where the wave is strong · colour = its sign',
        glow: 'glow = |ψ|² added up along each ray · the dials harden and light it',
        dots: 'each dot = one likely place to find the electron · colour = its sign',
    };
    const lookEl = $('elLook');
    function showLook (m) {
        lookEl.style.display = m === 'dots' ? 'none' : 'flex';
        lookEl.querySelectorAll('.glowonly').forEach((x) => {
            x.style.display = m === 'glow' ? '' : 'none';
        });
    }
    $('elModes').querySelectorAll('.chip').forEach((c) => {
        c.addEventListener('click', () => {
            $('elModes').querySelectorAll('.chip').forEach((x) => x.classList.remove('on'));
            c.classList.add('on');
            elViewer.setMode(c.dataset.mode);
            $('elHow').textContent = HOW[c.dataset.mode];
            showLook(c.dataset.mode);
        });
    });
    const dial = (id, key) => $(id).addEventListener('input', (e) => {
        look[key] = +e.target.value / 100;
        elViewer.still();
    });
    dial('slLevel', 'level');
    dial('slBody', 'body');
    dial('slLight', 'light');
    $('lookPure').addEventListener('click', () => {
        look.body = 0; look.light = 0;
        $('slBody').value = 0; $('slLight').value = 0;
        elViewer.still();
    });
    showLook('solid');
})();
