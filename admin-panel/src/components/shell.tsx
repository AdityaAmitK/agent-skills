import type { ReactNode } from "react"
import { BlocksIcon, SlidersHorizontalIcon, type LucideIcon } from "lucide-react"
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
} from "@/components/ui/sidebar"
import { cn } from "@/lib/utils"

// Every settings area is one entry here plus one view in App.tsx. Add an entry
// only when its view exists, so the navigation never leads to a dead end.
export type Route = { id: string; label: string; icon: LucideIcon; group: string }
export const routes: Route[] = [{ id: "skills", label: "Skills", icon: BlocksIcon, group: "Agents" }]

export function Shell({ active, children }: { active: string; children: ReactNode }) {
  const groups = [...new Set(routes.map((r) => r.group))]
  return (
    <SidebarProvider>
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-lg focus:bg-background focus:px-3 focus:py-2">Skip to content</a>
      <Sidebar collapsible="none" className="sticky top-0 hidden h-svh border-r md:flex">
        <SidebarHeader className="px-4 pt-5 pb-3">
          <Brand />
        </SidebarHeader>
        <SidebarContent>
          {groups.map((g) => (
            <SidebarGroup key={g}>
              <SidebarGroupLabel>{g}</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {routes.filter((r) => r.group === g).map((r) => (
                    <SidebarMenuItem key={r.id}>
                      <SidebarMenuButton size="lg" className="h-10" isActive={r.id === active} render={<a href={`#/${r.id}`} aria-current={r.id === active ? "page" : undefined} />}>
                        <r.icon />
                        <span>{r.label}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          ))}
        </SidebarContent>
      </Sidebar>

      <SidebarInset className="min-w-0 bg-background">
        {/* Phones: brand plus the areas as a scrolling row. */}
        <header className="sticky top-0 z-30 flex flex-col gap-2 border-b bg-background/85 px-4 pt-3 pb-2 backdrop-blur-xl md:hidden">
          <Brand />
          {routes.length > 1 ? (
            <nav aria-label="Settings areas" className="-mx-1 flex gap-1 overflow-x-auto">
              {routes.map((r) => (
                <a key={r.id} href={`#/${r.id}`} aria-current={r.id === active ? "page" : undefined} className={cn("flex h-11 items-center gap-2 rounded-xl px-3 text-sm whitespace-nowrap", r.id === active ? "bg-accent font-medium text-accent-foreground" : "text-muted-foreground")}>
                  <r.icon className="size-4" /> {r.label}
                </a>
              ))}
            </nav>
          ) : null}
        </header>
        <main id="main" tabIndex={-1} className="mx-auto w-full max-w-6xl px-4 pt-6 pb-16 outline-none md:px-8 md:pt-10">
          {children}
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}

function Brand() {
  return (
    <div className="flex items-center gap-2.5">
      <span className="flex size-8 items-center justify-center rounded-xl bg-primary text-primary-foreground">
        <SlidersHorizontalIcon className="size-4.5" />
      </span>
      <div className="leading-tight">
        <div className="text-[15px] font-semibold">T3 Code</div>
        <div className="text-xs text-muted-foreground">Settings</div>
      </div>
    </div>
  )
}
