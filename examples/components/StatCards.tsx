// Four figures in a row. The stagger is the point: anything that arrives left to right,
// or counts up, or draws a rule under each label, has four things to do it to.
export function StatCards() {
  return (
    <div className="grid w-[880px] grid-cols-4 gap-4">
      <div className="rounded-xl border border-border bg-card p-5">
        <p className="text-xs font-medium text-muted-foreground">Total Revenue</p>
        <p className="mt-2 text-2xl font-semibold text-card-foreground">$45,231.89</p>
        <p className="mt-1 text-xs text-muted-foreground">+20.1% from last month</p>
      </div>
      <div className="rounded-xl border border-border bg-card p-5">
        <p className="text-xs font-medium text-muted-foreground">Subscriptions</p>
        <p className="mt-2 text-2xl font-semibold text-card-foreground">+2,350</p>
        <p className="mt-1 text-xs text-muted-foreground">+180.1% from last month</p>
      </div>
      <div className="rounded-xl border border-border bg-card p-5">
        <p className="text-xs font-medium text-muted-foreground">Sales</p>
        <p className="mt-2 text-2xl font-semibold text-card-foreground">+12,234</p>
        <p className="mt-1 text-xs text-muted-foreground">+19% from last month</p>
      </div>
      <div className="rounded-xl border border-border bg-card p-5">
        <p className="text-xs font-medium text-muted-foreground">Active Now</p>
        <p className="mt-2 text-2xl font-semibold text-card-foreground">+573</p>
        <p className="mt-1 text-xs text-muted-foreground">+201 since last hour</p>
      </div>
    </div>
  )
}
