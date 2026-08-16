# Snackbite

An offline 2D snake game built with **[KAPLAY](https://kaplayjs.com/)** — a lightweight JavaScript game library. Runs directly from `index.html`, no build step, no server required.

## 🕹️ How to Play

- **Desktop:** Arrow keys / **W A S D** to move; **R / Enter / Space** to restart after game over; tap the canvas to restart too.
- **Touch:** Swipe on the game canvas or use the on-screen **D-pad** to change direction; a short swipe (or tap) is a tap-to-restart on game over.

## 🎯 Objective

Guide the snake to eat snacks and grow without hitting the walls or your own tail. Clear snacks for points and activate temporary effects:

| Snack | Points | Effect |
|------|--------|--------|
| 🍎 Apple | 10 | None |
| 🍒 Cherry | 25 | None |
| ⭐ Star | 50 | Expires after 6s |
| ⚡ Bolt | 0 | **+62% speed** for 6s |
| 🐌 Snail | 0 | **+45% slow** for 6s |

- Score increases when you eat a snack.
- Best score is saved in `localStorage` (`snackbite.highscore`).
- Game speed increases every 40 points (`interval` multiplied by `0.9`).
- Minimum interval: `0.07s` (max speed).

## 📐 Game Design

- **20 × 20 grid** (logical resolution 640×640), scaled via CSS to fit any viewport.
- Fixed `LOGICAL_CELL = 32px` keeps gameplay identical on all screens.
- Canvas capped at 640px wide, minimum 160px.
- Responsive layout for desktop, phone, tablet portrait/landscape, and short landscape.

## 🛠️ Tech Stack

- **KAPLAY v3001** — fixed logical resolution + CSS scaling; no `resize()` needed.
- **HTML/CSS/JS only** — no build tools, no bundler, works fully offline.
- Google Fonts: **Orbitron** + **Press Start 2P** (loaded from `https://fonts.googleapis.com`).
- Retro arcade theme: CRT scanlines, vignette, marquee title, hot-pink/magenta/cyan accents, bezel‑style board frame.

## 📂 Project Structure

```
Snackbite/
├── index.html       — HTML, CSS (retro arcade theme), and inline <script> tags
├── game.js          — Game logic, input, rendering, high‑score persistence
├── kaplay.js       — KAPLAY v3001 library (vendored)
├── logo.png        — 784×1168 dark logo (used as favicon; on-page logo removed)
└── bgsong.mp3      — optional looping background track (drop it next to index.html)
```

## 🚀 Running

No installation needed. Either:

1. **Double‑click** `index.html` to open in your default browser (works offline).
2. Or start a local server for CDP/test harnesses:

```bash
python -m http.server 8901 --bind 127.0.0.1
# then open http://127.0.0.1:8901/index.html
```

## 📷 Screenshot

![Snackbite gameplay](live.png)

## 🛡️ Browser Support

Works in Chrome, Edge, Firefox, and Safari. Touch‑friendly on mobile & tablet. No zoom or scrolling (viewport is locked).

## 🎮 Controls Summary

| Action | Keyboard | Touch |
|--------|----------|-------|
| Move up / left / down / right | ⬅️ ⬆️ ⬇️ ➡️  / W A S D | Swipe on canvas or on-screen D-pad |
| Restart (game over) | R / Enter / Space | Tap on canvas |
| Sound on / off | — | 🔊 / 🔇 corner button |

## 🔊 Sound

- **Background music:** plays a looping `bgsong.mp3` (drop your own file next to `index.html`; the game stays silent if it's missing).
- **Effects:** a two-note "munch" plays when the snake eats (a higher chime for bonus snacks), synthesized with the Web Audio API.
- Music and effects start on the first **PLAY** press (browsers require a user gesture) and are muted with the 🔊 corner button; the mute choice persists in `localStorage`.

## 📝 Notes

- The on‑page logo was removed per user request; the `logo.png` file remains as the **favicon** (tab icon only).
- The game theme was restyled into a full **retro arcade** look: CRT scanlines, vignette, marquee title, cabinet bulges, and a bezel‑style board frame.
- Sound is fully optional: eat effects are generated in‑browser, and the background track only plays if `bgsong.mp3` is present.
- High score persists across sessions via `localStorage`.

---
Made with ❤️ using KAPLAY. Playable in a single HTML file, no installation required.