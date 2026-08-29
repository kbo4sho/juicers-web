# Juicers

Juicers is a polished, one-minute browser arcade game. Customer tickets arrive with colorful multi-fruit recipes; players aim either glove at a specific ticket, overlap a fruit that customer still needs, and squeeze. The highlighted ticket is the only one that receives the pour — a matching fruit never silently dumps into another order. Finished drinks earn big bonuses, leave the rail with an “ORDER UP!” celebration, and make room for the next customer.

The game is staged as a neighborhood diner–juice bar, with a six-person cast of original cartoon regulars. Each regular orders differently: Maya wants bright two-fruit citrus, Theo sits with a small no-rush cup, Pip sings for three-fruit berry mixes, Mina stays tart, Zara asks for weird house experiments, and Dax always wants a four-fruit monster. Portraits, names, and short lines carry from the welcome screen through live order tickets and the results screen. The face-free fruit and finished-drink illustrations share the cast's inked cel-animation treatment. Optimized WebP assets live in `public/portraits/`, `public/fruits/`, and `public/drinks/`.

**Play:** https://kbo4sho.github.io/juicers-web/

Everything is a static client. There is no server, account, leaderboard, recording, or upload.

## Play

Use current desktop Chrome or Edge over `https://` (or `localhost`).

### Camera mode

1. Choose **Play with camera** and approve browser camera access.
2. Step back until both hands fit comfortably in frame.
3. The webcam feed stays hidden; the two cartoon gloves show exactly what the game detects.
4. Watch the customer tickets. The highlighted ticket is who you are aiming at.
5. Overlap a falling fruit with either cartoon glove, then close and reopen your fist. The glove nametag flips from READY to POUR.
6. After you pick a shift, land one untimed practice squeeze before the countdown.

### Demo mode

Demo mode is the complete game without camera access. It uses the same serve-aiming rule, customer queue, scoring, difficulty ramp, powerups, results, and replay loop.

- Mouse: move the right hand; click to squeeze.
- Arrow keys: move the right hand; `M` or `Space` to squeeze.
- `W A S D`: move the left hand; `Z` to squeeze.

The squeeze is edge-triggered: reopen before squeezing again. The playfield is keyboard-focusable and outcome text is announced through an ARIA live region. Reduced-motion preferences are honored by the interface.

## Privacy

- Camera frames go directly from `getUserMedia()` to MediaPipe’s in-browser hand landmark model.
- The live webcam image is never drawn into the game; only the resulting cartoon-hand positions are shown.
- The model and WebAssembly files live in `public/`; landmark inference is local to the device and capped at 24 Hz.
- The app never uses `MediaRecorder`, never sends frames over the network, and stores no video, images, scores, or identifiers.
- Demo mode does not request camera permission.

## Local setup

Requires Node.js 22 or newer.

```bash
npm install
npm run dev
```

Open the local URL printed by Vite. Production checks:

```bash
npm run check
```

Other scripts:

- `npm run build` — type-check and create the static site in `dist/`
- `npm run lint` — lint TypeScript and React code
- `npm test` — run deterministic scoring-contract tests
- `npm run preview` — serve the production build locally

## GitHub Pages

`vite.config.ts` uses relative asset URLs, so the same `dist/` build works locally, at a custom domain, and under a project path such as `/juicers-web/`. The Pages workflow builds and deploys `dist/` whenever `main` changes; no runtime environment variables or backend are required.

## Architecture

- `src/App.tsx` owns onboarding, camera permission and denial recovery, tutorial, customer ticket rail, HUD, results, and replay.
- `src/game/GameCanvas.tsx` owns the display-refresh render loop, deterministic customer queue and recipes, squeeze-to-order routing, scoring, difficulty ramp, fruit-sprite presentation, completion celebrations, particles, and powerups.
- `src/game/tracking.ts` initializes local MediaPipe two-hand tracking, smooths hand positions, and applies fist-close hysteresis.
- `src/game/audio.ts` synthesizes distinct Web Audio cues without loading audio files.
- `src/game/model.ts` contains the scoring, deterministic random, customer recipe, unique-drink, and squeeze-to-ticket aiming contracts.
- `public/portraits/` contains the optimized original customer portraits used by the interface.
- `public/fruits/` contains the optimized transparent fruit illustrations used by the interface and playfield.
- `public/drinks/` contains the ten optimized transparent finished-drink illustrations used by customer order cards.

The render loop and inference loop are separate. Landmark work is throttled, resize/input listeners are cleaned up, scored fruit is removed immediately, and expired effects are pruned every frame.

MediaPipe Tasks Vision and the included model files are provided by the MediaPipe project and run entirely in the browser.
