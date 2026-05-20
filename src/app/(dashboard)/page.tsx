import { DashboardActiveProjects } from "@/components/dashboard-active-projects";
import { DashboardBudgetUsage } from "@/components/dashboard-budget-usage";
import { DashboardClientBoard } from "@/components/dashboard-client-board";
import { DashboardProjectExpenseList } from "@/components/dashboard-project-expense-list";
import { TrendUpIcon, WalletIcon } from "@/components/icons";
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
    });

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

  return (
    <div className="dashboard-summary-page space-y-3">
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

      <section className="dashboard-summary-top-grid">
        <article className="dashboard-month-card">
          <div className="dashboard-month-card__icon">
            <TrendUpIcon />
          </div>
          <div className="min-w-0">
            <p className="dashboard-month-card__label">Pengeluaran Bulan Ini</p>
            <strong className="dashboard-month-card__value">
              {formatCompactCurrency(dashboard.monthExpense)}
            </strong>
            <div className="dashboard-month-card__meta">
              <span>{budgetScopeLabel}</span>
              <span>
                <WalletIcon className="h-3.5 w-3.5" />
                Total {formatCompactCurrency(dashboard.totalExpense)}
              </span>
            </div>
          </div>
        </article>

        <DashboardActiveProjects
          totalProjects={dashboard.totalProjects}
          activeProjects={dashboard.activeProjects}
          completedProjects={dashboard.completedProjects}
          delayedProjects={dashboard.delayedProjects}
          clients={dashboard.projectStatusByClient}
        />
      </section>

      <section className="dashboard-summary-main-grid">
        <section className="soft-card dashboard-client-panel p-4 md:p-5">
          <div className="section-header">
            <div>
              <h2 className="section-title">Biaya Pengeluaran per Klien</h2>
              <p className="section-description">Total biaya dan kategori terbesar dari setiap klien.</p>
            </div>
            <span className="badge badge-primary">{clientRows.length} klien</span>
          </div>

          <div className="dashboard-client-panel__body mt-4">
            <DashboardClientBoard clients={clientRows} />
          </div>
        </section>

        <DashboardProjectExpenseList rows={projectExpenseRows} />

        <DashboardBudgetUsage
          categoryTotals={dashboard.categoryTotals}
          clients={dashboard.categoryTotalsByClient}
          scopeLabel={budgetScopeLabel}
        />
      </section>
    </div>
  );
}
