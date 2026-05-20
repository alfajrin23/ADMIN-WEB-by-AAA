import { DashboardCharts } from "@/components/dashboard-charts";
import { DashboardClientBoard } from "@/components/dashboard-client-board";
import { DashboardProjectExpenseList } from "@/components/dashboard-project-expense-list";
import {
  CashInIcon,
  ProjectIcon,
  TrendUpIcon,
  UsersIcon,
} from "@/components/icons";
import { requireAuthUser } from "@/lib/auth";
import { getDashboardData } from "@/lib/data";
import { formatCompactCurrency } from "@/lib/format";
import { activeDataSource, getStorageLabel } from "@/lib/storage";

export default async function DashboardPage() {
  await requireAuthUser();
  const dashboard = await getDashboardData();
  const budgetScopeLabel = "Semua Project";

  const clientRowsBase = dashboard.categoryTotalsByClient
    .map((client) => ({
      clientName: client.clientName,
      projectCount: client.projectCount,
      totalExpense: client.totalExpense,
      categoryTotals: client.categoryTotals
        .filter((item) => item.total > 0)
        .slice()
        .sort((a, b) => b.total - a.total)
        .slice(0, 4)
        .map((item) => ({
          label: item.label,
          total: item.total,
        })),
    }))
    .filter((client) => client.totalExpense > 0)
    .sort((a, b) => {
      if (b.totalExpense !== a.totalExpense) {
        return b.totalExpense - a.totalExpense;
      }
      return a.clientName.localeCompare(b.clientName, "id-ID");
    })
    .slice(0, 6);

  const maxClientExpense = clientRowsBase[0]?.totalExpense ?? 0;
  const clientRows = clientRowsBase.map((client) => ({
    ...client,
    expenseRatio: maxClientExpense
      ? Math.max(12, Math.round((client.totalExpense / maxClientExpense) * 100))
      : 0,
  }));

  const projectExpenseRows = dashboard.projectExpenseTotals
    .filter((item) => item.totalExpense > 0)
    .slice()
    .sort((a, b) => {
      if (b.totalExpense !== a.totalExpense) {
        return b.totalExpense - a.totalExpense;
      }
      return a.projectName.localeCompare(b.projectName, "id-ID");
    });

  const summaryCards = [
    {
      key: "month-expense",
      label: "Pengeluaran Bulan Ini",
      value: formatCompactCurrency(dashboard.monthExpense),
      note: "Ritme biaya bulan berjalan untuk memantau laju cash out.",
      accent: "amber",
      icon: <TrendUpIcon className="h-4 w-4" />,
      chip: `${budgetScopeLabel}`,
    },
    {
      key: "active-projects",
      label: "Project Aktif",
      value: dashboard.activeProjects.toLocaleString("id-ID"),
      note: `${dashboard.totalProjects.toLocaleString("id-ID")} total project tercatat di sistem.`,
      accent: "blue",
      icon: <ProjectIcon className="h-4 w-4" />,
      chip: "Status lapangan",
    },
    {
      key: "active-workers",
      label: "Pekerja Aktif",
      value: dashboard.activeWorkers.toLocaleString("id-ID"),
      note: "Ringkasan tenaga kerja aktif dari absensi terbaru.",
      accent: "emerald",
      icon: <UsersIcon className="h-4 w-4" />,
      chip: "Absensi aktif",
    },
    {
      key: "kasbon",
      label: "Total Kasbon",
      value: formatCompactCurrency(dashboard.totalKasbon),
      note: "Akumulasi kasbon pekerja yang sudah masuk ke sistem.",
      accent: "slate",
      icon: <CashInIcon className="h-4 w-4" />,
      chip: "Kasbon berjalan",
    },
  ] as const;

  return (
    <div className="space-y-4">
      {activeDataSource === "demo" ? (
        <section className="panel border-amber-300 bg-amber-50 p-3.5">
          <p className="text-sm text-amber-700">
            Mode demo aktif. Isi env Supabase untuk menyimpan data ke database.
          </p>
        </section>
      ) : null}
      {activeDataSource === "excel" ? (
        <section className="panel border-emerald-200 bg-emerald-50 p-3.5">
          <p className="text-sm text-emerald-700">Sumber data aktif: {getStorageLabel()}</p>
        </section>
      ) : null}

      <section className="dashboard-kpi-grid">
        {summaryCards.map((card) => (
          <article
            key={card.key}
            className={`dashboard-kpi-card dashboard-kpi-card--${card.accent}`}
          >
            <div className="dashboard-kpi-card__header">
              <span className="dashboard-kpi-card__icon">{card.icon}</span>
              <span className="dashboard-kpi-card__chip">{card.chip}</span>
            </div>
            <p className="dashboard-kpi-card__label">{card.label}</p>
            <p className="dashboard-kpi-card__value">{card.value}</p>
            <p className="dashboard-kpi-card__note">{card.note}</p>
          </article>
        ))}
      </section>

      <section className="dashboard-focus-grid">
        <section className="soft-card dashboard-client-panel p-4 md:p-5">
          <div className="section-header">
            <div>
              <h2 className="section-title">Biaya Pengeluaran per Klien</h2>
              <p className="section-description">
                Kartu klien bergerak vertikal dari atas ke bawah agar ritmenya selaras dengan panel
                pengeluaran per project.
              </p>
            </div>
            <span className="badge badge-primary">{clientRows.length} klien</span>
          </div>

          <div className="dashboard-client-panel__body mt-4">
            <DashboardClientBoard clients={clientRows} />
          </div>
        </section>

        <DashboardProjectExpenseList rows={projectExpenseRows} />
      </section>

      <DashboardCharts
        projectStatusTotals={dashboard.projectStatusTotals}
        budgetCategoryTotals={dashboard.categoryTotals}
        budgetScopeLabel={budgetScopeLabel}
      />
    </div>
  );
}
