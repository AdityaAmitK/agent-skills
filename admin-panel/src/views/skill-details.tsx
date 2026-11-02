import { useEffect, useMemo, useState } from "react"
import { CircleAlertIcon, LinkIcon, RefreshCwIcon } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { Dot, Status } from "@/components/status"
import { api, failure, type ApiError } from "@/lib/api"
import { shortHash } from "@/lib/format"
import { enc, isLink, MACHINE_LABEL, normalizeDiff, TARGET_INFO, TARGETS, type Analysis, type MachineKey, type MachineState, type Skill } from "@/lib/skills"
import { cn } from "@/lib/utils"

type Row = { skill: Skill; a: Analysis }

export function SkillDetails({
  row,
  machines,
  syncing,
  syncError,
  onSync,
  onOpenChange,
}: {
  row?: Row
  machines: Record<MachineKey, MachineState>
  syncing: boolean
  syncError?: string
  onSync: () => void
  onOpenChange: (open: boolean) => void
}) {
  // Keep the last row while the sheet animates closed.
  const [shown, setShown] = useState<Row | undefined>(row)
  useEffect(() => {
    if (row) setShown(row)
  }, [row])
  const r = row || shown
  return (
    <Sheet open={!!row} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full data-[side=right]:w-full data-[side=right]:sm:max-w-xl">
        {r ? <Body row={r} machines={machines} syncing={syncing} syncError={syncError} onSync={onSync} live={!!row} /> : <SheetTitle className="sr-only">Skill details</SheetTitle>}
      </SheetContent>
    </Sheet>
  )
}

