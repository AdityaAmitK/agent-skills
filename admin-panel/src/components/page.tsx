import type { ReactNode } from "react"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { cn } from "@/lib/utils"

// Large-title page header, as in the assistant console: the title names the
// place, the line below says what it is for, actions sit at the trailing edge.
export function PageHeader({ title, description, children }: { title: string; description?: ReactNode; children?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-col gap-4 md:mb-8 md:flex-row md:items-end md:justify-between">
      <div className="min-w-0">
        <h1 className="text-[28px] leading-tight font-bold tracking-tight md:text-[32px]">{title}</h1>
        {description ? <p className="mt-1.5 max-w-[68ch] text-[15px] text-muted-foreground">{description}</p> : null}
      </div>
      {children ? <div className="flex flex-wrap items-center gap-2">{children}</div> : null}
    </header>
  )
}

export function Panel({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("rounded-2xl border bg-card text-card-foreground shadow-xs", className)}>{children}</div>
}

export function Nothing({ title, children, icon, action, className }: { title: string; children?: ReactNode; icon?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <Empty className={cn("py-10", className)}>
      <EmptyHeader>
        {icon ? <EmptyMedia variant="icon">{icon}</EmptyMedia> : null}
        <EmptyTitle>{title}</EmptyTitle>
        {children ? <EmptyDescription>{children}</EmptyDescription> : null}
      </EmptyHeader>
      {action ? <EmptyContent>{action}</EmptyContent> : null}
    </Empty>
  )
}
