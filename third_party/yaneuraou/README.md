# やねうら王 wasm — Corresponding Source (GPL-3.0)

The files served from `public/games/shogi/engine/yaneuraou-v7.63/` are object
code of YaneuraOu (GPL-3.0). This directory is their Corresponding Source.

| Served file | SHA-256 |
|---|---|
| `sse42/yaneuraou.wasm` | `3bf5dfde3a6b5fead9f9b04e2b8a2f84ea9bc17646d199a31e2cad65fbfeb832` |
| `nosimd/yaneuraou.wasm` | `7994d60851968408e1ac6ab07935e18370b6750b1cb37ce92d283bb6c5505cb7` |

## Contents

- `mizar-v7.6.3/source.tar.xz` — engine source from
  `SuishoPetite-YaneuraOu-v7.6.3-wasm.zip` of
  https://github.com/mizar/YaneuraOu/releases/tag/v7.6.3
  (SHA-256 `7d11f673fccdb03b69dd25b9431291a4444bbe020b965ad56ce502f5ec2ab45b`).
  The SuishoPetite (20211123) evaluation weights are embedded in the build.
- `mizar-v7.6.3/Copying.txt` — the license text shipped in that package.
- `usumerican-yaneuraou-suisho-petite/` — `script/` and `LICENSE` of
  https://github.com/usumerican/yaneuraou-suisho-petite at commit
  `4568f76268128a65c5936d15a2188c8f64f71847`. The upstream Dockerfile clones this
  repository (unpinned) into `/workspace`; its `Makefile` and `usi.cpp` are then
  overwritten by the patched copies below and `custom_build.sh` replaces its
  `build.sh`, so none of its files reach the output. Mirrored so the rebuild
  needs no network access beyond the base image.
- `yaneuraou_wasm_build/` — build scripts and patches (single-thread build,
  USI bridge),
  copied unchanged.

## Rebuild

See `yaneuraou_wasm_build/Dockerfile` and `custom_build.sh`
(emscripten/emsdk 3.1.24, `make tournament`, variants `sse42` and `nosimd`).
For an offline rebuild, replace the Dockerfile's `git clone` with the mirrored
`usumerican-yaneuraou-suisho-petite/` and its `curl` with `mizar-v7.6.3/`.
An offline rebuild has not been run yet; its output has not been compared with
the served wasm.
