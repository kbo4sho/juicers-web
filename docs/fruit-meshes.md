# Fruit meshes — attempt 1

Opt in with `?fruit3d=1`, then **Play demo mode → Endless Counter**. The first
practice orange makes the change visible immediately; complete the usual practice
pour to see all ingredients fall. The flag also works with **Play with camera**.
Remove the query (or use `fruit3d=0`) and reload for the original illustrations.
The PR does not deploy the live game.

![The five original meshes, including phone gameplay size](fruit-mesh-lineup.png)

## Shortlist and provenance

| Ingredient | Silhouette | GLB bytes | Triangles |
| --- | --- | ---: | ---: |
| Orange | Round peel, chunky leaf and stem | 48,888 | 1,912 |
| Lime | Pointed oval with a lime-green body | 16,848 | 728 |
| Berry | Magenta raspberry with separate rounded lobes | 124,624 | 5,296 |
| Melon | Thick seeded watermelon slice with mint rind | 96,260 | 2,348 |
| Pineapple | Raised golden diamond scales and folded crown | 47,380 | 896 |
| **Total** | All five existing ingredient kinds | **334,000** | **11,180** |

Original procedural geometry; no third-party fruit downloads or textures.
[Asset provenance and MIT license](../public/fruits/3d/LICENSE.md),
[Three.js license](../public/fruits/3d/THREE-LICENSE.txt), and
[reproducible generator](../scripts/generate-fruits.mjs) are included.
GLBs retain standard metallic/roughness materials for other viewers. In game,
all meshes use one glossy material treatment, warm key and mint rim lights, and
plum silhouette outlines. Slow yaw reveals volume without hiding the cut face or
crown. The unchanged UI illustrations remain the ingredient legend.

## Integration and fallbacks

Only asset presentation is added to `GameCanvas`. Meshes are drawn in the existing
item order, with gloves, effects, ticket aiming, squeeze hit radii, scoring,
practice timing, powerups, and cast behavior using the same code as before.
The GPU renderer and loader are imported only with the flag. It has one fixed
768×768 transparent canvas (DPR 1), no textures, shadows, postprocessing or separate
animation loop, and at most 16 mesh instances. Extra fruits use the original art.
Geometry/materials are shared across instances; consumed/expired instances are
removed, and resources plus pending fetches are cleaned up on unmount.

Sprites remain visible while GLBs load. A failed mesh falls back independently;
failed WebGL initialization or context loss falls back for the whole set until
reload. Reduced motion freezes the additional mesh tumble. The test-only gallery
at `/tests/fixtures/fruit-gallery.html` runs under Vite and is excluded from the
production build.

## Validation and performance sanity

- `npm run check`: lint, 27 scoring/audio/asset tests, TypeScript and production build.
- `npm run test:browser`: demo practice → aimed scoring pour → results → replay;
  original default with no mesh requests; missing asset; unavailable WebGL;
  context loss; 390×844 viewport; camera denial recovery; each tracked fist;
  real local MediaPipe initialization with Chromium's synthetic camera feed.
- Production build served at `/juicers-web/`: all five GLBs return HTTP 200,
  practice reaches gameplay, and no browser exceptions occur.
- Every GLB passes Khronos glTF Validator with **zero errors and warnings**.
- Production adds a lazy **615.22 kB JS chunk / 154.57 kB gzip**. Vite reports its
  >500 kB chunk advisory; the default path does not fetch it. GLBs add 326 KiB raw.

`node scripts/measure-fruits.mjs`, with the dev server running, samples 150 frames
and discards the first 31. macOS, headless Chromium 153, 30 px fruit radius:

| Scenario | Frame median / p95 | Render + composite median / p95 |
| --- | --- | --- |
| Five fruits, normal CPU | 16.7 / 16.8 ms | 9.5 / 10.3 ms |
| Five fruits, 4× CPU slowdown | 16.7 / 16.8 ms | 12.3 / 13.0 ms |
| 16-fruit stress, 4× CPU slowdown | 33.3 / 33.4 ms | 23.8 / 25.4 ms |

Five fruits use 34 draw calls / 19,448 triangles including outlines. The 16-fruit
stress uses 109 calls / 60,824 triangles, with 18 resident geometries and zero
retained instances after clearing. This is a synthetic renderer check, not a full
game or physical-phone benchmark. Actual phone GPU performance and real hands in
front of a camera still need a human device check; this is why attempt 1 stays
opt-in. Camera inference and the full diner canvas add their own work.

## Playfield stills

![3D orange during the unchanged practice pour](fruit-mesh-practice.png)

![Aimed berry pour scored for Pip, with a 3D pineapple falling](fruit-mesh-demo.png)

![Phone viewport practice](fruit-mesh-phone.png)
