# Juicers

Juicers is a polished, one-minute browser arcade game. Customer tickets arrive with colorful multi-fruit recipes; players tap a ticket to select its customer, overlap a fruit that customer still needs with either glove, and squeeze. The highlighted ticket is the only one that receives the pour — a matching fruit never silently dumps into another order. Finished drinks earn big bonuses, leave the rail with an “ORDER UP!” celebration, and make room for the next customer.

The game is staged as a neighborhood diner–juice bar, with a six-person cast of original cartoon regulars. Each regular orders differently: Maya wants bright two-fruit citrus, Theo sits with a small no-rush cup, Pip sings for three-fruit berry mixes, Mina stays tart, Zara asks for weird house experiments, and Dax always wants a four-fruit monster. Portraits, names, and short lines carry from the welcome screen through live order tickets and the results screen. The face-free fruit and finished-drink illustrations share the cast's inked cel-animation treatment. Optimized WebP assets live in `public/portraits/`, `public/fruits/`, and `public/drinks/`.

**Play:** https://kbo4sho.github.io/juicers-web/

Everything is a static client. There is no server, account, leaderboard, recording, or upload.

## Play

Use current desktop Chrome or Edge over `https://` (or `localhost`).

### Camera mode

1. Choose **Play with camera** and approve browser camera access.
2. Step back until both hands fit comfortably in frame.
3. The webcam feed stays hidden; the two cartoon gloves show exactly what the game detects.
4. Tap/click a customer ticket to select it. The highlighted ticket receives both hands’ pours; grabbing or moving your hands never switches it.
5. Overlap a falling fruit with either cartoon glove, then close and reopen your fist. The glove nametag flips from READY to POUR.
6. After you pick a shift, land one untimed practice squeeze before the countdown.

### Demo mode

Demo mode is the complete game without camera access. It uses the same ticket-selection rule, customer queue, scoring, difficulty ramp, powerups, results, and replay loop.

- Tap/click a ticket to select it (or Tab to its button and use Enter/Space). Swipe the ticket rail on phones to reach every customer.
- Mouse: move the right hand; click the playfield to squeeze.
- Arrow keys: move the right hand; `M` or `Space` to squeeze.
- `W A S D`: move the left hand; `Z` to squeeze.

A card hold, drag, or canceled touch does not select it. The first open ticket is selected at round start and after the selected order completes.

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

## Opt-in 3D fruit (second pass)

Run locally with `npm run dev`, open `http://localhost:5173/?fruit3d=1`, then choose
**Play demo mode → Endless Counter**. The practice orange and falling ingredients
are live 3D meshes. Camera mode uses the same flag. Remove `fruit3d=1` (or set it
to `0`) and reload to return to the illustrated playfield. This PR does not deploy
or change the live Pages site.

The complete shortlist covers the five existing ingredients: orange, lime,
raspberry-style berry, watermelon slice, and pineapple. UI recipe icons stay as
the familiar illustrations. All five original, texture-free GLBs total **613,336
bytes (599 KiB)**, with [provenance and MIT terms](public/fruits/3d/LICENSE.md).
Regenerate them with `npm run assets:fruits`.

A lazy-loaded Three.js renderer shares saturated flesh colors, cream glaze
reflections, mint edge lighting, and plum ink outlines across the set. Cut lime
segments, pillowy leaves, and rounded pineapple scales keep the set playful.
One fixed 640×640 WebGL atlas
renders up to 16 fruits, then composites into the existing playfield in item
order. It shares the game's animation loop, keeps hit radii,
respects reduced motion for mesh tumble and gentle squash, and disposes GPU resources on unmount.
Loading, failed assets, unavailable WebGL, context loss, and excess atlas capacity
use the existing illustrated fruit automatically.

For review, the dev-only page `/tests/fixtures/fruit-gallery.html` shows every mesh
at large and phone gameplay sizes. See [the review notes and stills](docs/fruit-meshes.md).
Browser regression checks: `npx playwright install chromium` then
`npm run test:browser`. With the dev server running, `node scripts/measure-fruits.mjs`
prints a repeatable renderer sanity measurement.
