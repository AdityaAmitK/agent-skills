# T3 Code settings panel

A single-page settings panel for T3 Code. Its first area is **Skills**: a table showing where each skill is installed for Codex and Claude on the VPS and the Mac. The VPS copy is the source for shared skills.

The stack, tokens and page patterns come from the personal-assistant owner console (`personal-assistant/panel`): Vite, React 19, Tailwind 4, shadcn `base-rhea` on Base UI, lucide icons, the system font with Geist Mono for data, and a strict-CSP-safe toast. The accent hue moves from that console's blue to indigo, so the two read as siblings.

## Run

```sh
npm ci
ADMIN_API=http://127.0.0.1:8790 npm run dev   # proxies /api to the backend
npm run build                                  # tsc -b && vite build -> dist/
npm run lint                                   # oxlint
```

The backend serves `dist/` and answers `/api/*` on the same origin. The panel has no login screen and holds no credentials. Put sign-in in front of it, at the server or the access proxy. A 401 or 403 from the API appears in the panel as "Sign in to manage skills".

## API contract

Mutating requests send `Content-Type: application/json` and `X-Panel-Request: 1`. The backend should reject mutations without that header. After every mutation the panel re-reads `GET /api/skills` and shows only what that response contains. It never updates optimistically and never shows sample data.

### `GET /api/skills`

```jsonc
{
  "skills": [
    {
      "id": "apple-design",          // used in URLs; encodeURIComponent-ed
      "name": "apple-design",
      "description": "…",
      "category": "design",          // optional
      "status": "synced",            // optional free text; tone inferred (synced/ok, drift/differs, error/failed, pending/syncing)
      "targets": {
        "codexVps":  { "installed": true,  "kind": "directory", "path": "/home/t3/.codex/skills/apple-design", "hash": "sha256:…", "version": "1.2.0" },
        "claudeVps": { "installed": true,  "kind": "symlink",   "path": "/home/t3/.claude/skills/apple-design", "hash": "sha256:…", "version": "1.2.0", "linkTarget": "/home/t3/.codex/skills/apple-design" },
        "codexMac":  { "installed": false, "kind": null, "path": null, "hash": null, "version": null },
        "claudeMac": null              // null or missing = not reported (checkbox disabled)
      }
    }
  ],
  "machines": [
    { "id": "vps", "name": "aditya-vps", "online": true },
    { "id": "mac", "name": "Aditya's Mac", "online": false, "lastSeen": 1793600000, "error": "ssh timeout" }
  ]
}
```

- Targets: `kind` containing `link` is shown as a link. Optional `linkTarget` and `error` are displayed when present.
- Machines are matched to the VPS and Mac columns by an `id`, `name` or `label` containing `vps` or `mac`. `online` can be a boolean, or `status` can be `online`, `ok`, `ready`, `up` or `connected`. A machine with `online: false` locks its columns. An unlisted machine counts as "status not reported", not offline.
- Source and drift are computed in the browser. The source is the VPS Codex copy, or the VPS Claude copy when Codex has none, preferring a real directory over a link. Another installed copy differs when its `hash` or `version` differs from the source's.

### `PATCH /api/skills/:id/targets`

Body `{ "target": "codexMac", "installed": true }`. Any 2xx response, including 204, counts as success. Errors use `{ "error": "message" }` and are shown on the cell. Removing a real copy (not a link) asks for confirmation first.

### `POST /api/skills/:id/sync`

Copies the VPS source over the other installed targets. The panel confirms first when any copy differs. Bulk sync sends one request per selected skill, one after another.

### `GET /api/skills/:id/diff`

Any of these shapes is accepted:

- a unified-diff string
- `{ "diff": "…" }`
- `{ "files": [{ "path", "status", "diff" | "patch" }] }`
- `{ "targets": { "codexMac": "…" | { "diff" } } }`
- `{ "identical": true }`

### Errors

| Response | Panel shows |
| --- | --- |
| network failure, 502, 503, 504 | "Can't reach the settings server" |
| 404, 405, 501, or HTML where JSON was expected | "The skills service isn't connected yet" |
| 401, 403 | "Sign in to manage skills" |
| anything else | the server's `error` text |

If a refresh fails after data has loaded, the last good result stays on screen under a warning that names when it was loaded. The panel refreshes when the tab regains focus, if the data is older than 15 s.

## Adding a settings area

Add a route to `src/components/shell.tsx` (`routes`) and a view to `src/App.tsx` (`views`). Routes are hash-based: `#/<area>/<args…>`. Skill details live at `#/skills/<id>`.
