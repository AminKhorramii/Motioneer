// An activity feed with a connector running down it. The line is the interesting part:
// it can draw itself top to bottom and hand each entry in as it passes.
export function Timeline() {
  return (
    <div className="w-[560px] rounded-xl border border-border bg-card p-6">
      <p className="text-sm font-semibold text-card-foreground">Activity</p>
      <div className="mt-5 space-y-5">
        <div className="flex gap-4">
          <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-primary"></span>
          <div>
            <p className="text-sm text-card-foreground">Amina deployed <span className="font-medium">ingest@4.2.0</span></p>
            <p className="mt-1 text-xs text-muted-foreground">Today at 09:14</p>
          </div>
        </div>
        <div className="flex gap-4">
          <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-muted"></span>
          <div>
            <p className="text-sm text-card-foreground">Rafael closed <span className="font-medium">ENG-231</span></p>
            <p className="mt-1 text-xs text-muted-foreground">Today at 08:02</p>
          </div>
        </div>
        <div className="flex gap-4">
          <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-muted"></span>
          <div>
            <p className="text-sm text-card-foreground">Nightly bench finished, 8 of 8 kept</p>
            <p className="mt-1 text-xs text-muted-foreground">Yesterday at 23:40</p>
          </div>
        </div>
        <div className="flex gap-4">
          <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-muted"></span>
          <div>
            <p className="text-sm text-card-foreground">Sofia opened <span className="font-medium">ENG-240</span></p>
            <p className="mt-1 text-xs text-muted-foreground">Yesterday at 17:26</p>
          </div>
        </div>
      </div>
    </div>
  )
}
