'use strict';

function Camera() {
    return {
        x: 0,
        y: 0,
        targetX: 0,
        targetY: 0,
        smoothing: 0.05,
        viewHeight: 0,
        viewWidth: 0,
        pixelWidth: 0,
        pixelHeight: 0,
        maxRadius: Infinity,

        setViewHeight(height) {
            this.viewHeight = height;
            if (this.pixelHeight > 0) {
                this.viewWidth = this.viewHeight * (this.pixelWidth / this.pixelHeight);
            }
        },

        setSize(pixelWidth, pixelHeight) {
            this.pixelWidth = pixelWidth;
            this.pixelHeight = pixelHeight;
            if (this.viewHeight > 0) {
                this.viewWidth = this.viewHeight * (pixelWidth / pixelHeight);
            }
            this.constrain();
        },

        setMaxRadius(radius) {
            this.maxRadius = radius;
            this.constrain();
        },

        update(dt) {
            if (dt <= 0) return;
            const factor = 1 - Math.pow(1 - this.smoothing, dt);
            this.x += (this.targetX - this.x) * factor;
            this.y += (this.targetY - this.y) * factor;
        },

        pan(dx, dy) {
            if (this.pixelHeight <= 0) return;
            const scale = this.viewHeight / this.pixelHeight;
            this.targetX += dx * scale;
            this.targetY += dy * scale;
            this.constrain();
        },

        constrain() {
            if (this.pixelHeight <= 0 || this.maxRadius <= 0) return;

            const cornerDistance = Math.hypot(this.viewWidth / 2, this.viewHeight / 2);
            const maxCameraDistance = Math.max(0, this.maxRadius - cornerDistance);
            const distFromCenter = Math.hypot(this.targetX, this.targetY);

            if (distFromCenter > maxCameraDistance && distFromCenter > 0) {
                const scale = maxCameraDistance / distFromCenter;
                this.targetX *= scale;
                this.targetY *= scale;
            }
        },

        screenToWorld(screenX, screenY) {
            const scale = this.viewHeight / this.pixelHeight;
            return {
                x: screenX * scale + this.x - this.viewWidth / 2,
                y: screenY * scale + this.y - this.viewHeight / 2
            };
        }
    };
}

function createInputHandler(camera, canvas) {
    const state = {
        isPanning: false,
        panStartX: 0,
        panStartY: 0,
        lastCentroid: null,
        lastTouchCount: 0
    };

    function getCentroid(touchList) {
        if (touchList.length === 0) return null;
        let x = 0, y = 0;
        for (const t of touchList) {
            x += t.clientX;
            y += t.clientY;
        }
        return { x: x / touchList.length, y: y / touchList.length };
    }

    canvas.addEventListener('mousedown', (e) => {
        if (e.button !== 2) return;
        state.isPanning = true;
        state.panStartX = e.clientX;
        state.panStartY = e.clientY;
        e.preventDefault();
    });

    canvas.addEventListener('mousemove', (e) => {
        if (!state.isPanning) return;
        camera.pan(e.clientX - state.panStartX, e.clientY - state.panStartY);
        state.panStartX = e.clientX;
        state.panStartY = e.clientY;
    });

    const endPan = () => state.isPanning = false;
    canvas.addEventListener('mouseup', (e) => e.button === 2 && endPan());
    canvas.addEventListener('mouseleave', endPan);
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    canvas.addEventListener('wheel', (e) => {
        e.preventDefault();
        camera.pan(e.deltaX, e.deltaY);
    }, { passive: false });

    const resetTouch = () => { state.lastCentroid = null; state.lastTouchCount = 0; };

    canvas.addEventListener('touchstart', (e) => {
        if (e.touches.length >= 2) {
            state.lastCentroid = getCentroid(e.touches);
            state.lastTouchCount = e.touches.length;
        }
    });

    canvas.addEventListener('touchmove', (e) => {
        if (e.touches.length < 2 || !state.lastCentroid || state.lastTouchCount < 2) {
            state.lastTouchCount = e.touches.length;
            return;
        }
        const curr = getCentroid(e.touches);
        if (curr) {
            camera.pan(state.lastCentroid.x - curr.x, state.lastCentroid.y - curr.y);
            state.lastCentroid = curr;
        }
        e.preventDefault();
        state.lastTouchCount = e.touches.length;
    }, { passive: false });

    canvas.addEventListener('touchend', (e) => {
        e.touches.length < 2 ? resetTouch() : state.lastTouchCount = e.touches.length;
    });

    canvas.addEventListener('touchcancel', resetTouch);

    return state;
}
