import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  ChevronRightIcon,
  CircleAlertIcon,
  LinkIcon,
  LockIcon,
  PlugZapIcon,
  RefreshCwIcon,
  RotateCwIcon,
  SearchIcon,
  WifiOffIcon,
} from "lucide-react"
import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { Confirm } from "@/components/confirm"
import { Nothing, PageHeader, Panel } from "@/components/page"
import { Dot, Status, tone } from "@/components/status"
import { toast } from "@/components/toaster"
import { failure, type ApiError } from "@/lib/api"
import { plural, time, when } from "@/lib/format"
import {
  analyze,
  fetchSkills,
  isLink,
  machineStates,
  MACHINE_LABEL,
  setTarget,
  syncFromVps,
  TARGET_INFO,
  TARGETS,
  type Analysis,
  type MachineKey,
  type MachineState,
  type Skill,
  type SkillsResponse,
  type TargetKey,
} from "@/lib/skills"
import { cn } from "@/lib/utils"
import { SkillDetails } from "@/views/skill-details"

// ---- Live data -------------------------------------------------------------

type Load = { data?: SkillsResponse; error?: ApiError; loading: boolean; at?: Date }

function useSkills() {
  const [state, setState] = useState<Load>({ loading: true })
  const token = useRef(0)
  const reload = useCallback(async () => {
    const t = ++token.current
    setState((s) => ({ ...s, loading: true }))
    try {
      const data = await fetchSkills()
      if (t === token.current) setState({ data, loading: false, at: new Date() })
    } catch (e) {
      // Keep the last answer on screen, clearly marked as not refreshed.
      if (t === token.current) setState((s) => ({ ...s, error: failure(e), loading: false }))
    }
  }, [])
  useEffect(() => {
    reload()
  }, [reload])
  // Re-read when the owner comes back to the tab, so the table isn't stale.
  const at = state.at
  useEffect(() => {
    const on = () => {
      if (document.visibilityState === "visible" && (!at || Date.now() - at.getTime() > 15000)) reload()
    }
    document.addEventListener("visibilitychange", on)
    window.addEventListener("focus", on)
    return () => {
      document.removeEventListener("visibilitychange", on)
      window.removeEventListener("focus", on)
    }
  }, [at, reload])
  return { ...state, reload }
}

// ---- Filters ---------------------------------------------------------------

type Filter = "all" | "differs" | "vps" | "mac"
const FILTERS: { id: Filter; label: string; test: (a: Analysis) => boolean }[] = [
  { id: "all", label: "All", test: () => true },
  { id: "differs", label: "Differs from VPS", test: (a) => a.driftCount > 0 },
  { id: "vps", label: "VPS only", test: (a) => a.onVps && !a.onMac },
  { id: "mac", label: "Mac only", test: (a) => a.onMac && !a.onVps },
]

type Row = { skill: Skill; a: Analysis }

const pendingKey = (id: string, op: TargetKey | "sync") => `${id}:${op}`

type Ask =
  | { kind: "remove"; skill: Skill; target: TargetKey }
  | { kind: "sync"; rows: Row[] }

