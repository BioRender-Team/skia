# Build CanvasKit with SVGDOM

## Prereqs
- Use a recent Skia revision (we currently base on **Chrome m145**).
- Apply the SVGDOM-related changes (CanvasKit bindings + build flags).

## Build
From the Skia repo root:

```bash
source /Users/ning/skia/third_party/externals/emsdk/emsdk_env.sh
./tools/git-sync-deps
modules/canvaskit/compile.sh enable_svg
```

## Outputs
Look for these in your `out/` folder (e.g. `out/canvaskit_wasm/`):
- `canvaskit.js`
- `canvaskit.wasm`