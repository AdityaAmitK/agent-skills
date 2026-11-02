import { api, ApiError } from "@/lib/api"

// ---- Contract ------------------------------------------------------------
// GET    /api/skills               -> SkillsResponse
// PATCH  /api/skills/:id/targets   <- { target: TargetKey, installed: boolean }
// POST   /api/skills/:id/sync      (copies the VPS source over the other targets)
// GET    /api/skills/:id/diff      -> DiffResponse (see normalizeDiff)
// Mutations carry X-Panel-Request: 1. The panel re-reads GET /api/skills after
// every mutation and shows only what that answer says.

export const TARGETS = ["codexVps", "claudeVps", "codexMac", "claudeMac"] as const
export type TargetKey = (typeof TARGETS)[number]
export type MachineKey = "vps" | "mac"

export const TARGET_INFO: Record<TargetKey, { agent: "Codex" | "Claude"; machine: MachineKey; label: string }> = {
  codexVps: { agent: "Codex", machine: "vps", label: "Codex on VPS" },
  claudeVps: { agent: "Claude", machine: "vps", label: "Claude on VPS" },
  codexMac: { agent: "Codex", machine: "mac", label: "Codex on Mac" },
  claudeMac: { agent: "Claude", machine: "mac", label: "Claude on Mac" },
}
export const MACHINE_LABEL: Record<MachineKey, string> = { vps: "VPS", mac: "Mac" }

export type Target = {
  installed: boolean
  available?: boolean
  managed?: boolean
  /** "directory", "symlink", "file"... whatever the backend reports. */
  kind?: string | null
  path?: string | null
  hash?: string | null
  version?: string | null
  /** Where a symlink points, when the backend reports it. */
  linkTarget?: string | null
  error?: string | null
}

export type Skill = {
  id: string
  name: string
  description?: string | null
  category?: string | null
  status?: string | null
  canSync?: boolean
  sourceTarget?: TargetKey | null
  copies?: { path: string; target: string; origin: string; hash?: string | null; resolved?: string; broken?: boolean }[]
  targets: Partial<Record<TargetKey, Target | null>>
}

export type Machine = {
  id: string
  name?: string
  label?: string
  online?: boolean
  status?: string
  lastSeen?: string | number
  error?: string
  refresh?: { status: string; message?: string }
}

export type SkillsResponse = { skills: Skill[]; machines: Machine[] }

export const enc = encodeURIComponent

export async function fetchSkills(): Promise<SkillsResponse> {
  const r = await api<Partial<SkillsResponse> | null>("/api/skills")
  if (!r || !Array.isArray(r.skills))
    throw new ApiError("/api/skills answered, but not with a skills list. Check the backend version.", 200, "missing")
  return { skills: r.skills.filter((s) => s && typeof s.id === "string"), machines: Array.isArray(r.machines) ? r.machines : [] }
}

export const setTarget = (id: string, target: TargetKey, installed: boolean) =>
  api(`/api/skills/${enc(id)}/targets`, { method: "PATCH", body: { target, installed } })

export const syncFromVps = (id: string) => api(`/api/skills/${enc(id)}/sync`, { method: "POST" })

// ---- Machines --------------------------------------------------------------

export type MachineState = { key: MachineKey; online: boolean | undefined; label: string; detail?: string; lastSeen?: string | number }

/** Finds the VPS and Mac entries in machines[] by id or name. Unlisted means unknown, not offline. */
export function machineStates(machines: Machine[]): Record<MachineKey, MachineState> {
  const find = (key: MachineKey) =>
    machines.find((m) => [m.id, m.name, m.label].some((v) => typeof v === "string" && v.toLowerCase().includes(key)))
  const out = {} as Record<MachineKey, MachineState>
  for (const key of ["vps", "mac"] as const) {
    const m = find(key)
    const online = m ? (typeof m.online === "boolean" ? m.online : m.status ? /^(online|ok|ready|up|connected)$/i.test(m.status) : undefined) : undefined
    out[key] = { key, online, label: m?.label || m?.name || MACHINE_LABEL[key], detail: m?.error || (m?.status && online === false ? m.status : undefined), lastSeen: m?.lastSeen }
  }
  return out
}

// ---- Derived state ------------------------------------------------------------

export const isLink = (t?: Target | null) => !!t && /link/i.test(t.kind || "")

export type Analysis = {
  /** The VPS copy every other target is compared with. */
  source?: { key: TargetKey; target: Target }
  drift: Partial<Record<TargetKey, boolean>>
  driftCount: number
  onVps: boolean
  onMac: boolean
}

export function analyze(s: Skill): Analysis {
  const t = s.targets || {}
  const sourceKey = s.sourceTarget ?? (["codexVps", "claudeVps"] as const).find((k) => t[k]?.installed && !isLink(t[k])) ?? (["codexVps", "claudeVps"] as const).find((k) => t[k]?.installed)
  const source = sourceKey ? { key: sourceKey, target: t[sourceKey]! } : undefined
  const drift: Analysis["drift"] = {}
  let driftCount = 0
  for (const k of TARGETS) {
    const x = t[k]
    if (!source || k === source.key || !x?.installed) continue
    const hashDiffers = !!(x.hash && source.target.hash && x.hash !== source.target.hash)
    const versionDiffers = !!(x.version && source.target.version && x.version !== source.target.version)
    if (hashDiffers || versionDiffers) {
      drift[k] = true
      driftCount++
    }
  }
  return {
    source,
    drift,
    driftCount,
    onVps: !!(t.codexVps?.installed || t.claudeVps?.installed),
    onMac: !!(t.codexMac?.installed || t.claudeMac?.installed),
  }
}

// ---- Diff ------------------------------------------------------------------

export type DiffSection = { title?: string; text: string }

/**
 * The diff shape is the backend's choice; these are all accepted:
 * a unified-diff string; { diff }; { files: [{ path, status?, diff|patch }] };
 * { targets|diffs: { codexMac: "..." | { diff } } }; { identical: true }.
 */
export function normalizeDiff(r: unknown): { sections: DiffSection[]; identical: boolean } {
  if (r == null) return { sections: [], identical: true }
  if (typeof r === "string") return { sections: r.trim() ? [{ text: r }] : [], identical: !r.trim() }
  if (typeof r !== "object") return { sections: [{ text: String(r) }], identical: false }
  const o = r as Record<string, unknown>
  const textOf = (v: unknown): string =>
    typeof v === "string" ? v : v && typeof v === "object" ? textOf((v as Record<string, unknown>).diff ?? (v as Record<string, unknown>).patch ?? JSON.stringify(v, null, 2)) : ""
  const sections: DiffSection[] = []
  if (typeof o.diff === "string" && o.diff.trim()) sections.push({ text: o.diff })
  if (Array.isArray(o.files))
    for (const f of o.files as Record<string, unknown>[]) {
      const title = [f.path, f.status].filter(Boolean).join(" · ")
      sections.push({ title: title || undefined, text: textOf(f.diff ?? f.patch ?? "") })
    }
  const per = (o.targets ?? o.diffs) as Record<string, unknown> | undefined
  if (per && typeof per === "object" && !Array.isArray(per))
    for (const [k, v] of Object.entries(per)) {
      const text = textOf(v)
      if (text.trim()) sections.push({ title: TARGET_INFO[k as TargetKey]?.label ?? k, text })
    }
  if (!sections.length && o.identical !== true && Object.keys(o).length && !("diff" in o) && !("files" in o))
    sections.push({ text: JSON.stringify(o, null, 2) })
  return { sections: sections.filter((x) => x.text.trim() || x.title), identical: o.identical === true || !sections.length }
}
