// Three tiers with a featured one. Good for anything that compares: the middle card can
// rise while the others settle, and the feature lists give a per-line beat underneath.
export function Pricing() {
  return (
    <div className="grid w-[840px] grid-cols-3 gap-5">
      <div className="rounded-xl border border-border bg-card p-6">
        <p className="text-sm font-medium text-muted-foreground">Hobby</p>
        <p className="mt-3 text-3xl font-semibold text-card-foreground">$0</p>
        <p className="mt-1 text-xs text-muted-foreground">per month</p>
        <div className="mt-5 space-y-2.5">
          <p className="text-sm text-muted-foreground">One project</p>
          <p className="text-sm text-muted-foreground">Community support</p>
          <p className="text-sm text-muted-foreground">1 GB storage</p>
        </div>
        <div className="mt-6 rounded-lg border border-border py-2 text-center text-sm text-card-foreground">Start free</div>
      </div>
      <div className="rounded-xl border-2 border-primary bg-card p-6">
        <p className="text-sm font-medium text-primary">Studio</p>
        <p className="mt-3 text-3xl font-semibold text-card-foreground">$24</p>
        <p className="mt-1 text-xs text-muted-foreground">per month</p>
        <div className="mt-5 space-y-2.5">
          <p className="text-sm text-card-foreground">Unlimited projects</p>
          <p className="text-sm text-card-foreground">Priority support</p>
          <p className="text-sm text-card-foreground">100 GB storage</p>
          <p className="text-sm text-card-foreground">Custom domains</p>
        </div>
        <div className="mt-6 rounded-lg bg-primary py-2 text-center text-sm font-medium text-primary-foreground">Choose Studio</div>
      </div>
      <div className="rounded-xl border border-border bg-card p-6">
        <p className="text-sm font-medium text-muted-foreground">Company</p>
        <p className="mt-3 text-3xl font-semibold text-card-foreground">$96</p>
        <p className="mt-1 text-xs text-muted-foreground">per month</p>
        <div className="mt-5 space-y-2.5">
          <p className="text-sm text-muted-foreground">Everything in Studio</p>
          <p className="text-sm text-muted-foreground">SSO and audit log</p>
          <p className="text-sm text-muted-foreground">1 TB storage</p>
        </div>
        <div className="mt-6 rounded-lg border border-border py-2 text-center text-sm text-card-foreground">Talk to us</div>
      </div>
    </div>
  )
}
