/* ==========================================================================
   Snackbite — a 2D Snake game built with KAPLAY.

   Plain HTML/CSS/JS, no build tools. Works fully offline.

   Sections:
     1. Setup & constants
     2. Game state
     3. Snack types & spawning
     4. Input handling (desktop keyboard + mobile touch)
     5. Game loop (grid stepping, collisions, difficulty)
     6. Rendering
     7. Game over / restart
     8. Responsive sizing
   ========================================================================== */

"use strict";

/* ==========================================================================
   1. Setup & constants
   ========================================================================== */

// Logical board grid. Fixed resolution keeps gameplay identical everywhere;
// the CSS layer scales the square canvas to fit any viewport.
const COLS = 20;
const ROWS = 20;
const LOGICAL_CELL = 32;              // logical px per grid cell
const BOARD_W = COLS * LOGICAL_CELL;  // 640
const BOARD_H = ROWS * LOGICAL_CELL;  // 640

const BASE_INTERVAL = 0.18;           // seconds per move at the start
const MIN_INTERVAL = 0.07;            // speed cap so it stays playable
const SPEED_STEP_POINTS = 40;         // difficulty bumps every N points
const SPEED_STEP_FACTOR = 0.9;        // interval is multiplied by this per bump

const BONUS_LIFETIME = 6;             // seconds a bonus snack stays on the board
const SWIPE_THRESHOLD = 20;           // px of travel before a swipe counts
const MAX_DIR_QUEUE = 3;              // buffered direction changes
const HIGHSCORE_KEY = "snackbite.highscore";

// Init KAPLAY with a fixed logical resolution. `pixelDensity` gives crisp
// rendering on high-DPI screens; `global:false` keeps its API on `k`.
const k = kaplay({
    width: BOARD_W,
    height: BOARD_H,
    scale: 1,
    pixelDensity: Math.min(window.devicePixelRatio || 1, 3),
    background: [13, 17, 23, 255],
    canvas: document.getElementById("game"),
    debug: false,
    global: false,
});

const canvas = k.canvas;
const boardWrap = document.getElementById("board-wrap");

/* ==========================================================================
   2. Game state
   ========================================================================== */

const state = {
    snake: [],        // [{x, y}], index 0 is the head
    dir: { x: 1, y: 0 },
    dirQueue: [],     // buffered turns, applied one per move
    score: 0,
    highScore: loadHighScore(),
    snack: null,      // { type, x, y, spawnTime }
    effect: null,     // { type, mult, until } from ⚡/🐌 | null
    moveAccum: 0,     // time bank for grid stepping
    status: "playing",// "playing" | "over"
};

// True when the device supports touch (used for the restart hint text).
const isTouchDevice =
    ("ontouchstart" in window) || (navigator.maxTouchPoints ?? 0) > 0;

/* ==========================================================================
   3. Snack types & spawning
   ========================================================================== */

// One snack on the board at a time. `weight` drives how often each type
// spawns (apple ≫ cherry ≫ star); `expires` makes a snack vanish if ignored;
// `effect` turns a snack into a temporary status modifier (0 points).
const SNACK_TYPES = [
    { id: "apple",  emoji: "🍎", color: [255, 90, 100], weight: 62, points: 10, effect: null },
    { id: "cherry", emoji: "🍒", color: [255, 90, 200], weight: 20, points: 25, effect: null },
    { id: "star",   emoji: "⭐", color: [255, 205, 90],  weight: 7,  points: 50, effect: null, expires: BONUS_LIFETIME },
    { id: "bolt",   emoji: "⚡", color: [255, 220, 80],  weight: 9,  points: 0,  effect: { type: "boost", mult: 0.62, dur: 6 } },
    { id: "snail",  emoji: "🐌", color: [160, 230, 130], weight: 6,  points: 0,  effect: { type: "slow",  mult: 1.45, dur: 6 } },
];

// Weighted random pick so common snacks appear much more often.
function pickSnackType() {
    const total = SNACK_TYPES.reduce((sum, t) => sum + t.weight, 0);
    let roll = Math.random() * total;
    for (const t of SNACK_TYPES) {
        roll -= t.weight;
        if (roll < 0) return t;
    }
    return SNACK_TYPES[0];
}

// Spawn the next snack on a free cell (never on the snake's body).
function isOccupied(x, y, segments) {
    return segments.some((s) => s.x === x && s.y === y);
}

function spawnSnack() {
    const free = [];
    for (let y = 0; y < ROWS; y++) {
        for (let x = 0; x < COLS; x++) {
            if (!isOccupied(x, y, state.snake)) free.push({ x, y });
        }
    }
    const pos = free.length
        ? free[Math.floor(Math.random() * free.length)]
        : { x: 0, y: 0 }; // board full: unreachable in practice
    state.snack = { type: pickSnackType(), x: pos.x, y: pos.y, spawnTime: k.time };
}

