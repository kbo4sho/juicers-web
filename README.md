# Juicers

Juicers is a camera-powered fruit-catching game. Your current fruit order floats
above your head; pinch the matching falling fruit to collect it and build a
combo before the round ends.

The prototype processes camera frames locally in the browser. It does not upload,
record, or store video. Pointer, click, arrow-key, and Space-bar controls provide
a complete fallback when camera or hand tracking is unavailable.

## Development

```bash
npm install
npm run dev
```

Run the complete verification suite with `npm test` and lint with `npm run lint`.
