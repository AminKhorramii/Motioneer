// Three columns of cards. Cards are the one shape everybody already expects to move,
// so this is where a motion either reads as considered or reads as a generic slide.
export function Kanban() {
  return (
    <div className="grid w-[840px] grid-cols-3 gap-4">
      <div className="rounded-xl border border-border bg-card p-3">
        <div className="flex items-center justify-between px-2 py-1.5">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Backlog</p>
          <span className="text-xs text-muted-foreground">3</span>
        </div>
        <div className="mt-2 space-y-2">
          <div className="rounded-lg border border-border bg-background p-3">
            <p className="text-sm text-foreground">Rewrite the ingest worker</p>
            <p className="mt-2 text-xs text-muted-foreground">ENG-204</p>
          </div>
          <div className="rounded-lg border border-border bg-background p-3">
            <p className="text-sm text-foreground">Audit the slop catalogue</p>
            <p className="mt-2 text-xs text-muted-foreground">ENG-211</p>
          </div>
          <div className="rounded-lg border border-border bg-background p-3">
            <p className="text-sm text-foreground">Tide table export</p>
            <p className="mt-2 text-xs text-muted-foreground">ENG-219</p>
          </div>
        </div>
      </div>
      <div className="rounded-xl border border-border bg-card p-3">
        <div className="flex items-center justify-between px-2 py-1.5">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">In progress</p>
          <span className="text-xs text-muted-foreground">2</span>
        </div>
        <div className="mt-2 space-y-2">
          <div className="rounded-lg border border-border bg-background p-3">
            <p className="text-sm text-foreground">Frame by frame renderer</p>
            <p className="mt-2 text-xs text-muted-foreground">ENG-188</p>
          </div>
          <div className="rounded-lg border border-border bg-background p-3">
            <p className="text-sm text-foreground">Scope read from the sheet</p>
            <p className="mt-2 text-xs text-muted-foreground">ENG-231</p>
          </div>
        </div>
      </div>
      <div className="rounded-xl border border-border bg-card p-3">
        <div className="flex items-center justify-between px-2 py-1.5">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Done</p>
          <span className="text-xs text-muted-foreground">2</span>
        </div>
        <div className="mt-2 space-y-2">
          <div className="rounded-lg border border-border bg-background p-3">
            <p className="text-sm text-muted-foreground">Camera pass</p>
            <p className="mt-2 text-xs text-muted-foreground">ENG-176</p>
          </div>
          <div className="rounded-lg border border-border bg-background p-3">
            <p className="text-sm text-muted-foreground">Contrast measured, not guessed</p>
            <p className="mt-2 text-xs text-muted-foreground">ENG-140</p>
          </div>
        </div>
      </div>
    </div>
  )
}