function Body({ row: { skill, a }, machines, syncing, syncError, onSync, live }: { row: Row; machines: Record<MachineKey, MachineState>; syncing: boolean; syncError?: string; onSync: () => void; live: boolean }) {
  // Re-read the diff whenever the server reports different contents.
  const signature = TARGETS.map((k) => `${skill.targets[k]?.installed ? 1 : 0}${skill.targets[k]?.hash || ""}${skill.targets[k]?.version || ""}`).join("|")
  const [diff, setDiff] = useState<{ loading: boolean; data?: unknown; error?: ApiError }>({ loading: true })
  const [nonce, setNonce] = useState(0)
  useEffect(() => {
    if (!live) return
    let gone = false
    setDiff((d) => ({ ...d, loading: true }))
    api<unknown>(`/api/skills/${enc(skill.id)}/diff`).then(
      (data) => !gone && setDiff({ loading: false, data }),
      (e) => !gone && setDiff({ loading: false, error: failure(e) }),
    )
    return () => {
      gone = true
    }
  }, [skill.id, signature, nonce, live])
  const parsed = useMemo(() => (diff.data === undefined ? null : normalizeDiff(diff.data)), [diff.data])

  return (
    <>
      <SheetHeader className="gap-2 border-b pb-4">
        <div className="flex flex-wrap items-center gap-2 pr-8">
          <SheetTitle className="text-xl font-semibold tracking-tight">{skill.name}</SheetTitle>
          {skill.category ? <Badge variant="outline">{skill.category}</Badge> : null}
          {skill.status ? <Status state={skill.status} /> : null}
        </div>
        <SheetDescription>{skill.description || "No description in this skill's SKILL.md."}</SheetDescription>
        <p className="font-mono text-xs text-muted-foreground">id {skill.id}</p>
      </SheetHeader>

      <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-4 py-5">
        <section aria-labelledby="copies-h">
          <h3 id="copies-h" className="mb-2 text-[13px] font-semibold tracking-wide text-muted-foreground uppercase">Copies</h3>
          <ul className="flex flex-col divide-y rounded-2xl border">
            {TARGETS.map((k) => {
              const t = skill.targets[k]
              const m = machines[TARGET_INFO[k].machine]
              const source = a.source?.key === k
              return (
                <li key={k} className={cn("flex flex-col gap-1 px-3.5 py-3", TARGET_INFO[k].machine === "vps" && "bg-primary/[0.035]")}>
                  <div className="flex items-center gap-2">
                    <Dot tone={m.online === false ? "bad" : t?.installed ? "ok" : "idle"} />
                    <span className="font-medium">{TARGET_INFO[k].label}</span>
                    {source ? <Badge variant="secondary" className="text-primary">Source</Badge> : null}
                    {isLink(t) && t?.installed ? <Badge variant="outline"><LinkIcon data-icon="inline-start" />Link</Badge> : null}
                    {a.drift[k] ? <Status tone="warn">Differs</Status> : null}
                    <span className="ml-auto text-xs text-muted-foreground">
                      {m.online === false ? `${MACHINE_LABEL[m.key]} offline` : t == null ? "Not reported" : t.installed ? (t.kind || "installed") : "Not installed"}
                    </span>
                  </div>
                  {t?.installed || t?.path ? (
                    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 pl-4 font-mono text-xs text-muted-foreground">
                      {t?.path ? <><dt>path</dt><dd className="break-all text-foreground">{t.path}</dd></> : null}
                      {t?.linkTarget ? <><dt>links to</dt><dd className="break-all">{t.linkTarget}</dd></> : null}
                      {t?.version ? <><dt>version</dt><dd className={cn(a.drift[k] && "text-warning")}>{t.version}</dd></> : null}
                      {t?.hash ? <><dt>hash</dt><dd className={cn(a.drift[k] && "text-warning")} title={t.hash}>{shortHash(t.hash)}</dd></> : null}
                    </dl>
                  ) : null}
                  {t?.error ? <p className="pl-4 text-xs text-destructive">{t.error}</p> : null}
                </li>
              )
            })}
          </ul>
        </section>

        <Separator />

        {skill.copies && skill.copies.length > 1 ? (
          <section aria-label="All discovered copies">
            <h3 className="mb-2 text-sm font-semibold">All discovered copies</h3>
            <ul className="space-y-3 text-xs">
              {skill.copies.map((copy) => <li key={`${copy.target}:${copy.path}`}>
                <p>{copy.target} · {copy.origin}{copy.broken ? " · broken link" : ""}</p>
                <p className="break-all font-mono text-muted-foreground">{copy.path}</p>
                {copy.hash ? <p className="font-mono text-muted-foreground">{copy.hash.slice(0, 16)}</p> : null}
              </li>)}
            </ul>
          </section>
        ) : null}

        <section aria-labelledby="diff-h" aria-busy={diff.loading}>
          <div className="mb-2 flex items-center justify-between gap-2">
            <h3 id="diff-h" className="text-[13px] font-semibold tracking-wide text-muted-foreground uppercase">Difference from VPS</h3>
            {diff.loading && diff.data !== undefined ? <Spinner className="size-3.5 text-muted-foreground" /> : null}
          </div>
          {diff.error ? (
            <Alert>
              <CircleAlertIcon />
              <AlertTitle>{diff.error.kind === "missing" ? "The server doesn't provide diffs yet" : "The diff couldn't be loaded"}</AlertTitle>
              <AlertDescription className="flex flex-col items-start gap-2">
                <span className="font-mono text-xs break-all">{diff.error.message}</span>
                <Button size="xs" variant="outline" onClick={() => setNonce((n) => n + 1)}>Try again</Button>
              </AlertDescription>
            </Alert>
          ) : diff.loading && diff.data === undefined ? (
            <div className="flex flex-col gap-1.5"><Skeleton className="h-4 w-3/4" /><Skeleton className="h-4 w-1/2" /><Skeleton className="h-4 w-2/3" /></div>
          ) : parsed?.identical ? (
            <p className="text-sm text-muted-foreground">Every installed copy matches the VPS source.</p>
          ) : (
            <div className="flex flex-col gap-3">
              {parsed?.sections.map((s, i) => (
                <figure key={i} className="overflow-hidden rounded-xl border">
                  {s.title ? <figcaption className="border-b bg-muted px-3 py-1.5 font-mono text-xs">{s.title}</figcaption> : null}
                  <DiffText text={s.text} />
                </figure>
              ))}
            </div>
          )}
        </section>
      </div>

      <SheetFooter className="border-t">
        {syncError ? <p role="alert" className="text-sm text-destructive">Sync failed: {syncError}</p> : null}
        <Button onClick={onSync} disabled={!a.source || skill.canSync === false || syncing}>
          {syncing ? <Spinner data-icon="inline-start" /> : <RefreshCwIcon data-icon="inline-start" />}
          Sync from VPS
        </Button>
        {!a.source ? <p className="text-xs text-muted-foreground">There is no VPS copy to sync from.</p> : null}
      </SheetFooter>
    </>
  )
}

function DiffText({ text }: { text: string }) {
  const lines = text.replace(/\n$/, "").split("\n")
  return (
    <pre className="max-h-[50vh] overflow-auto py-1.5 font-mono text-xs leading-5">
      {lines.map((l, i) => {
        const add = l.startsWith("+") && !l.startsWith("+++")
        const del = l.startsWith("-") && !l.startsWith("---")
        const hunk = l.startsWith("@@")
        const head = /^(diff |index |\+\+\+|---|Only in )/.test(l)
        return (
          <span
            key={i}
            className={cn(
              "block px-3 whitespace-pre",
              add && "bg-success/12 text-success",
              del && "bg-destructive/10 text-destructive",
              hunk && "text-primary",
              head && "font-semibold text-muted-foreground",
            )}
          >
            {l || " "}
            <span className="sr-only">{add ? " (added)" : del ? " (removed)" : ""}</span>
          </span>
        )
      })}
    </pre>
  )
}
