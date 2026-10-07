import { ProjectIcon, WalletIcon } from "@/components/icons";
import { formatCompactCurrency, formatCurrency } from "@/lib/format";

export type DashboardClientBoardItem = {
  clientName: string;
  projectCount: number;
  totalExpense: number;
  expenseRatio: number;
  categoryTotals: Array<{
    label: string;
    total: number;
  }>;
};

type DashboardClientBoardProps = {
  clients: DashboardClientBoardItem[];
};

export function DashboardClientBoard({ clients }: DashboardClientBoardProps) {
  if (clients.length === 0) {
    return <div className="empty-state">Belum ada biaya per klien yang bisa ditampilkan.</div>;
  }

  return (
    <div className="dashboard-client-grid">
      {clients.map((client, index) => (
        <article className="dashboard-client-card" key={client.clientName}>
          <div className="flex min-w-0 items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <span className="dashboard-client-card__rank">{String(index + 1).padStart(2, "0")}</span>
              <div className="min-w-0">
                <h3 className="truncate text-sm font-bold text-slate-900" title={client.clientName}>
                  {client.clientName}
                </h3>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                  <span className="inline-flex items-center gap-1.5">
                    <ProjectIcon className="h-3.5 w-3.5" />
                    {client.projectCount} project
                  </span>
                  <span className="inline-flex items-center gap-1.5 font-semibold text-slate-800">
                    <WalletIcon className="h-3.5 w-3.5" />
                    {formatCompactCurrency(client.totalExpense)}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div
            className="dashboard-client-card__progress mt-3"
            role="progressbar"
            aria-label={`Perbandingan biaya ${client.clientName}`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={client.expenseRatio}
          >
            <span style={{ width: `${client.expenseRatio}%` }} />
          </div>

          <div className="dashboard-client-card__categories mt-3">
            {client.categoryTotals.map((category) => (
              <div className="dashboard-client-card__category" key={`${client.clientName}-${category.label}`}>
                <span>{category.label}</span>
                <strong>{formatCurrency(category.total)}</strong>
              </div>
            ))}
          </div>
        </article>
      ))}
    </div>
  );
}
