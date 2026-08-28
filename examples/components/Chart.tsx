// Bars with a scale beside them. Bars can grow, fill, feed in, or be measured out, and the
// axis labels give the motion something to be timed against rather than just easing.
export function Chart() {
  return (
    <div className="w-[680px] rounded-xl border border-border bg-card p-6">
      <div className="flex items-baseline justify-between">
        <p className="text-sm font-semibold text-card-foreground">Weekly throughput</p>
        <p className="text-xs text-muted-foreground">units per day</p>
      </div>
      <div className="mt-6 flex h-[200px] items-end gap-4">
        <div className="flex h-full flex-1 flex-col justify-end"><div className="h-[64%] w-full rounded-t bg-primary"></div></div>
        <div className="flex h-full flex-1 flex-col justify-end"><div className="h-[82%] w-full rounded-t bg-primary"></div></div>
        <div className="flex h-full flex-1 flex-col justify-end"><div className="h-[48%] w-full rounded-t bg-primary"></div></div>
        <div className="flex h-full flex-1 flex-col justify-end"><div className="h-[95%] w-full rounded-t bg-primary"></div></div>
        <div className="flex h-full flex-1 flex-col justify-end"><div className="h-[71%] w-full rounded-t bg-primary"></div></div>
        <div className="flex h-full flex-1 flex-col justify-end"><div className="h-[38%] w-full rounded-t bg-muted"></div></div>
        <div className="flex h-full flex-1 flex-col justify-end"><div className="h-[22%] w-full rounded-t bg-muted"></div></div>
      </div>
      <div className="mt-3 flex gap-4 text-center text-xs text-muted-foreground">
        <span className="flex-1">Mon</span><span className="flex-1">Tue</span><span className="flex-1">Wed</span>
        <span className="flex-1">Thu</span><span className="flex-1">Fri</span><span className="flex-1">Sat</span><span className="flex-1">Sun</span>
      </div>
    </div>
  )
}
