import { useEffect, useState } from "react"
import { CircleAlertIcon, CircleCheckIcon } from "lucide-react"
import { cn } from "@/lib/utils"

// A small toast queue. (Toast libraries that inject <style> tags break under
// the panel's strict style-src 'self' policy.)
type Toast = { id: number; message: string; bad?: boolean }
let next = 1
let items: Toast[] = []
const subs = new Set<(t: Toast[]) => void>()
const emit = () => subs.forEach((fn) => fn(items))

export function toast(message: string, bad?: boolean) {
  const t = { id: next++, message, bad }
  items = [...items, t]
  emit()
  setTimeout(() => {
    items = items.filter((x) => x.id !== t.id)
    emit()
  }, bad ? 8000 : 4000)
}

export function Toaster() {
  const [list, setList] = useState<Toast[]>(items)
  useEffect(() => {
    subs.add(setList)
    return () => void subs.delete(setList)
  }, [])
  return (
    <div role="status" aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-6 z-[60] flex flex-col items-center gap-2 px-4 md:bottom-6 md:items-end md:px-6">
      {list.map((t) => (
        <div
          key={t.id}
          className={cn(
            "pointer-events-auto flex max-w-md items-start gap-2.5 rounded-2xl border bg-popover/95 px-4 py-3 text-sm text-popover-foreground shadow-lg backdrop-blur-xl animate-in fade-in slide-in-from-bottom-2",
            t.bad && "border-destructive/40",
          )}
        >
          {t.bad ? <CircleAlertIcon className="mt-0.5 size-4 shrink-0 text-destructive" /> : <CircleCheckIcon className="mt-0.5 size-4 shrink-0 text-success" />}
          <span>{t.message}</span>
        </div>
      ))}
    </div>
  )
}