export function SkillsView({ args = [] }: { args?: string[] }) {
  const { data, error, loading, at, reload } = useSkills()
  const [query, setQuery] = useState("")
  const [filter, setFilter] = useState<Filter>("all")
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [pending, setPending] = useState<Set<string>>(new Set())
  const [errors, setErrors] = useState<Record<string, string>>({})
  // Details live in the address (#/skills/<id>) so they can be linked and reopened.
  const openId = args[0] ?? null
  const setOpenId = (id: string | null) => {
    location.hash = id ? `#/skills/${encodeURIComponent(id)}` : "#/skills"
  }
  const [ask, setAsk] = useState<Ask | null>(null)
  const search = useRef<HTMLInputElement>(null)

  // "/" jumps to search, as in most tables of this kind.
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement
      if (e.key === "/" && !e.metaKey && !e.ctrlKey && !/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) && !el.isContentEditable) {
        e.preventDefault()
        search.current?.focus()
      }
    }
    window.addEventListener("keydown", on)
    return () => window.removeEventListener("keydown", on)
  }, [])

  const machines = useMemo(() => machineStates(data?.machines || []), [data])
  const rows = useMemo<Row[]>(
    () => (data?.skills || []).map((skill) => ({ skill, a: analyze(skill) })).sort((x, y) => x.skill.name.localeCompare(y.skill.name)),
    [data],
  )
  const q = query.trim().toLowerCase()
  const matching = useMemo(
    () => (q ? rows.filter(({ skill: s }) => [s.name, s.id, s.description, s.category].some((v) => v?.toLowerCase().includes(q))) : rows),
    [rows, q],
  )
  const counts = useMemo(() => Object.fromEntries(FILTERS.map((f) => [f.id, matching.filter((r) => f.test(r.a)).length])) as Record<Filter, number>, [matching])
  const visible = useMemo(() => matching.filter((r) => FILTERS.find((f) => f.id === filter)!.test(r.a)), [matching, filter])

  // Drop selections for skills the latest answer no longer lists.
  useEffect(() => {
    if (!data) return
    setSelected((sel) => {
      const ids = new Set(data.skills.map((s) => s.id))
      const next = new Set([...sel].filter((id) => ids.has(id)))
      return next.size === sel.size ? sel : next
    })
  }, [data])

  const mark = (key: string, on: boolean) =>
    setPending((p) => {
      const n = new Set(p)
      if (on) n.add(key)
      else n.delete(key)
      return n
    })
  const setError = (key: string, message?: string) =>
    setErrors((e) => {
      const n = { ...e }
      if (message) n[key] = message
      else delete n[key]
      return n
    })

  // Every operation ends by re-reading the server; the table never shows a
  // state the server didn't report.
  const toggle = async (skill: Skill, target: TargetKey, installed: boolean) => {
    const key = pendingKey(skill.id, target)
    mark(key, true)
    setError(key)
    try {
      await setTarget(skill.id, target, installed)
      toast(`${installed ? "Installed" : "Removed"} ${skill.name} ${installed ? "for" : "from"} ${TARGET_INFO[target].label}.`)
    } catch (e) {
      const err = failure(e)
      setError(key, err.message)
      toast(`${skill.name}: ${err.message}`, true)
    } finally {
      await reload()
      mark(key, false)
    }
  }

  const sync = async (list: Row[]) => {
    const keys = list.map((r) => pendingKey(r.skill.id, "sync"))
    keys.forEach((k) => {
      mark(k, true)
      setError(k)
    })
    let failed = 0
    for (const { skill } of list) {
      try {
        await syncFromVps(skill.id)
      } catch (e) {
        failed++
        setError(pendingKey(skill.id, "sync"), failure(e).message)
        if (list.length === 1) toast(`${skill.name}: ${failure(e).message}`, true)
      }
    }
    if (list.length > 1) toast(failed ? `Synced ${list.length - failed} of ${list.length} skills from VPS. ${plural(failed, "skill")} failed.` : `Synced ${plural(list.length, "skill")} from VPS.`, !!failed)
    else if (!failed) toast(`Synced ${list[0].skill.name} from VPS.`)
    await reload()
    keys.forEach((k) => mark(k, false))
    if (list.length > 1 && !failed) setSelected(new Set())
  }

  const requestToggle = (skill: Skill, target: TargetKey, installed: boolean) => {
    const t = skill.targets[target]
    // Removing a real folder deletes files; removing a link does not.
    if (!installed && t?.installed && !isLink(t)) setAsk({ kind: "remove", skill, target })
    else toggle(skill, target, installed)
  }
  const requestSync = (list: Row[]) => {
    if (list.some((r) => r.a.driftCount > 0)) setAsk({ kind: "sync", rows: list })
    else sync(list)
  }

  // ---- Whole-page states ----

  if (!data) {
    if (loading && !error) return <><Header /><TableSkeleton /></>
    return (
      <>
        <Header onRefresh={reload} loading={loading} />
        <Panel><Failure error={error!} retry={reload} loading={loading} /></Panel>
      </>
    )
  }

  const selectedRows = rows.filter((r) => selected.has(r.skill.id))
  const syncable = selectedRows.filter((r) => r.a.source)
  const allVisibleSelected = visible.length > 0 && visible.every((r) => selected.has(r.skill.id))
  const someVisibleSelected = visible.some((r) => selected.has(r.skill.id))
  const open = rows.find((r) => r.skill.id === openId)
  const totalDrift = rows.filter((r) => r.a.driftCount > 0).length

  return (
    <>
      <Header onRefresh={reload} loading={loading} />

      <Freshness machines={machines} at={at} loading={loading} skills={rows.length} drift={totalDrift} />

      {error ? (
        <Alert variant={error.kind === "server" ? "destructive" : "default"} className="mb-4">
          <CircleAlertIcon />
          <AlertTitle>{error.kind === "auth" ? "Your sign-in has ended" : "The list couldn't be refreshed"}</AlertTitle>
          <AlertDescription>
            {error.message} The table shows the server's answer from {at ? time(at) : "earlier"}.
          </AlertDescription>
          <AlertAction>
            <Button size="sm" variant="outline" onClick={reload} disabled={loading}>Try again</Button>
          </AlertAction>
        </Alert>
      ) : null}

      <div className="mb-3 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <InputGroup className="lg:max-w-sm">
          <InputGroupAddon><SearchIcon /></InputGroupAddon>
          <InputGroupInput
            ref={search}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search skills"
            aria-label="Search skills by name, description or category"
            aria-keyshortcuts="/"
          />
          <InputGroupAddon align="inline-end"><kbd className="hidden rounded border px-1.5 font-mono text-[11px] text-muted-foreground sm:inline">/</kbd></InputGroupAddon>
        </InputGroup>
        <ToggleGroup
          variant="outline"
          size="sm"
          value={[filter]}
          onValueChange={(v: unknown[]) => v[0] && setFilter(v[0] as Filter)}
          aria-label="Show"
          className="max-w-full overflow-x-auto"
        >
          {FILTERS.map((f) => (
            <ToggleGroupItem key={f.id} value={f.id} className="gap-1.5 px-3">
              {f.label}
              <span className="tabular text-muted-foreground">{counts[f.id]}</span>
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      {selected.size ? (
        <div role="region" aria-label="Selection" className="sticky top-[4.75rem] z-20 mb-3 md:top-2 flex flex-wrap items-center gap-3 rounded-2xl border bg-popover/95 px-4 py-2.5 text-sm shadow-sm backdrop-blur-xl">
          <span className="font-medium">{plural(selected.size, "skill")} selected</span>
          {syncable.length < selected.size ? (
            <span className="text-muted-foreground">{plural(selected.size - syncable.length, "has", "have")} no VPS copy to sync from</span>
          ) : null}
          <div className="ml-auto flex gap-2">
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>Clear selection</Button>
            <Button size="sm" disabled={!syncable.length || syncable.some((r) => pending.has(pendingKey(r.skill.id, "sync")))} onClick={() => requestSync(syncable)}>
              <RefreshCwIcon data-icon="inline-start" />
              Sync {syncable.length} from VPS
            </Button>
          </div>
        </div>
      ) : null}

      <Panel className="overflow-hidden">
        {rows.length === 0 ? (
          <Nothing title="No skills on any machine" icon={<PlugZapIcon />}>
            The server answered with an empty list. Skills appear here once the backend finds them in a skills folder on the VPS or the Mac.
          </Nothing>
        ) : (
          <Table className="min-w-[760px]">
            <caption className="sr-only">
              Skills and where they are installed. Each checkbox installs or removes a skill for one agent on one machine. The VPS copy is the source.
            </caption>
            <TableHeader className="[&_tr]:border-b-0">
              <TableRow className="hover:bg-transparent">
                <TableHead rowSpan={2} className="w-10 border-b pl-4 align-bottom">
                  <Checkbox
                    aria-label={allVisibleSelected ? "Clear selection of shown skills" : "Select all shown skills"}
                    checked={allVisibleSelected}
                    indeterminate={!allVisibleSelected && someVisibleSelected}
                    disabled={!visible.length}
                    onCheckedChange={(on: boolean) =>
                      setSelected((sel) => {
                        const n = new Set(sel)
                        visible.forEach((r) => (on ? n.add(r.skill.id) : n.delete(r.skill.id)))
                        return n
                      })
                    }
                  />
                </TableHead>
                <TableHead rowSpan={2} className="border-b align-bottom text-muted-foreground">Skill</TableHead>
                <MachineHead m={machines.vps} source />
                <MachineHead m={machines.mac} />
                <TableHead rowSpan={2} className="border-b align-bottom text-muted-foreground">Status</TableHead>
                <TableHead rowSpan={2} className="border-b pr-4 align-bottom"><span className="sr-only">Actions</span></TableHead>
              </TableRow>
              <TableRow className="border-b hover:bg-transparent">
                {TARGETS.map((k) => (
                  <TableHead key={k} id={`col-${k}`} className={cn("h-8 w-[92px] text-center text-xs font-medium text-muted-foreground", colTint(k))}>
                    {TARGET_INFO[k].agent}
                    <span className="sr-only"> on {MACHINE_LABEL[TARGET_INFO[k].machine]}</span>
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((r) => (
                <SkillRow
                  key={r.skill.id}
                  row={r}
                  machines={machines}
                  selected={selected.has(r.skill.id)}
                  onSelect={(on) =>
                    setSelected((sel) => {
                      const n = new Set(sel)
                      if (on) n.add(r.skill.id)
                      else n.delete(r.skill.id)
                      return n
                    })
                  }
                  pending={pending}
                  errors={errors}
                  onToggle={(t, on) => requestToggle(r.skill, t, on)}
                  onSync={() => requestSync([r])}
                  onOpen={() => setOpenId(r.skill.id)}
                />
              ))}
              {visible.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={8} className="whitespace-normal">
                    <Nothing
                      title="No skills match"
                      action={<Button variant="outline" size="sm" onClick={() => { setQuery(""); setFilter("all") }}>Show all skills</Button>}
                    >
                      {q ? <>Nothing matches “{query.trim()}”{filter !== "all" ? " with this filter" : ""}.</> : "No skill fits this filter right now."}
                    </Nothing>
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        )}
      </Panel>

      <Legend />

      <SkillDetails
        row={open}
        machines={machines}
        syncing={!!open && pending.has(pendingKey(open.skill.id, "sync"))}
        syncError={open ? errors[pendingKey(open.skill.id, "sync")] : undefined}
        onSync={() => open && requestSync([open])}
        onOpenChange={(o) => !o && setOpenId(null)}
      />

      <Confirm
        open={ask?.kind === "remove"}
        onOpenChange={(o) => !o && setAsk(null)}
        title={ask?.kind === "remove" ? `Remove ${ask.skill.name} from ${TARGET_INFO[ask.target].label}?` : ""}
        description={
          ask?.kind === "remove" ? (
            <>
              This deletes the skill's folder{ask.skill.targets[ask.target]?.path ? <> at <span className="font-mono break-all">{ask.skill.targets[ask.target]!.path}</span></> : null}. It is a copy, not a link, so any edits made there are lost.
            </>
          ) : null
        }
        action="Remove"
        destructive
        onConfirm={async () => {
          if (ask?.kind === "remove") {
            const { skill, target } = ask
            setAsk(null)
            toggle(skill, target, false)
          }
        }}
      />
      <Confirm
        open={ask?.kind === "sync"}
        onOpenChange={(o) => !o && setAsk(null)}
        title={ask?.kind === "sync" ? (ask.rows.length === 1 ? `Replace copies of ${ask.rows[0].skill.name} with the VPS version?` : `Sync ${plural(ask.rows.length, "skill")} from VPS?`) : ""}
        description={ask?.kind === "sync" ? <SyncSummary rows={ask.rows} /> : null}
        action="Sync from VPS"
        onConfirm={async () => {
          if (ask?.kind === "sync") {
            const list = ask.rows
            setAsk(null)
            sync(list)
          }
        }}
      />
    </>
  )
}

// ---- Pieces ----------------------------------------------------------------

/** The VPS columns carry a faint accent wash: the source rail. */
const colTint = (k: TargetKey) =>
  cn(TARGET_INFO[k].machine === "vps" ? "bg-primary/[0.045] dark:bg-primary/[0.07]" : "", k === "codexVps" || k === "codexMac" ? "border-l" : "")

function Header({ onRefresh, loading }: { onRefresh?: () => void; loading?: boolean }) {
  return (
    <PageHeader title="Skills" description="Where each skill is installed for Codex and Claude. The VPS copy is the source for shared skills; the Mac follows it.">
      {onRefresh ? (
        <Button variant="outline" onClick={onRefresh} disabled={loading}>
          {loading ? <Spinner data-icon="inline-start" /> : <RotateCwIcon data-icon="inline-start" />}
          Refresh
        </Button>
      ) : null}
    </PageHeader>
  )
}

function machineTone(m: MachineState) {
  return m.online === true ? "ok" : m.online === false ? "bad" : "idle"
}
function machineWord(m: MachineState) {
  return m.online === true ? "online" : m.online === false ? "offline" : "status not reported"
}

function MachineHead({ m, source }: { m: MachineState; source?: boolean }) {
  return (
    <TableHead colSpan={2} className={cn("h-9 border-l pt-2 text-center", source && "bg-primary/[0.045] dark:bg-primary/[0.07]")}>
      <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold">
        <Dot tone={machineTone(m)} />
        {MACHINE_LABEL[m.key]}
        {source ? <Badge variant="secondary" className="h-4.5 px-1.5 text-[10px] font-semibold tracking-wide text-primary uppercase">Source</Badge> : null}
        {m.online === false ? <span className="text-xs font-normal text-destructive">offline</span> : <span className="sr-only">, {machineWord(m)}</span>}
      </span>
    </TableHead>
  )
}

function Freshness({ machines, at, loading, skills, drift }: { machines: Record<MachineKey, MachineState>; at?: Date; loading: boolean; skills: number; drift: number }) {
  return (
    <div className="mb-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted-foreground" aria-live="polite">
      {(["vps", "mac"] as const).map((k) => {
        const m = machines[k]
        return (
          <span key={k} className="inline-flex items-center gap-2" title={m.detail || undefined}>
            <Dot tone={machineTone(m)} />
            <span>
              <span className="font-medium text-foreground">{m.label}</span> {machineWord(m)}
              {m.online === false && m.lastSeen ? <> · last seen {when(m.lastSeen)}</> : null}
            </span>
          </span>
        )
      })}
      <span className="tabular">{plural(skills, "skill")}{drift ? <> · <span className="text-warning">{drift} differ from VPS</span></> : null}</span>
      <span className="tabular inline-flex items-center gap-1.5 md:ml-auto">
        {loading ? <><Spinner className="size-3.5" /> Refreshing…</> : at ? <>Live from server · {time(at)}</> : null}
      </span>
    </div>
  )
}

function SkillRow({
  row: { skill, a },
  machines,
  selected,
  onSelect,
  pending,
  errors,
  onToggle,
  onSync,
  onOpen,
}: {
  row: Row
  machines: Record<MachineKey, MachineState>
  selected: boolean
  onSelect: (on: boolean) => void
  pending: Set<string>
  errors: Record<string, string>
  onToggle: (t: TargetKey, on: boolean) => void
  onSync: () => void
  onOpen: () => void
}) {
  const syncing = pending.has(pendingKey(skill.id, "sync"))
  const syncError = errors[pendingKey(skill.id, "sync")]
  const nameId = `skill-${skill.id}`
  return (
    <TableRow data-state={selected ? "selected" : undefined} className="group/row">
      <TableCell className="pl-4">
        <Checkbox checked={selected} onCheckedChange={(on: boolean) => onSelect(on)} aria-label={`Select ${skill.name}`} />
      </TableCell>
      <TableCell className="max-w-[320px] min-w-[180px] py-2.5 whitespace-normal">
        <button type="button" onClick={onOpen} className="group/name -mx-1 flex min-w-0 flex-col items-start rounded-lg px-1 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/40">
          <span className="flex items-center gap-1.5">
            <span id={nameId} className="font-medium whitespace-nowrap group-hover/name:underline">{skill.name}</span>
            {skill.category ? <Badge variant="outline" className="hidden h-5 px-1.5 text-[11px] font-normal text-muted-foreground sm:inline-flex">{skill.category}</Badge> : null}
            <ChevronRightIcon aria-hidden className="size-3.5 text-muted-foreground opacity-0 transition-opacity group-hover/name:opacity-100 group-focus-visible/name:opacity-100" />
          </span>
          {skill.description ? <span className="line-clamp-1 text-[13px] text-muted-foreground">{skill.description}</span> : null}
          <span className="sr-only">Open details and differences</span>
        </button>
      </TableCell>
      {TARGETS.map((k) => (
        <InstallCell
          key={k}
          skill={skill}
          target={k}
          drift={!!a.drift[k]}
          isSource={a.source?.key === k}
          machine={machines[TARGET_INFO[k].machine]}
          pending={pending.has(pendingKey(skill.id, k)) || syncing}
          error={errors[pendingKey(skill.id, k)]}
          onToggle={(on) => onToggle(k, on)}
        />
      ))}
      <TableCell>
        {syncError ? (
          <span title={syncError}><Status tone="bad">Sync failed</Status></span>
        ) : syncing ? (
          <Status tone="on">Syncing</Status>
        ) : skill.status && !(a.driftCount && tone(skill.status) === "ok") ? (
          // The server's word wins, unless it says "fine" while hashes differ.
          <Status state={skill.status} />
        ) : a.driftCount ? (
          <Status tone="warn">{a.driftCount === 1 ? "1 copy differs" : `${a.driftCount} copies differ`}</Status>
        ) : a.source && a.onMac ? (
          <Status tone="ok">Matches VPS</Status>
        ) : a.source ? (
          <Status tone="idle">VPS only</Status>
        ) : a.onMac ? (
          <Status tone="warn">Mac only, no VPS source</Status>
        ) : (
          <Status tone="idle">Not installed</Status>
        )}
      </TableCell>
      <TableCell className="pr-4 text-right">
        <Button
          size="sm"
          variant={a.driftCount ? "secondary" : "ghost"}
          className={cn(!a.driftCount && "text-muted-foreground")}
          disabled={!a.source || syncing}
          title={a.source ? undefined : "There is no VPS copy to sync from."}
          onClick={onSync}
          aria-label={`Sync ${skill.name} from VPS`}
        >
          {syncing ? <Spinner data-icon="inline-start" /> : <RefreshCwIcon data-icon="inline-start" />}
          Sync from VPS
        </Button>
      </TableCell>
    </TableRow>
  )
}

function InstallCell({
  skill,
  target,
  drift,
  isSource,
  machine,
  pending,
  error,
  onToggle,
}: {
  skill: Skill
  target: TargetKey
  drift: boolean
  isSource: boolean
  machine: MachineState
  pending: boolean
  error?: string
  onToggle: (on: boolean) => void
}) {
  const t = skill.targets[target]
  const installed = !!t?.installed
  const link = installed && isLink(t)
  const offline = machine.online === false
  const reported = t !== undefined && t !== null
  const facts = [
    installed ? (link ? "installed as a link" : "installed") : reported ? "not installed" : "not reported",
    isSource ? "VPS source" : "",
    drift ? "differs from VPS" : "",
    t?.version ? `version ${t.version}` : "",
    offline ? `${MACHINE_LABEL[machine.key]} is offline` : "",
    t?.error || error || "",
  ].filter(Boolean)
  const title = [t?.path, ...facts].filter(Boolean).join("\n")
  return (
    <TableCell className={cn("text-center", colTint(target))} title={title}>
      <span className="relative inline-flex h-7 items-center justify-center gap-1.5">
        {pending ? (
          <Spinner className="size-4 text-primary" aria-label={`Updating ${TARGET_INFO[target].label}`} />
        ) : (
          <Checkbox
            checked={installed}
            disabled={offline || !reported}
            aria-invalid={!!error || undefined}
            className="data-disabled:cursor-not-allowed data-disabled:opacity-35"
            aria-label={`${skill.name}, ${TARGET_INFO[target].label}: ${facts.join(", ")}`}
            onCheckedChange={(on: boolean) => onToggle(on)}
          />
        )}
        {/* One mark slot, so the checkbox column stays aligned. */}
        <span aria-hidden className="flex w-3.5 justify-center">
          {error || t?.error ? (
            <CircleAlertIcon className="size-3.5 text-destructive" />
          ) : drift ? (
            <span className="hatch-warning size-3 rounded-[3px] ring-1 ring-warning ring-inset" />
          ) : link ? (
            <LinkIcon className="size-3 text-muted-foreground" />
          ) : null}
        </span>
      </span>
    </TableCell>
  )
}

function SyncSummary({ rows }: { rows: Row[] }) {
  const replaced = rows.flatMap((r) => TARGETS.filter((k) => r.a.drift[k]).map((k) => `${r.skill.name} for ${TARGET_INFO[k].label}`))
  return (
    <span className="flex flex-col gap-2">
      <span>The VPS copy overwrites {replaced.length === 1 ? "a copy that differs" : `${replaced.length} copies that differ`}. Edits made only in those copies are lost.</span>
      <span className="flex flex-col font-mono text-xs">
        {replaced.slice(0, 8).map((x) => <span key={x}>{x}</span>)}
        {replaced.length > 8 ? <span>and {replaced.length - 8} more</span> : null}
      </span>
    </span>
  )
}

function Legend() {
  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 px-1 text-xs text-muted-foreground">
      <span className="inline-flex items-center gap-1.5"><LinkIcon className="size-3" /> Link to another copy</span>
      <span className="inline-flex items-center gap-1.5"><span className="hatch-warning size-3 rounded-[3px] ring-1 ring-warning ring-inset" /> Differs from the VPS copy</span>
      <span className="inline-flex items-center gap-1.5"><CircleAlertIcon className="size-3 text-destructive" /> Last change failed; point at it for details</span>
      <span className="inline-flex items-center gap-1.5"><Dot tone="bad" /> Machine offline: its boxes are locked</span>
    </div>
  )
}

function Failure({ error, retry, loading }: { error: ApiError; retry: () => void; loading: boolean }) {
  const copy = {
    missing: { icon: <PlugZapIcon />, title: "The skills service isn't connected yet", body: "This panel reads GET /api/skills from the server it is served by. That endpoint isn't available, so nothing is shown. The panel never fills in sample data." },
    offline: { icon: <WifiOffIcon />, title: "Can't reach the settings server", body: "The request didn't get an answer. Check that the server is running and this device is online." },
    auth: { icon: <LockIcon />, title: "Sign in to manage skills", body: "The server asked for the owner's sign-in. Open the panel through its signed-in address, then try again." },
    server: { icon: <CircleAlertIcon />, title: "Skills could not be loaded", body: "The server answered with an error." },
  }[error.kind]
  return (
    <div role="alert">
      <Nothing
        title={copy.title}
        icon={copy.icon}
        className="py-14"
        action={
          <Button variant="outline" onClick={retry} disabled={loading}>
            {loading ? <Spinner data-icon="inline-start" /> : null}
            Try again
          </Button>
        }
      >
        <span className="flex flex-col gap-2">
          <span>{copy.body}</span>
          <span className="font-mono text-xs break-all">{error.status ? `${error.status} · ` : ""}{error.message}</span>
        </span>
      </Nothing>
    </div>
  )
}

function TableSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading skills" className="flex flex-col gap-3">
      <Skeleton className="h-5 w-72" />
      <div className="flex gap-3">
        <Skeleton className="h-8 w-80" />
        <Skeleton className="h-8 w-72" />
      </div>
      <Panel className="flex flex-col gap-3 p-4">
        {Array.from({ length: 7 }, (_, i) => (
          <div key={i} className="flex items-center gap-4">
            <Skeleton className="size-4" />
            <Skeleton className="h-4 w-48" />
            <div className="ml-auto flex gap-10">
              {TARGETS.map((k) => <Skeleton key={k} className="size-4" />)}
            </div>
            <Skeleton className="h-6 w-24 rounded-full" />
          </div>
        ))}
      </Panel>
    </div>
  )
}
