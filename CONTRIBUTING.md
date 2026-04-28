# Contributing to Editor

Thanks for poking around. This is a small, opinionated personal project — but PRs and issues are welcome if something's broken or you want to share.

## Getting set up

You need:

- **Bun** ≥ 1.2 — `curl -fsSL https://bun.sh/install | bash`
- **Rust** stable — `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh`
- Platform-native build tools:

| Platform | Install |
| --- | --- |
| **Linux (Arch)** | `sudo pacman -S webkit2gtk-4.1 libsoup3 base-devel` |
| **Linux (Debian/Ubuntu)** | `sudo apt install libwebkit2gtk-4.1-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev libsoup-3.0-dev patchelf` |
| **macOS** | `xcode-select --install` |
| **Windows** | install MSVC build tools + WebView2 (usually preinstalled) |

Then:

```sh
git clone https://github.com/koughen/Editor.git
cd Editor
./script/setup     # installs deps, runs sanity checks
```

If `./script/setup` flags anything missing, fix it before continuing.

## Running it

```sh
# In one terminal — the web frontend (port 3001)
bun --cwd apps/web run dev -- -p 3001

# In another — the Tauri shell (hot reloads)
cd apps/tauri/src-tauri
WEBKIT_DISABLE_DMABUF_RENDERER=1 \
WEBKIT_DISABLE_COMPOSITING_MODE=1 \
bunx @tauri-apps/cli@^2 dev
```

The two `WEBKIT_*` env vars are a Wayland + WebKit2GTK workaround. Drop them on macOS, Windows, or X11.

## Building

```sh
bun --cwd apps/web run build       # static export → apps/web/out/
cd apps/tauri/src-tauri
bunx @tauri-apps/cli@^2 build      # native installer → target/release/bundle/
```

## Project layout

```
apps/
  web/              Next.js 16 app — the editor UI (statically exported)
  tauri/src-tauri/  Tauri 2 shell — Rust binary that wraps the static export
  desktop/          (legacy) original GPUI experiment, not used
packages/           shared TS packages (UI primitives, etc.)
rust/               Rust crates that compile to WASM (timing math, etc.)
assets/             logos + screenshots used by README
```

The editor's interesting bits live in `apps/web/src/`:

- `editor/` — top-level editor state machine
- `timeline/` — timeline rendering + interaction
- `preview/` — preview surface + overlays
- `core/managers/` — project / playback / save state
- `services/renderer/` — WebGPU + canvas compositors
- `media/` — file import / decode (mediabunny)
- `wasm/` — bindings to the Rust time-math crate

## Conventions

- **TS**: `bun run lint:web` (Biome).
- **Rust**: `cargo fmt` + `cargo clippy --all-targets`.
- **Commit style**: short imperative subject, optional body explaining *why*. Example: `fix: clamp playhead to scene length on undo`. We don't use Conventional Commits strictly — keep it readable.
- **No comments unless they explain something non-obvious.** Names should carry the load.
- **No new abstractions just-in-case.** Three repeated lines is fine; extract on the fourth.

## Filing issues

Use the templates under [`.github/ISSUE_TEMPLATE`](.github/ISSUE_TEMPLATE/). Reproductions beat opinions.

## License

By contributing, you agree your contribution will be licensed under the MIT license, the same as the rest of the project.