/* ==========================================================================
   4. Input handling
   ========================================================================== */

// Shared direction change. Both keyboard and swipe go through this so the
// "can't reverse into yourself" rule is identical for every input method.
// A requested direction is ignored if it is the opposite of the last queued
// (or current) direction, and duplicates are discarded.
function queueDirection(nx, ny) {
    if (state.status !== "playing") return;
    const last = state.dirQueue.length
        ? state.dirQueue[state.dirQueue.length - 1]
        : state.dir;
    if (nx === -last.x && ny === -last.y) return; // direct reverse
    if (nx === last.x && ny === last.y) return;   // same direction
    if (state.dirQueue.length >= MAX_DIR_QUEUE) return;
    state.dirQueue.push({ x: nx, y: ny });
}

// --- Desktop: Arrow keys + WASD ---
// Bound natively (not via KAPLAY's onKeyPress) so a press registers the moment
// the key goes down, instead of being deferred to the next frame's input tick
// and skipped on auto-repeat — same fix as the restart key. Holding a key is
// safe: queueDirection discards duplicate and reverse directions.
const KEY_DIRS = {
    arrowup: [0, -1], w: [0, -1],
    arrowdown: [0, 1], s: [0, 1],
    arrowleft: [-1, 0], a: [-1, 0],
    arrowright: [1, 0], d: [1, 0],
};

document.addEventListener("keydown", (e) => {
    const dir = KEY_DIRS[e.key.toLowerCase()];
    if (!dir) return;
    if (e.key.startsWith("Arrow")) e.preventDefault(); // keep arrows from scrolling
    queueDirection(dir[0], dir[1]);
});

// Restart keys (desktop). Bound directly to the DOM instead of KAPLAY's
// onKeyPress, which defers every press to the next frame's input tick and
// skips auto-repeat (f.repeat) events. A native keydown is handled the moment
// the key goes down, and repeat presses are accepted, so a restart press is
// never lost to frame timing or a held key.
document.addEventListener("keydown", (e) => {
    if (state.status !== "over") return;
    const key = e.key.toLowerCase();
    if (key === "r" || key === "enter" || key === " ") restart();
});

// --- Mobile / tablet: swipe on the game canvas ---
// Plain native touch events; no library. touchstart/touchend delta decides
// the dominant axis. A short movement (below the threshold) is a "tap".
let touchStart = null;

function onTouchStart(e) {
    e.preventDefault();
    const t = e.changedTouches[0];
    touchStart = { x: t.clientX, y: t.clientY, at: performance.now() };
}

function onTouchMove(e) {
    e.preventDefault(); // keep swipes from scrolling / refreshing the page
}

function onTouchEnd(e) {
    e.preventDefault();
    if (!touchStart) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - touchStart.x;
    const dy = t.clientY - touchStart.y;
    const dt = performance.now() - touchStart.at;
    touchStart = null;

    // Tap = restart (shown on the game-over screen).
    if (Math.abs(dx) < SWIPE_THRESHOLD && Math.abs(dy) < SWIPE_THRESHOLD) {
        if (state.status === "over") restart();
        return;
    }

    if (state.status !== "playing") return;
    if (Math.abs(dx) > Math.abs(dy)) {
        queueDirection(dx > 0 ? 1 : -1, 0);
    } else {
        queueDirection(0, dy > 0 ? 1 : -1);
    }
}

boardWrap.addEventListener("touchstart", onTouchStart, { passive: false });
boardWrap.addEventListener("touchmove", onTouchMove, { passive: false });
boardWrap.addEventListener("touchend", onTouchEnd, { passive: false });

// Mouse/desktop tap also restarts (harmless bonus for trackpad users).
k.onClick(() => { if (state.status === "over") restart(); });

// iOS pinch & long-press niceties.
document.addEventListener("gesturestart", (e) => e.preventDefault());
boardWrap.addEventListener("contextmenu", (e) => e.preventDefault());

// Don't let a long tab-switch trigger a burst of moves.
document.addEventListener("visibilitychange", () => { state.moveAccum = 0; });

/* ==========================================================================
   5. Game loop — grid stepping, collisions, difficulty
   ========================================================================== */

// Seconds per move right now: base, ramped down by score, then any ⚡/🐌 mult.
function currentInterval() {
    const levels = Math.floor(state.score / SPEED_STEP_POINTS);
    let interval = Math.max(MIN_INTERVAL, BASE_INTERVAL * Math.pow(SPEED_STEP_FACTOR, levels));
    if (state.effect) interval *= state.effect.mult;
    return interval;
}

