// Rows, a header, and status pills. Rows are the classic thing to feed in one at a time,
// and the pills give a second, later beat to land on.
export function DataTable() {
  return (
    <div className="w-[760px] overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <p className="text-sm font-semibold text-card-foreground">Invoices</p>
        <span className="rounded-md border border-border px-2.5 py-1 text-xs text-muted-foreground">Last 30 days</span>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border">
            <th className="px-5 py-3 text-left text-xs font-medium text-muted-foreground">Invoice</th>
            <th className="px-5 py-3 text-left text-xs font-medium text-muted-foreground">Customer</th>
            <th className="px-5 py-3 text-left text-xs font-medium text-muted-foreground">Status</th>
            <th className="px-5 py-3 text-right text-xs font-medium text-muted-foreground">Amount</th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-b border-border">
            <td className="px-5 py-3.5 font-medium text-card-foreground">INV-1001</td>
            <td className="px-5 py-3.5 text-muted-foreground">Olivia Martin</td>
            <td className="px-5 py-3.5"><span className="rounded-full bg-primary px-2.5 py-0.5 text-xs text-primary-foreground">Paid</span></td>
            <td className="px-5 py-3.5 text-right text-card-foreground">$250.00</td>
          </tr>
          <tr className="border-b border-border">
            <td className="px-5 py-3.5 font-medium text-card-foreground">INV-1002</td>
            <td className="px-5 py-3.5 text-muted-foreground">Jackson Lee</td>
            <td className="px-5 py-3.5"><span className="rounded-full bg-muted px-2.5 py-0.5 text-xs text-muted-foreground">Pending</span></td>
            <td className="px-5 py-3.5 text-right text-card-foreground">$150.00</td>
          </tr>
          <tr className="border-b border-border">
            <td className="px-5 py-3.5 font-medium text-card-foreground">INV-1003</td>
            <td className="px-5 py-3.5 text-muted-foreground">Isabella Nguyen</td>
            <td className="px-5 py-3.5"><span className="rounded-full bg-destructive px-2.5 py-0.5 text-xs text-destructive-foreground">Unpaid</span></td>
            <td className="px-5 py-3.5 text-right text-card-foreground">$350.00</td>
          </tr>
          <tr className="border-b border-border">
            <td className="px-5 py-3.5 font-medium text-card-foreground">INV-1004</td>
            <td className="px-5 py-3.5 text-muted-foreground">William Kim</td>
            <td className="px-5 py-3.5"><span className="rounded-full bg-primary px-2.5 py-0.5 text-xs text-primary-foreground">Paid</span></td>
            <td className="px-5 py-3.5 text-right text-card-foreground">$99.00</td>
          </tr>
          <tr>
            <td className="px-5 py-3.5 font-medium text-card-foreground">INV-1005</td>
            <td className="px-5 py-3.5 text-muted-foreground">Sofia Davis</td>
            <td className="px-5 py-3.5"><span className="rounded-full bg-muted px-2.5 py-0.5 text-xs text-muted-foreground">Pending</span></td>
            <td className="px-5 py-3.5 text-right text-card-foreground">$1,250.00</td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}
