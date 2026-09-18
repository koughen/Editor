# Color workspace

Open **Color** beside **Edit**, then choose a video or image from the clip strip.
The workspace has a viewer, optional Gallery and serial-node panel, clip strip,
optional timeline, palette toolbar, and scopes. Its organization was compared
with the Color page in the locally installed DaVinci Resolve 21.

## Working with a grade

Each correction node is a `color-grade` effect attached to a clip. Add a serial
node to isolate a secondary correction, select a node to edit it, and use Earlier
or Later to change processing order. Nodes can be named, disabled, reset, and
deleted. Each node has its own primaries, curves, mixer, qualifier, window, detail,
LUT, key strength, and animated numeric controls. Completed gestures use the
editor's undo history and project autosave.

**Bypass grades** is a preview-only comparison across the scene. **Highlight
matte** shows the selected node's combined qualifier/window/key output; downstream
effects on that clip are omitted from this monitor view. Neither monitor control
changes stored grades or exports. **Bypass node** is different: it disables that
node in the saved effect stack, including export.

**Grab still** saves a viewer frame and the current clip's resolved grade to the
local Gallery. Select a still for a movable reference wipe, or apply its grade to
another clip. Copy/paste grade and Gallery apply copy the values at the current
playhead, including evaluated animation. They intentionally do not transfer
animation timing. Stills keep the canvas aspect ratio at a 960-pixel width; they
are reference images, not full-resolution media exports. The Gallery is stored
locally in IndexedDB, outside individual projects.

## Comparison with Resolve

| Resolve area | Implemented in this editor | Differences / remaining work |
| --- | --- | --- |
| Workspace | Viewer, clip strip, Gallery, nodes, palette toolbar, scopes, optional timeline | No Lightbox or dedicated Media Pool in Color; media import stays in Edit |
| Primaries | Lift/Gamma/Gain/Offset wheels, Y sliders, RGB bars, relative temperature/tint, exposure stops, contrast/pivot, saturation, shadows/highlights, hue, color boost, midtone detail, luminance mix | Independent SDR algorithms and ranges, not numerical Resolve matching; no automatic balance, white/black-point picker, or camera Kelvin metadata |
| Log wheels | Tonal-range controls with adjustable low/high boundaries | Display-referred tonal weighting, not a scene-linear/log color-management pipeline |
| Curves | Custom Y/R/G/B, Hue vs Hue/Sat/Lum, Lum vs Sat, Sat vs Sat/Lum; draggable points, numeric point edits, keyboard adjustment, reset | Piecewise-linear curves sampled at 64 positions; no Bezier tangents, soft-clip section, or curve animation |
| RGB Mixer | 3×3 channel mixing, monochrome, preserve luminance, normalize channels | No channel-swap presets |
| Qualifier | Hue/saturation/luminance ranges, shared softness, invert, enable, viewer color picker, matte highlight | Picker samples the composited viewer; shader selection uses the node input. Saturation uses HSV normalization and luminance uses Rec.709. No RGB/3D qualifier, add/subtract sample sets, or matte morphology/denoise |
| Power Windows | Ellipse, rectangle, gradient; pan/tilt, width/height, rotation, softness, outside selection | One window per node, adjusted numerically; no polygon/Bezier windows or direct viewer handles. Animate positions manually with Keyframes |
| Blur / Sharpen | Radius, sharpen amount, mix, midtone detail | Lightweight spatial filter, not Resolve's per-channel blur/mist/coring controls or temporal noise reduction |
| Key | Per-node output gain combining window and qualifier | No external keys, key input routing, or key mixer |
| Sizing | Existing clip transform controls, with existing transform keyframes | Clip sizing, not separate input/output/node/reference sizing stages |
| LUTs | Import 3D `.cube`, domain min/max, 2–65 point tables, trilinear GPU interpolation, blend amount, remove | No 1D LUT/shaper or LUT-browser preset library; LUT applied after this node's adjustments |
| Nodes | Real serial processing, add, select, rename, reorder, delete, enable/bypass | No parallel/layer/splitter/combiner topology, groups, shared nodes, or timeline grading |
| Scopes | Luma waveform, RGB parade, RGB waveform overlay, RGB histogram, vectorscope; brightness and IRE/8-bit/10-bit scale labels | Sampled from the complete composited viewer at roughly 7 Hz, 256×144 input; 10-bit is a display scale, not 10-bit processing. No HDR/nits scope or scope layouts |
| Keyframes | Per-node numeric controls; add/update/delete, linear/hold interpolation, local playhead scrubber and keyframe list | Curves and LUT contents are static; no automatic window/object tracking |
| Gallery / comparison | Local stills with grade recipes, reference wipe, copy/paste current grade, preview bypass | No PowerGrades interchange, remote grades, grade versions, or multi-image split screen |
| Advanced palettes | — | Camera RAW, chart Color Match, color-managed HDR wheels, Color Warper/ColorSlice, motion effects/noise reduction, automatic tracking/Magic Mask, stereo 3D, and third-party effects need separate implementations |