// Advance the snake by exactly one cell.
function step() {
    if (state.dirQueue.length) state.dir = state.dirQueue.shift();

    const head = state.snake[0];
    const nx = head.x + state.dir.x;
    const ny = head.y + state.dir.y;

    // Wall collision → game over.
    if (nx < 0 || nx >= COLS || ny < 0 || ny >= ROWS) return gameOver();

    const ate = state.snack && state.snack.x === nx && state.snack.y === ny;

    // Self-collision. The tail cell vacates unless we are growing (ate).
    const body = ate ? state.snake : state.snake.slice(0, -1);
    if (isOccupied(nx, ny, body)) return gameOver();

    state.snake.unshift({ x: nx, y: ny });

    if (ate) {
        state.score += state.snack.type.points;
        applyEffect(state.snack.type.effect);
        updateHUD();
        spawnSnack();   // grow = don't pop the tail
    } else {
        state.snake.pop();
    }
}

// Apply a snack's temporary effect (⚡ speed boost / 🐌 slow-down).
function applyEffect(effect) {
    if (!effect) return;
    state.effect = { type: effect.type, mult: effect.mult, until: k.time + effect.dur };
}

k.onUpdate(() => {
    // Expire the ⚡/🐌 effect.
    if (state.effect && k.time >= state.effect.until) {
        state.effect = null;
        updateEffectHUD();
    }

    if (state.status !== "playing") return;

    // Bonus snacks vanish after their lifetime and are replaced.
    if (state.snack.type.expires && k.time - state.snack.spawnTime > state.snack.type.expires) {
        spawnSnack();
    }

    // Step at the current interval; clamp the bank so a hiccup (or tab
    // switch) can't chain several instant moves.
    const interval = currentInterval();
    state.moveAccum = Math.min(state.moveAccum + k.dt(), interval * 5);
    while (state.moveAccum >= interval) {
        state.moveAccum -= interval;
        step();
        if (state.status !== "playing") break;
    }

    if (state.effect) updateEffectHUD();
});

/* ==========================================================================
   6. Rendering
   ========================================================================== */

const C_BG       = k.rgb(17, 21, 28);
const C_GRID     = k.rgb(28, 34, 44);
const C_SNAKE    = k.rgb(96, 235, 150);
const C_SNAKE_DK = k.rgb(70, 200, 120);
const C_SNAKE_HD = k.rgb(150, 255, 190);
const C_EYE      = k.rgb(16, 20, 26);

k.onDraw(() => {
    drawBoard();
    if (state.snack) drawSnack();
    drawSnake();
});

function drawBoard() {
    k.drawRect({ pos: k.vec2(0, 0), width: BOARD_W, height: BOARD_H, color: C_BG });
    for (let i = 1; i < COLS; i++) {
        k.drawLine({
            p1: k.vec2(i * LOGICAL_CELL, 0),
            p2: k.vec2(i * LOGICAL_CELL, BOARD_H),
            width: 1,
            color: C_GRID,
        });
    }
    for (let i = 1; i < ROWS; i++) {
        k.drawLine({
            p1: k.vec2(0, i * LOGICAL_CELL),
            p2: k.vec2(BOARD_W, i * LOGICAL_CELL),
            width: 1,
            color: C_GRID,
        });
    }
}

function drawSnake() {
    const pad = 2.5;
    const size = LOGICAL_CELL - pad * 2;

    state.snake.forEach((seg, i) => {
        const color = i === 0 ? C_SNAKE_HD : (i % 2 === 0 ? C_SNAKE : C_SNAKE_DK);
        k.drawRect({
            pos: k.vec2(seg.x * LOGICAL_CELL + pad, seg.y * LOGICAL_CELL + pad),
            width: size,
            height: size,
            radius: 7,
            color,
        });
    });

    drawEyes();
}

// Two little eyes on the head, offset along the direction of travel.
function drawEyes() {
    const head = state.snake[0];
    const d = state.dir;
    const cx = head.x * LOGICAL_CELL + LOGICAL_CELL / 2;
    const cy = head.y * LOGICAL_CELL + LOGICAL_CELL / 2;
    const fwd = 5;                 // toward travel direction
    const side = 6;                // perpendicular
    const r = 3.2;
    for (const s of [-1, 1]) {
        k.drawCircle({
            pos: k.vec2(cx + d.x * fwd - d.y * side * s,
                        cy + d.y * fwd + d.x * side * s),
            radius: r,
            color: C_EYE,
        });
    }
}

