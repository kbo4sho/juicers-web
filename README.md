# Juicers

Juicers is a polished, one-minute browser arcade game. A fruit target floats above the player’s head; they move either hand over a falling fruit and close their fist to juice it. Correct fruit grows the combo and changes the target. Wrong fruit costs points and breaks the combo.

**Play:** https://kbo4sho.github.io/juicers-web/

Everything is a static client. There is no server, account, leaderboard, recording, or upload.

## Play

Use current desktop Chrome or Edge over `https://` (or `localhost`).

### Camera mode

1. Choose **Play with camera** and approve browser camera access.
2. Step back until your face and both hands fit in frame.
3. A strawberry mask replaces your head and scales with your detected face; match the fruit badge floating above it.
4. Overlap a falling fruit with either cartoon glove, then close and reopen your fist. The glove changes from an open palm to a popping fist.

### Demo mode

Demo mode is the complete game without camera access. It uses the same deterministic fruit sequence, scoring, difficulty ramp, powerups, results, and replay loop.

- Mouse: move the right hand; click to squeeze.
- Arrow keys: move the right hand; `M` or `Space` to squeeze.
- `W A S D`: move the left hand; `Z` to squeeze.

The squeeze is edge-triggered: reopen before squeezing again. The playfield is keyboard-focusable and outcome text is announced through an ARIA live region. Reduced-motion preferences are honored by the interface.

## Privacy

- Camera frames go directly from `getUserMedia()` to MediaPipe’s in-browser face and hand landmark models.
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

- `src/App.tsx` owns onboarding, camera permission and denial recovery, tutorial, countdown, HUD, results, and replay.
- `src/game/GameCanvas.tsx` owns the display-refresh render loop, deterministic round state, collision, scoring, difficulty ramp, fruit art, splatters, particles, and powerups.
- `src/game/tracking.ts` initializes local MediaPipe face and two-hand tracking, smooths the face position and scale used by the strawberry mask, and applies fist-close hysteresis.
- `src/game/audio.ts` synthesizes distinct Web Audio cues without loading audio files.
- `src/game/model.ts` contains the scoring and deterministic random contracts.

The render loop and inference loop are separate. Landmark work is throttled, resize/input listeners are cleaned up, scored fruit is removed immediately, and expired effects are pruned every frame.

MediaPipe Tasks Vision and the included model files are provided by the MediaPipe project and run entirely in the browser.
