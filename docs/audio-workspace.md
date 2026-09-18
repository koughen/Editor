# Audio workspace

Open **Audio** beside Edit and Color. The mixer uses the project's video and audio tracks. Effects, routing, automation and buses save with the scene and use the editor's undo/redo history.

## Mixing and effects

- Each track, group, return and stereo output has a fader and pan. Track/group mute and solo affect playback and exports. Soloing a group includes its members. Muting a track suppresses its sends.
- **Effects** provides EQ, compression, reverb and delay, plus multiband noise suppression, a gate/expander, a split-band de-esser and sidechain ducking. All cleanup controls are initially disabled; old projects remain neutral.
- Noise reduction is a lightweight six-band downward suppression algorithm for steady noise. It is not trained voice isolation or a repair tool for clicks, wind, clipping or missing audio. Set its floor carefully to preserve quiet detail.
- **Music ducking** listens to the selected track before that track's fader and processing. Muting the source disables the detector. Threshold, attenuation, attack and release are adjustable. Stem renders retain the original detector input, including when only the music is exported.
- **Effects order** changes the actual chain, not just its display order. Reverb and delay can be before or after the compressor.
- **Additional EQ bands** adds up to eight independently enabled parametric, shelf, low/high-pass or notch filters, each with frequency, gain and Q. The frequency-response plot includes these bands.
- **Routing** sends a track to stereo output or a group and adds pre/post-fader sends to shared returns. Groups and returns feed stereo output, keeping the graph free of feedback cycles. New returns start with wet-only reverb; they can be changed to delay or other processing.

## Automation, fades and crossfades

**Automation** edits volume, pan, the original EQ, additional EQ-band parameters, compressor parameters, reverb send and delay controls on tracks, buses and the master. Add a point at the playhead or a specific timeline time, then edit its value and ramp/hold behavior. Read automation can be disabled without deleting points. Active lanes override their static controls. Clip volume automation remains in the clip inspector.

Fades have numerical duration controls, draggable audio-clip handles, keyboard arrow adjustment and linear, equal-power or S curves. **Crossfade selection** applies complementary equal-power fades to two clips whose end/start already overlap on separate tracks. It preserves picture sync and does not move clips. A clip wholly contained inside the other is not an end/start crossfade.

## Loudness and continuous preview

The output meter shows integrated, momentary and short-term LUFS and true peak in dBTP after master processing/limiting and before monitoring volume. Measurement starts at playback or Reset and freezes while paused. The analysis uses the Rust `ebur128` implementation of EBU R128 / ITU BS.1770, including gating and oversampled true peaks. No formal compliance certification is claimed.

**Analyze full mix** measures the entire exported signal and reports loudness range as well. Playback meters represent the played portion, so seeking resets measurement.

**Render exact preview** renders a continuous full mix with three extra seconds of tails. Playback/seek then reads that render, preserving effect history at a seek position. This is also the audition path for native Audio Units. After a mix edit, render again. **Live** returns to the responsive built-in mixer. Live seeks still start fresh effect state; the exact preview avoids that limitation. A rendered preview has an output loudness meter but does not reconstruct per-track peak meters.

## Native Audio Units

The macOS build includes an AVAudioEngine helper that scans installed effect Audio Units, exposes writable parameters, stores insert order/values/bypass and renders in a separate process. Track inserts run before built-in channel effects; stereo-out inserts run after the mixed output. Generic parameter controls are supported, including repeat instances of the same effect. Native inserts are available on source tracks and stereo output, not group/return buses.

Use **Scan installed effects**, add an effect, edit its controls, and **Render plug-in preview** (or the toolbar's exact preview) before playing. Exports always render the current insert settings. On the web, bypass native inserts or open the macOS app; they are never silently discarded.

This host supports Audio Units, not VST3; it does not embed plug-ins' custom windows, instrument/MIDI interfaces or proprietary preset browsers. Offline-incompatible or unavailable plug-ins produce an explicit render error. Apple AULowpass was verified through the helper; compatibility with every third-party Audio Unit and its latency behavior is not guaranteed.

## WAV and stems

The **Export** inspector renders a stereo WAV at 44.1, 48 or 96 kHz with 16/24-bit PCM or 32-bit float encoding. Choose 0–30 seconds of extra tail, keep current levels or normalize the stereo mix to −14, −16 or −23 LUFS. Normalization applies only as much gain as a −1 dBTP ceiling permits, so highly dynamic material may finish below the requested loudness.

**Include separate track and group stems** writes timeline-aligned stems with track/group effects, sends and the original sidechain inputs. Stems omit master processing and preserve their original relative gain. Shared nonlinear group/return processing means recombined wet stems can differ from the combined mix. Muted/non-soloed tracks render silence, matching the mixer.

On macOS, files and a JSON loudness report save to a new folder inside **Downloads/Editor Exports**. In a browser, the stereo file downloads as WAV; a mix plus stems downloads as an uncompressed ZIP. Cancel stops the next render/upload step and removes the incomplete native export folder. A running Web Audio render or native plug-in call must finish before cancellation can settle. Native render timeouts are bounded.

Audio-only delivery can include tails. Video export keeps the video's timeline duration. Native inserts and all built-in processing are included in the existing video export audio path.

## Implementation

- `rust/crates/audio`: defaults, limits, presets, automation interpolation, fade/crossfade policy, routing, cleanup DSP, WAV encoding and loudness analysis.
- `rust/audio-worklet`: small raw WASM ABI with fixed render buffers; no allocations in cleanup processing.
- `apps/web/public/audio/processor.js`: AudioWorklet adapter. DSP runs off the main thread, in Rust.
- `apps/web/src/audio`: Web Audio graph, UI, export and native transport. Playback and offline rendering share the graph.
- `apps/tauri/src-tauri/native/AudioUnitHost.swift` and `src/audio_plugins.rs`: platform Audio Unit hosting and bounded file transport.

The engine renders stereo. This workspace does not add multichannel surround, MIDI instruments, a piano roll or recording/comping.

## Validation

- `cargo test -p audio`: 16 tests covering neutral/limited settings, fades, curves, envelopes, routing cycles/solo, gates, ducking, de-essing, suppression, WAV encoding and a loudness reference signal.
- `bun test --preload ./script/test-wasm.ts apps/web/src/audio/__tests__/mix.test.ts` after the Node WASM build: 7 integration tests, including backwards-compatible settings and JSON round-tripping of automation, EQ and plug-ins.
- `bash script/test-audio-browser`: real offline Web Audio output checks, including a 60-second 12-track processing stress test. The test page produces no speaker output.
- Native helper scan, parameter discovery and a two-second low-pass render were verified with Apple AULowpass; RMS fell from 0.212132 to 0.002126 with its cutoff at 100 Hz for a 1 kHz input tone.

Build the worklet with `bash script/build-audio-worklet`; the root `build:wasm` script includes this automatically. Its generated module is served from `/audio/processor.wasm` in both the static web bundle and native app.