function drawSnack() {
    const s = state.snack;
    const cx = s.x * LOGICAL_CELL + LOGICAL_CELL / 2;
    const cy = s.y * LOGICAL_CELL + LOGICAL_CELL / 2;
    const glow = k.rgb(s.type.color[0], s.type.color[1], s.type.color[2], 50);

    // Pulsing ring for expiring bonus snacks — reads as "hurry!".
    if (s.type.expires) {
        const pulse = 1 + 0.18 * Math.sin(k.time * 7);
        k.drawCircle({ pos: k.vec2(cx, cy), radius: LOGICAL_CELL / 2 * 0.9 * pulse, color: glow });
    }

    // Soft halo for effect snacks so they don't read as scoring food.
    if (s.type.effect) {
        k.drawCircle({ pos: k.vec2(cx, cy), radius: LOGICAL_CELL / 2 * 0.85, color: glow });
    }

    // Emoji rendered through the system font ("sans-serif" falls back to the
    // platform's emoji font, so color emoji render everywhere).
    k.drawText({
        text: s.type.emoji,
        pos: k.vec2(cx, cy),
        size: LOGICAL_CELL * 0.78,
        font: "sans-serif",
        anchor: "center",
    });
}

/* ==========================================================================
   7. Game over / restart
   ========================================================================== */

function gameOver() {
    state.status = "over";
    if (state.score > state.highScore) {
        state.highScore = state.score;
        saveHighScore(state.highScore);
    }
    updateHUD();

    document.getElementById("finalScore").textContent = `Score: ${state.score}`;
    document.getElementById("finalBest").textContent = `Best: ${state.highScore}`;
    document.getElementById("restartHint").textContent =
        isTouchDevice ? "Tap to restart" : "Press R to restart";
    document.getElementById("overlay").classList.remove("hidden");
}

function restart() {
    state.status = "playing";
    state.score = 0;
    state.effect = null;
    state.dir = { x: 1, y: 0 };
    state.dirQueue = [];
    state.moveAccum = 0;

    const cx = Math.floor(COLS / 2);
    const cy = Math.floor(ROWS / 2);
    state.snake = [
        { x: cx, y: cy },
        { x: cx - 1, y: cy },
        { x: cx - 2, y: cy },
    ];

    document.getElementById("overlay").classList.add("hidden");
    spawnSnack();
    updateHUD();
    updateEffectHUD();
}

// --- HUD helpers ---
const elScore = document.getElementById("score");
const elHigh = document.getElementById("highScore");
const elEffect = document.getElementById("effectHud");
const EFFECT_LABELS = { boost: "⚡ SPEED", slow: "🐌 SLOW" };

function updateHUD() {
    elScore.textContent = state.score;
    elHigh.textContent = state.highScore;
}

function updateEffectHUD() {
    const e = state.effect;
    if (e) {
        const left = Math.max(0, e.until - k.time);
        elEffect.textContent = `${EFFECT_LABELS[e.type]} ${left.toFixed(1)}s`;
        elEffect.classList.add("active");
    } else {
        elEffect.textContent = "";
        elEffect.classList.remove("active");
    }
}

// --- High score persistence ---
function loadHighScore() {
    try {
        return parseInt(localStorage.getItem(HIGHSCORE_KEY) || "0", 10) || 0;
    } catch {
        return 0; // storage blocked (private mode etc.)
    }
}

function saveHighScore(value) {
    try {
        localStorage.setItem(HIGHSCORE_KEY, String(value));
    } catch {
        // non-fatal
    }
}

/* ==========================================================================
   8. Responsive sizing
   ========================================================================== */

// The canvas keeps its fixed logical resolution; only its CSS size changes.
// Cell/pixel aspect ratio is preserved (square board), capped at the logical
// size so the board never upscales beyond 100% on huge monitors.
function fitBoard() {
    const app = document.getElementById("app");
    const hud = document.getElementById("hud").getBoundingClientRect();
    const legend = document.getElementById("legend").getBoundingClientRect();
    // #app's flex `gap` puts a spacing above and below the board; the size
    // must account for both or the board ends up too tall and the flex
    // column squashes the HUD into the board.
    const gap = parseFloat(getComputedStyle(app).gap) || 0;
    const margin = 14;
    const availW = window.innerWidth - margin * 2;
    const availH = window.innerHeight - margin * 2 - hud.height - legend.height - gap * 2;
    const size = Math.max(160, Math.min(BOARD_W, Math.floor(Math.min(availW, availH))));

    canvas.style.width = size + "px";
    canvas.style.height = size + "px";
    boardWrap.style.width = size + "px";
    boardWrap.style.height = size + "px";
}

window.addEventListener("resize", fitBoard);
window.addEventListener("orientationchange", fitBoard);

/* ==========================================================================
   Boot
   ========================================================================== */

restart();
fitBoard();
// Re-measure after fonts (emoji in the legend) settle, in case they change height.
if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(fitBoard);
}
