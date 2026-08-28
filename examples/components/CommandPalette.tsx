// A palette is the best thing in here to animate: it has an entrance, a caret, grouped
// results that can arrive in order, and a highlighted row that can travel down the list.
export function CommandPalette() {
  return (
    <div className="w-[560px] overflow-hidden rounded-xl border border-border bg-popover shadow-2xl">
      <div className="flex items-center gap-3 border-b border-border px-4 py-3.5">
        <span className="h-4 w-4 rounded-full border-2 border-muted-foreground"></span>
        <span className="text-sm text-muted-foreground">Search projects, people, settings</span>
        <span className="ml-auto rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground">ESC</span>
      </div>
      <div className="px-2 py-2">
        <p className="px-3 py-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Projects</p>
        <div className="flex items-center gap-3 rounded-lg bg-accent px-3 py-2.5">
          <span className="h-5 w-5 rounded bg-primary"></span>
          <span className="text-sm text-accent-foreground">Orbital ingest pipeline</span>
          <span className="ml-auto text-xs text-muted-foreground">Open</span>
        </div>
        <div className="flex items-center gap-3 rounded-lg px-3 py-2.5">
          <span className="h-5 w-5 rounded bg-muted"></span>
          <span className="text-sm text-popover-foreground">Ledger reconciliation</span>
        </div>
        <div className="flex items-center gap-3 rounded-lg px-3 py-2.5">
          <span className="h-5 w-5 rounded bg-muted"></span>
          <span className="text-sm text-popover-foreground">Tide table generator</span>
        </div>
        <p className="mt-2 px-3 py-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">People</p>
        <div className="flex items-center gap-3 rounded-lg px-3 py-2.5">
          <span className="h-5 w-5 rounded-full bg-muted"></span>
          <span className="text-sm text-popover-foreground">Amina Okafor</span>
        </div>
        <div className="flex items-center gap-3 rounded-lg px-3 py-2.5">
          <span className="h-5 w-5 rounded-full bg-muted"></span>
          <span className="text-sm text-popover-foreground">Rafael Sousa</span>
        </div>
      </div>
    </div>
  )
}
