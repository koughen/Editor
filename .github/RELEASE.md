# Releasing

Editor's release pipeline is [`.github/workflows/release.yml`](workflows/release.yml). It runs automatically on any tag matching `v*`.

## Cutting a release

```sh
# Make sure main is green and everything's committed
git tag -a v0.1.X -m "Editor 0.1.X"
git push origin v0.1.X
```

That triggers the matrix:

- macOS arm64 + Intel → `.dmg`
- Windows → `.msi`, `.exe`
- Linux → `.deb`, `.rpm`, `.AppImage`

All six artifacts attach to the GitHub Release for the tag (created automatically by `tauri-action`). 8–12 minutes end-to-end.

## Auto-updating Homebrew + Scoop

The `publish-managers` job in the same workflow updates two satellite repos on every tag:

- [`koughen/homebrew-editor`](https://github.com/koughen/homebrew-editor) — Homebrew tap
- [`koughen/scoop-editor`](https://github.com/koughen/scoop-editor) — Scoop bucket

For these to update, the Editor repo needs a secret called **`PUBLISHER_TOKEN`** — a fine-grained Personal Access Token with `Contents: Read & write` on **both** the tap and the bucket repos. Without it, the job logs a warning and skips; tagged releases still publish to GitHub Releases just fine.

### Creating the token

1. https://github.com/settings/personal-access-tokens/new
2. **Resource owner**: koughen
3. **Repository access**: Only select repositories → `homebrew-editor`, `scoop-editor`
4. **Permissions** → Repository permissions → **Contents**: Read and write
5. Copy the token.
6. https://github.com/koughen/Editor/settings/secrets/actions/new
7. Name: `PUBLISHER_TOKEN`. Value: the token from step 5.

That's a one-time setup — every future tag updates both managers automatically.

## What if the build fails

`gh run list --workflow=release.yml --repo koughen/Editor` shows the latest runs. `gh run view <id> --log-failed` dumps just the failing step. Most failures are transient (network) or platform-specific dep changes; re-running usually works.

If the artifact uploaded but you need to redo it: delete the GitHub Release and re-run the workflow via `gh workflow run release.yml -f tag=v0.1.X`.
