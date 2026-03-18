import { ProjectIcon, WalletIcon } from "@/components/icons";
import { formatCurrency } from "@/lib/format";

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

const compactCurrencyFormatter = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  notation: "compact",
  maximumFractionDigits: 1,
});

function formatCompactCurrency(value: number) {
  return compactCurrencyFormatter.format(value).replace("Rp", "Rp ");
}

export function DashboardClientBoard({ clients }: DashboardClientBoardProps) {
  if (clients.length === 0) {
    return <div className="empty-state">Belum ada biaya per klien yang bisa ditampilkan.</div>;
  }

  const animationDuration = Math.max(clients.length * 4, 8);

  return (
    <div className="client-slider">
      {/* Client slider: cards animate one by one like turning through a compact project ledger. */}
      <div className="client-slider-track">
        {clients.map((client, index) => (
          <div
            key={client.clientName}
            className="client-slider-item"
          >
            <article
              className={`client-slider-card ${clients.length > 1 ? "client-slider-card--animated" : ""}`}
              style={
                clients.length > 1
                  ? {
                      animationDuration: `${animationDuration}s`,
                      animationDelay: `${index * 4}s`,
                    }
                  : undefined
              }
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-950">{client.clientName}</p>
                  <p className="mt-1 text-[11px] text-slate-500">
                    Rekap biaya per klien dengan kategori terbesar langsung terlihat di satu kartu.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="badge badge-neutral">
                    <ProjectIcon className="h-3.5 w-3.5" />
                    {client.projectCount} project
                  </span>
                  <span className="badge badge-primary">
                    <WalletIcon className="h-3.5 w-3.5" />
                    {formatCompactCurrency(client.totalExpense)}
                  </span>
                </div>
              </div>

              <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-200/80">
                <div
                  className="h-full rounded-full bg-[linear-gradient(90deg,#2563eb_0%,#0f766e_100%)]"
                  style={{ width: `${client.expenseRatio}%` }}
                />
              </div>

              <div className="client-category-grid mt-4">
                {client.categoryTotals.map((category) => (
                  <div key={`${client.clientName}-${category.label}`} className="client-category-pill">
                    <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">
                      {category.label}
                    </p>
                    <p className="mt-1 text-sm font-semibold text-slate-950">
                      {formatCurrency(category.total)}
                    </p>
                  </div>
                ))}
              </div>
            </article>
          </div>
        ))}
      </div>
    </div>
  );
}
