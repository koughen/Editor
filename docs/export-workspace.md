# Export workspace

The header's Export button opens a destination workspace. The export scope is the
current scene, just like the previous video exporter.

## Video controls

MP4 supports H.264, HEVC and AV1; WebM supports VP9 and AV1, subject to the device's
WebCodecs encoders. The encoder is checked before rendering. An unsupported codec
produces an actionable error; the exporter never silently substitutes codecs.
WebKit uses low-latency encoding to avoid a reproducible stall in its quality-mode
queue. Every exported video verifies its encoded frame count before success, so
a device that drops frames produces an error instead of an incomplete export.
Encoder operations have a 30-second watchdog and cancellation interrupts pending
encoder work.

Controls include custom even pixel dimensions (16–7680), resolution presets,
project or fractional frame rates, fit/fill/stretch resizing, quality presets or
a target bitrate, constant/variable bitrate, keyframe interval, hardware preference,
audio on/off, AAC/Opus bitrate, 44.1/48 kHz, mono/stereo, and a custom in/out range.
The footer estimates file size from the target rates. Output is opaque SDR.

The scene renders at its original canvas dimensions, then scales into an encoding
canvas. This preserves the geometry of text, transforms and effects when output
resolution changes. Frame timestamps come from the rational frame rate; the final
partial frame is retained. Custom ranges start the video at zero and trim the
mixed audio to the same source range.

## Application handoffs

| Destination | Package contents | Import |
| --- | --- | --- |
| Premiere Pro | Final Cut Pro 7 XML, media, timed SRT text | Import `timeline.xml`, save as `.prproj` |
| DaVinci Resolve | Final Cut Pro 7 XML, media, SRT, optional Python importer | Import Timeline or run `import-resolve.py` with Resolve scripting enabled |
| After Effects | JSX composition builder and media | File > Scripts > Run Script File; save the resulting composition/project as `.aep` |
| CapCut | Experimental Python draft builder and media | Install `pycapcut`, run `import-capcut.py --drafts "CAPCUT DRAFTS FOLDER"`, refresh CapCut |

Each package includes `source-project.json` with the original project and scene
settings, `handoff.json` with the converted timeline, and detailed import notes.
Uploaded media and library audio are collected into a collision-safe media folder.
The browser downloads a ZIP; desktop can write a folder under Downloads / Editor
Exports and launch the installed destination app. Desktop locates macOS apps by
name rather than hard-coding a release year. Other platforms reveal the package.
After Effects automation can be blocked by macOS permissions; the same JSX remains
available for manual use. Opening Resolve or CapCut may still require the import
step described in the package. No existing destination project is overwritten.

**Keep clips editable** transfers cuts, trims, lane ordering, fractional rates,
basic transforms, opacity, mute state, simple speed changes and clip gain where
the interchange supports them. Keyframe curves, grades, effects, masks, advanced
mixing, generated graphics, and destination-specific text styling are not
translated into equivalent native effect controls. These differences appear in
Transfer notes before export; originals remain in the source manifest. XML text
is supplied separately as SRT. Non-uniform XML scaling is approximated using the
horizontal scale; speed changes should be checked in the destination.

**Preserve appearance** renders the final composite and stereo mix to a high
quality H.264/AAC file, then cuts that file at the original edit boundaries. This
preserves the finished look with adjustable cut segments; overlapping layers,
text, effects and audio processing are baked. Source media can optionally be kept
alongside it. It is not an editable native recreation of every original effect.

CapCut's draft schema is not a stable public interchange contract. The optional
pyCapCut adapter's upstream documentation targets Windows CapCut; Mac draft
compatibility varies. The generated draft is experimental. The appearance MP4
can always be imported as normal media when the draft cannot be opened. The script
adds a full-length background lane so magnetic main-track behavior does not remove
deliberate leading gaps. Python dependencies are not installed by the application.

## Implementation and validation

`rust/crates/export` owns validation, frame math, timeline conversion, fidelity
notes, XML generation, subtitle timing and script templates. The WASM exports use
JSON strings to keep the UI bridge small. Frontend code handles browser encoders,
media transport and UI; Tauri handles streaming writes, safe paths and launching.

After rebuilding WASM, run `bun run script/sync-wasm.ts` to refresh the installed
local `file:` package. `bun run build:wasm` includes this step. It avoids stale
package-manager cache copies when the Rust package version has not changed.

Validation commands:

```sh
cargo test -p editor-export
cargo test --manifest-path apps/tauri/src-tauri/Cargo.toml --lib
bun run build:wasm
cd apps/web && bunx tsc --noEmit && bun run build
```

`tests/export-browser.ts` and `tests/export-browser.html` test real GPU frames and encoded output,
range starts, resizing, encoded dimensions, AAC channel/sample settings and
cancellation in a browser with WebCodecs. Bundle the TS with esbuild, externalize
`opencut-wasm`, put a web-target WASM build in `wasm/` beside the HTML, and serve
these files over localhost. The page reports each result visibly.

Reference formats and APIs:

- [Apple's XML interchange conventions](https://developer.apple.com/library/archive/documentation/AppleApplications/Reference/FinalCutPro_XML/Basics/Basics.html)
- [Adobe's XML import workflow](https://helpx.adobe.com/premiere-pro/using/importing-xml-project-files-final.html)
- [After Effects scripts](https://helpx.adobe.com/after-effects/desktop/automate-in-after-effects/automate-animation/scripts.html)
- [Blackmagic's XML timeline import guide](https://documents.blackmagicdesign.com/UserManuals/DaVinci-Resolve-15-Color-Correction.pdf)
- [pyCapCut API and platform compatibility](https://github.com/GuanYixuan/pyCapCut/blob/main/english_readme.md)

The destination icons were extracted from the installed applications' icon
resources and are used only to identify the respective applications. Adobe,
Blackmagic Design and CapCut retain their trademarks. No endorsement is implied.
