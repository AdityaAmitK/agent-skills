import { useEffect, type ReactNode } from "react"
import { CSPProvider } from "@base-ui/react/csp-provider"
import { TooltipProvider } from "@/components/ui/tooltip"
import { routes, Shell } from "@/components/shell"
import { Toaster } from "@/components/toaster"
import { useHashRoute } from "@/lib/hooks"
import { SkillsView } from "@/views/skills"

// Sign-in is enforced by the server in front of this app. The panel holds no
// credentials and shows each API's own 401/403 answer instead of a login form.
const views: Record<string, (args: string[]) => ReactNode> = {
  skills: (args) => <SkillsView args={args} />,
}

export default function App() {
  const parts = useHashRoute()
  const id = routes.some((r) => r.id === parts[0]) ? parts[0] : routes[0].id
  useEffect(() => {
    document.title = `${routes.find((r) => r.id === id)!.label} · T3 Code settings`
  }, [id])
  return (
    // A strict style-src 'self' policy forbids inline <style>, as in the assistant console.
    <CSPProvider disableStyleElements>
      <TooltipProvider>
        <Shell active={id}>
          <div key={id}>{views[id](parts.slice(1))}</div>
        </Shell>
        <Toaster />
      </TooltipProvider>
    </CSPProvider>
  )
}
