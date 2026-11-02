import type { ReactNode } from "react"
import { words } from "@/lib/format"
import { cn } from "@/lib/utils"

export type Tone = "ok" | "on" | "warn" | "bad" | "idle"

const toneOf: [RegExp, Tone][] = [
  [/^(ok|synced|in[ _-]?sync|current|clean|identical|installed|online|ready)$/i, "ok"],
  [/^(pending|syncing|queued|running|checking|working)$/i, "on"],
  [/(drift|differ|stale|outdated|out[ _-]?of[ _-]?sync|partial|modified|unknown|missing)/i, "warn"],
  [/(error|fail|conflict|broken|offline|unreachable)/i, "bad"],
]
export const tone = (state?: string | null): Tone => toneOf.find(([re]) => re.test(state || ""))?.[1] ?? "idle"

const toneClass: Record<Tone, string> = {
  ok: "bg-success/12 text-success",
  on: "bg-primary/12 text-primary",
  warn: "bg-warning/15 text-warning",
  bad: "bg-destructive/12 text-destructive",
  idle: "bg-muted text-muted-foreground",
}
const dotClass: Record<Tone, string> = {
  ok: "bg-success", on: "bg-primary", warn: "bg-warning", bad: "bg-destructive", idle: "bg-muted-foreground/50",
}

// Status pill from the assistant console: a dot plus the word, so state never
// depends on color alone.
export function Status({ state, tone: t, children }: { state?: string | null; tone?: Tone; children?: ReactNode }) {
  const k = t || tone(state)
  return (
    <span className={cn("inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium whitespace-nowrap", toneClass[k])}>
      <span aria-hidden className={cn("size-1.5 rounded-full", dotClass[k])} />
      {children ?? (words(state || "") || "unknown")}
    </span>
  )
}

export function Dot({ tone: t, className }: { tone: Tone; className?: string }) {
  return <span aria-hidden className={cn("inline-block size-2 shrink-0 rounded-full", dotClass[t], className)} />
}
