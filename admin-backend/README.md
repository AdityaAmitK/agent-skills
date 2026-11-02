# Skills administration

The web app is served at `https://t3-code.adityakinjawadekar.com` through a dedicated Cloudflare tunnel with mandatory Access JWT validation and an owner-only policy. The Python server binds only to loopback. It must not be published through a proxy that skips Access validation. Mutations additionally require the exact public Origin and `X-Panel-Request: 1`.

## Central packages

- Mac: `/Users/aditya/.local/share/skill-admin/skills`
- VPS: `/home/t3/.local/share/skill-admin/skills`

Personal provider installations point into these stores. The VPS is authoritative when syncing a shared package. Sync updates the whole Mac package, including resources and executable permissions, and preserves enabled/disabled provider selections. Enabling a VPS-only skill on the Mac first imports its package. Enabling a Mac-only skill on the VPS first imports that package, making the VPS its source for future syncs. Disabling an installation backs up its link or folder; it never deletes the central package.

Every replaced folder or link is moved under `~/.local/share/skill-admin/backups` with a UTC timestamp and original path. Baseline manifests and the full audit are kept privately under the Mac's `~/.local/share/skill-admin/audit`, outside the source repository. Legacy root personal installations on the VPS point to the same VPS store; their originals are under `backups/legacy-root`.

Provider-managed system skills, synced provider bundles, and plugin caches keep their provider lifecycle. Cached packages are listed with their paths and hashes but are not claimed to be active installations. Their checkboxes are locked. Versioned cache copies appear in skill details. The existing nested `skill-creator` variant is retained rather than silently replacing a provider bundle.

## Services

VPS user units in `deploy/` run the API on `127.0.0.1:18340` and the dedicated Cloudflare connector. The server uses the sibling `admin-panel/dist` build. Private settings live under `~/.local/share/skill-admin`; no credentials belong in this repository.

On the Mac, launch agents `com.aditya.skill-admin-agent` and `com.aditya.skill-admin-tunnel` run the private machine agent on loopback port 18341 and a persistent SSH reverse forward to VPS loopback port 18342. A dedicated SSH key is restricted to that forwarding port with no shell command. Agent requests additionally use a private shared key. Sleep/disconnection produces an offline state, retaining the last known inventory. The agent has a deployed copy of `admin-backend/` under `~/.local/share/skill-admin/app`; update it when changing the backend.

`config.json` holds only executable paths: `node` and `t3Cli`. `agent.key`, `tunnel-key`, and `tunnel.token` are private generated credentials; do not print, commit, or copy them into diagnostics.

## T3 refresh

After import or installation changes, provider directory events are emitted and `refresh-t3.mjs` asks the running official T3 server to rescan its provider catalogs and cached workspaces. It uses a one-minute, read-scoped session issued by T3's own CLI, held only in memory and revoked afterward. T3 is not restarted or replaced. Refresh runs in the background; the panel shows pending/refreshed/unavailable, and `t3-refresh.json` holds its latest result.

A rescan is distinct from proof that an existing chat's skill picker or model sees the change immediately. Already-running turns may retain previously loaded instructions. That end-to-end behavior requires separate runtime verification on the installed T3 version. Do not label it proven merely because files match or the refresh RPC succeeded.

## Validation

Build/typecheck and lint: `npm run build` and `npm run lint` in `admin-panel`. Syntax checks: `python3 -m py_compile admin-backend/*.py` and `node --check admin-backend/refresh-t3.mjs`. No test code or inline self-checks are included.

Recommended separate runtime checks: owner sign-in and unauthorized rejection; one checkbox enable/disable with backup restoration; drift in a resource file and VPS-to-Mac sync; Mac asleep/offline recovery; sync a newly enabled skill and confirm it appears and can be invoked in the same existing T3 chat without restart. Confirm both Codex and Claude independently.