This is an SDR grading workspace, not complete Resolve feature or color-science
parity. The current renderer uses 8-bit display-referred surfaces and clamps
between serial nodes. Camera-log normalization requires an appropriate imported
LUT; project-wide input/working/output color management, ACES, HDR mastering, and
higher-precision intermediate surfaces are not implemented.

## Controls

- Drag a color wheel to change balance. X/Y fields provide keyboard access.
- Double-click a slider to reset that control. Node and palette resets are also
  available. Resetting a node removes its numeric keyframes.
- In Curves, click to add a point; drag it or use arrow keys. Endpoints keep their
  input positions. Interior points can be removed.
- In Qualifier, click the miniature viewer to choose a color, then refine ranges.
  Use **Highlight matte** to inspect selection. White receives the correction;
  black retains the input. Qualifiers and windows combine multiplicatively.
- In Keyframes, choose a control, add its first keyframe, move the playhead, then
  adjust it. Once animated, ordinary palette adjustments update/add the value at
  the current local time. The interpolation menu applies on Add/Update keyframe.
- **Key output gain** blends the complete node with its input. A zero gain leaves
  its input intact, including transparency.

## Implementation and build

Rendering, curve interpolation, LUT parsing, qualifier color analysis, and scope
computation live in the Rust effects crate. React owns the workspace, gestures,
preview-only monitor state, and local Gallery storage. The existing effect and
animation pipeline is reused for playback and export.

The app uses the repository's Rust renderer instead of the published WASM package:

```sh
cargo install wasm-pack --locked
rustup target add wasm32-unknown-unknown
wasm-pack build rust/wasm --target bundler --out-dir pkg
bun install --force
cd apps/web
bun run build
cd ../tauri/src-tauri
bunx @tauri-apps/cli@2 build --bundles app
```

After changing Rust, rebuild the bundler target and refresh the local file
dependency with `bun install --force`. Release CI builds WASM before installing
JS dependencies. The review build uses product name **Editor Color Preview** and
identifier `com.editor.color-preview`, with its own local project storage.

## Validation

```sh
cargo test -p effects
bun test:local
cd apps/web
bunx tsc --noEmit
bun run build
```

GPU regression tests check neutral identity and alpha, exposure, saturation,
temperature, all four wheels, RGB channel mixing, custom curves, serial-node
order, qualifier and window rejection, key strength, highlight output, malformed
LUT bypass, and 2/65-point LUT interpolation. Additional tests cover .cube parsing,
curve interpolation, picker coordinates, and known scope signal positions. The
monitor test confirms that preview bypass/highlight do not mutate saved tracks.

The JavaScript test harness uses the real Node-target Rust WASM module. Three
existing failures were reproduced on the original repository: headless text
measurement during mask snapping, a custom-mask insertion expectation, and a
placement test passing fractional media ticks. They are outside the Color work.
