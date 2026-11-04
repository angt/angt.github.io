'use strict';
// Orbital clouds: true |psi|^2 electron-density point clouds, rendered
// through a per-pixel z-buffer.
//
// psi(n,l,m) = R_nl(r) * Y_lm(theta,phi), and |psi|^2 dV factorizes in
// spherical coordinates into three one-dimensional marginals:
//     r          ~ r^2 R_nl(r)^2
//     cos(theta) ~ P_l^|m|(x)^2
//     phi        ~ cos^2(m phi) or sin^2(m phi) (uniform when m = 0)
// so every point is drawn by inverse-CDF sampling of each marginal —
// the product is exactly the quantum density |psi|^2, nodes and all.
// Each point keeps fixed random quantiles, so two states stay in
// correspondence and morph smoothly into one another.
(function (root) {
    const NPTS = 20000;

    // ---- special functions ----

    // Associated Legendre P_l^m, Condon-Shortley phase.
    function plm (l, m, x) {
        let p = 1;
        if (m > 0) {
            const s = Math.sqrt(Math.max(0, 1 - x * x));
            let f = 1;
            for (let i = 0; i < m; i++) { p *= -f * s; f += 2; }
        }
        if (l === m) return p;
        let q = x * (2 * m + 1) * p, t;
        for (let n = m + 2; n <= l; n++) {
            t = ((2 * n - 1) * x * q - (n + m - 1) * p) / (n - m);
            p = q; q = t;
        }
        return q;
    }

    // Real (tesseral) harmonic; m > 0 is the cos(m*phi) family.
    function ylm (l, m, x, phi) {
        const a = Math.abs(m);
        let d = 1;
        for (let k = l - a + 1; k <= l + a; k++) d *= k;
        let y = plm(l, a, x) * Math.sqrt((2 * l + 1) / (4 * Math.PI * d));
        if (m !== 0) y *= Math.SQRT2 * (m > 0 ? Math.cos(a * phi) : Math.sin(a * phi));
        return y;
    }

    // Associated Laguerre L_k^alpha by recurrence.
    function laguerre (k, alpha, x) {
        if (k === 0) return 1;
        let p = 1, q = 1 + alpha - x, t;
        for (let i = 1; i < k; i++) {
            t = ((2 * i + 1 + alpha - x) * q - (i + alpha) * p) / (i + 1);
            p = q; q = t;
        }
        return q;
    }

    // Hydrogenic R_nl in Bohr units (Z = 1). Unnormalized: only the sign
    // and relative shape matter here.
    function radialR (n, l, r) {
        const rho = 2 * r / n;
        return Math.pow(rho, l) * Math.exp(-rho / 2) * laguerre(n - l - 1, 2 * l + 1, rho);
    }

    // ---- 1D densities -> cumulative tables -> inverse sampling ----

    function makeCdf (xs, ws) {
        const cdf = new Float64Array(xs.length);
        let acc = 0;
        for (let i = 1; i < xs.length; i++) {
            acc += 0.5 * (ws[i] + ws[i - 1]) * (xs[i] - xs[i - 1]);
            cdf[i] = acc;
        }
        const tot = cdf[cdf.length - 1] || 1;
        for (let i = 0; i < cdf.length; i++) cdf[i] /= tot;
        return cdf;
    }

    function invCdf (xs, cdf, q) {
        let lo = 0, hi = cdf.length - 1;
        while (lo < hi) {
            const mid = (lo + hi) >> 1;
            if (cdf[mid] < q) lo = mid + 1; else hi = mid;
        }
        const i = Math.max(1, lo);
        const c0 = cdf[i - 1], c1 = cdf[i];
        const t = c1 === c0 ? 0 : (q - c0) / (c1 - c0);
        return xs[i - 1] + t * (xs[i] - xs[i - 1]);
    }

    function radialCdf (n, l) {
        const ng = 800, rmax = 2.4 * n * n + 3 * l + 14;
        const xs = new Float64Array(ng), ws = new Float64Array(ng);
        for (let i = 0; i < ng; i++) {
            xs[i] = rmax * i / (ng - 1);
            const v = xs[i] * radialR(n, l, xs[i]);
            ws[i] = v * v;
        }
        return { xs, cdf: makeCdf(xs, ws) };
    }

    function angCdf (l, m) {
        const ng = 512, a = Math.abs(m);
        const xs = new Float64Array(ng), ws = new Float64Array(ng);
        for (let i = 0; i < ng; i++) {
            xs[i] = -1 + 2 * i / (ng - 1);
            const v = plm(l, a, xs[i]);
            ws[i] = v * v;
        }
        return { xs, cdf: makeCdf(xs, ws) };
    }

    function phiCdf (m) {
        const ng = 512, a = Math.abs(m);
        const xs = new Float64Array(ng), ws = new Float64Array(ng);
        for (let i = 0; i < ng; i++) {
            xs[i] = 2 * Math.PI * i / (ng - 1);
            ws[i] = a === 0 ? 1 : Math.pow(m > 0 ? Math.cos(a * xs[i]) : Math.sin(a * xs[i]), 2);
        }
        return { xs, cdf: makeCdf(xs, ws) };
    }

    // ---- fixed per-point quantiles: stratified and shuffled once ----

    function lcg (seed) {
        let s = seed;
        return () => (s = (1103515245 * s + 12345) % 2147483648) / 2147483648;
    }

    const SR = new Float64Array(NPTS), SX = new Float64Array(NPTS), SP = new Float64Array(NPTS);
    (function () {
        const r1 = lcg(1), r2 = lcg(2);
        for (let i = 0; i < NPTS; i++) {
            SR[i] = (i + 0.5) / NPTS;
            SX[i] = (i + 0.5) / NPTS;
            SP[i] = ((i + 0.5) * 0.6180339887498949) % 1;
        }
        for (let i = NPTS - 1; i > 0; i--) {
            let j = Math.floor(r1() * (i + 1));
            let t = SR[i]; SR[i] = SR[j]; SR[j] = t;
            j = Math.floor(r2() * (i + 1));
            t = SX[i]; SX[i] = SX[j]; SX[j] = t;
        }
    })();

    // ---- cloud generation ----

    const cache = new Map();
    function makeCloud (n, l, m) {
        const key = n + ',' + l + ',' + m;
        const hit = cache.get(key);
        if (hit) return hit;

        const R = radialCdf(n, l), A = angCdf(l, m), P = phiCdf(m);
        const pos = new Float32Array(NPTS * 3), val = new Float32Array(NPTS);
        let vmax = 0;
        for (let i = 0; i < NPTS; i++) {
            const r = invCdf(R.xs, R.cdf, SR[i]);
            const x = invCdf(A.xs, A.cdf, SX[i]);
            const p = invCdf(P.xs, P.cdf, SP[i]);
            const s = Math.sqrt(Math.max(0, 1 - x * x));
            const v = radialR(n, l, r) * ylm(l, m, x, p);
            val[i] = v;
            const av = v < 0 ? -v : v;
            if (av > vmax) vmax = av;
            pos[i * 3] = r * s * Math.cos(p);
            pos[i * 3 + 1] = r * s * Math.sin(p);
            pos[i * 3 + 2] = r * x;
        }
        // Scale so 90% of the probability sits inside the unit sphere —
        // every orbital fills the frame the same, nodes stay visible.
        const q90 = invCdf(R.xs, R.cdf, 0.9), sc = 1 / q90;
        for (let i = 0; i < NPTS * 3; i++) pos[i] *= sc;
        for (let i = 0; i < NPTS; i++) val[i] /= vmax;
        const cloud = { pos, val, rmax: 0 };
        for (let i = 0; i < NPTS; i++) {
            const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
            const d = Math.sqrt(x * x + y * y + z * z);
            if (d > cloud.rmax) cloud.rmax = d;
        }
        cache.set(key, cloud);
        return cloud;
    }

    // ---- camera rotation: plain SO(3) matrices, composed ----
    //
    // An orientation is a row-major 3x3 rotation matrix (world = R·p; the
    // camera looks along -Y, so world X is screen-right and Z screen-up),
    // and every new one is just a product of rotation matrices: the
    // auto-tumble is Rx(tilt)·Ry(yaw)·Rz(spin), and app.js multiplies its
    // cursor-orbit steps in on the left (world frame) so dragging keeps
    // orbiting around the atom whatever its orientation. It is a rotation,
    // so its transpose is its inverse — the volume shader uploads it as-is
    // and gets world -> orbital for free.

    function rotX (t) {
        const s = Math.sin(t), c = Math.cos(t);
        return [1, 0, 0, 0, c, -s, 0, s, c];
    }
    function rotY (t) {
        const s = Math.sin(t), c = Math.cos(t);
        return [c, 0, s, 0, 1, 0, -s, 0, c];
    }
    function rotZ (t) {
        const s = Math.sin(t), c = Math.cos(t);
        return [c, -s, 0, s, c, 0, 0, 0, 1];
    }
    // Row-major product A·B.
    function matMul (A, B) {
        return [
            A[0] * B[0] + A[1] * B[3] + A[2] * B[6],
            A[0] * B[1] + A[1] * B[4] + A[2] * B[7],
            A[0] * B[2] + A[1] * B[5] + A[2] * B[8],
            A[3] * B[0] + A[4] * B[3] + A[5] * B[6],
            A[3] * B[1] + A[4] * B[4] + A[5] * B[7],
            A[3] * B[2] + A[4] * B[5] + A[5] * B[8],
            A[6] * B[0] + A[7] * B[3] + A[8] * B[6],
            A[6] * B[1] + A[7] * B[4] + A[8] * B[7],
            A[6] * B[2] + A[7] * B[5] + A[8] * B[8],
        ];
    }

    function makeRotation (T, user) {
        const spin = 0.23 * T, tilt = 0.52 + 0.24 * Math.sin(0.13 * T), yaw = 0.36 * Math.sin(0.071 * T);
        const tumble = matMul(rotX(tilt), matMul(rotY(yaw), rotZ(spin)));
        return user ? matMul(user, tumble) : tumble;
    }

    // ---- renderer: soft discs through a real z-buffer ----
    //
    // Depth, premultiplied colour and coverage per pixel. Nearer fragments
    // composite over what is there, farther ones only through the coverage
    // left — occlusion is exact and never depends on draw order.

    const POS = [125, 185, 255], NEG = [255, 120, 170];
    const FOG0 = 0.14, CORE = 0.35, SIZE = 0.9, D = 3.4;

    function createRenderer (canvas) {
        const ctx = canvas.getContext('2d');
        let W = 0, H = 0, Wp = 0, Hp = 0, P = 0, FS = 1, DPR = 1;
        let img = null, zbuf = null, cr = null, cg = null, cb = null, ca = null;
        const qx = new Float32Array(NPTS), qy = new Float32Array(NPTS), qz = new Float32Array(NPTS);
        const qrad = new Float32Array(NPTS);
        const qr = new Float32Array(NPTS), qg = new Float32Array(NPTS), qb = new Float32Array(NPTS), qw = new Float32Array(NPTS);

        function resize () {
            // The screen's real pixel ratio, capped only for fill rate.
            DPR = Math.min(2, window.devicePixelRatio || 1);
            W = canvas.clientWidth; H = canvas.clientHeight;
            if (!W || !H) return;
            const wp = Math.round(W * DPR), hp = Math.round(H * DPR);
            if (wp === Wp && hp === Hp) return;
            Wp = wp; Hp = hp;
            canvas.width = Wp; canvas.height = Hp;
            P = Wp * Hp;
            img = ctx.createImageData(Wp, Hp);
            zbuf = new Float32Array(P);
            cr = new Float32Array(P); cg = new Float32Array(P);
            cb = new Float32Array(P); ca = new Float32Array(P);
            // Focal scale straight from the buffer size (device px), so
            // the framing can never drift out of sync with the pixel ratio.
            FS = 0.32 * Math.min(Wp, Hp);
        }

        function draw (a, b, e, rot) {
            if (!img) return;
            // rot is the camera rotation (see makeRotation), row-major.
            const m0 = rot[0], m1 = rot[1], m2 = rot[2];
            const m3 = rot[3], m4 = rot[4], m5 = rot[5];
            const m6 = rot[6], m7 = rot[7], m8 = rot[8];

            // Project: positions morph between the two clouds, the phase
            // sign comes from the interpolated psi. Radius follows the
            // same perspective factor as the position. FS is in device
            // pixels straight from the buffer, so the framing is exact
            // whatever the devicePixelRatio.
            const rad = Math.max(a.rmax, b.rmax);
            const ap = a.pos, bp = b.pos, av = a.val, bv = b.val;
            for (let i = 0; i < NPTS; i++) {
                const i3 = i * 3;
                const x = ap[i3] + (bp[i3] - ap[i3]) * e;
                const y = ap[i3 + 1] + (bp[i3 + 1] - ap[i3 + 1]) * e;
                const z = ap[i3 + 2] + (bp[i3 + 2] - ap[i3 + 2]) * e;
                const X = m0 * x + m1 * y + m2 * z;
                const Y = m3 * x + m4 * y + m5 * z;
                const Z = m6 * x + m7 * y + m8 * z;
                const k = D / (D - Y);
                qx[i] = Wp * 0.5 + k * X * FS;
                qy[i] = Hp * 0.5 - k * Z * FS;
                qz[i] = Y;
                qrad[i] = SIZE * k * DPR;
                // Fog: depth fades the far side toward black; hue carries
                // the sign of the wavefunction.
                const d = (Y + rad) / (2 * rad);
                const f = FOG0 + (1 - FOG0) * d * d;
                const v = av[i] + (bv[i] - av[i]) * e;
                const col = v > 0 ? POS : NEG;
                qr[i] = col[0] * f; qg[i] = col[1] * f; qb[i] = col[2] * f;
                qw[i] = 255 * f;
            }

            zbuf.fill(-1e30);
            cr.fill(0); cg.fill(0); cb.fill(0); ca.fill(0);
            const w1 = Wp - 1, h1 = Hp - 1;
            for (let i = 0; i < NPTS; i++) {
                const r = qrad[i];
                const cx = qx[i], cy = qy[i], z = qz[i];
                let x0 = Math.ceil(cx - r - 0.5), x1 = Math.floor(cx + r + 0.5);
                let y0 = Math.ceil(cy - r - 0.5), y1 = Math.floor(cy + r + 0.5);
                if (x0 < 0) x0 = 0; if (y0 < 0) y0 = 0;
                if (x1 > w1) x1 = w1; if (y1 > h1) y1 = h1;
                if (x1 < x0 || y1 < y0) continue;
                const er = qr[i], eg = qg[i], eb = qb[i], wc = qw[i];
                for (let py = y0; py <= y1; py++) {
                    const dy = py + 0.5 - cy;
                    const row = py * Wp;
                    for (let pxx = x0; pxx <= x1; pxx++) {
                        const dx = pxx + 0.5 - cx;
                        const dist = Math.sqrt(dx * dx + dy * dy);
                        let cov = r + 0.5 - dist;
                        if (cov <= 0) continue;
                        if (cov > 1) cov = 1;
                        cov = cov * cov * (3 - 2 * cov); // smoothstep edge
                        const idx = row + pxx;
                        const t = dist < r ? CORE * (1 - dist / r) : 0;
                        const rr = er + (wc - er) * t, gg = eg + (wc - eg) * t, bb = eb + (wc - eb) * t;
                        if (z >= zbuf[idx]) {
                            zbuf[idx] = z;
                            const inv = 1 - cov;
                            cr[idx] = rr * cov + cr[idx] * inv;
                            cg[idx] = gg * cov + cg[idx] * inv;
                            cb[idx] = bb * cov + cb[idx] * inv;
                            ca[idx] = cov + ca[idx] * inv;
                        } else {
                            const w = cov * (1 - ca[idx]);
                            if (w <= 0) continue;
                            cr[idx] += rr * w; cg[idx] += gg * w; cb[idx] += bb * w;
                            ca[idx] += w;
                        }
                    }
                }
            }

            // Unpremultiply into the ImageData and hand the frame over.
            const out = img.data;
            for (let i = 0, j = 0; i < P; i++, j += 4) {
                const a2 = ca[i];
                if (a2 > 0.0039) {
                    const inv = 1 / a2;
                    out[j] = cr[i] * inv; out[j + 1] = cg[i] * inv; out[j + 2] = cb[i] * inv;
                    out[j + 3] = a2 * 255;
                } else {
                    out[j] = 0; out[j + 1] = 0; out[j + 2] = 0; out[j + 3] = 0;
                }
            }
            ctx.putImageData(img, 0, 0);
        }

        return { resize, draw };
    }

    root.Orbital = { makeCloud, createRenderer, makeRotation, matMul, rotX, rotZ, ylm, radialR };
})(typeof window !== 'undefined' ? window : this);
