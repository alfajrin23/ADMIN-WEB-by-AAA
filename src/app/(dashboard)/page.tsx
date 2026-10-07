import { Suspense } from "react";
import Link from "next/link";
import { DashboardChartsLazy } from "@/components/dashboard-charts-lazy";
import { DashboardClientBoard } from "@/components/dashboard-client-board";
import { DashboardProjectExpenseList } from "@/components/dashboard-project-expense-list";
import { CashInIcon, ProjectIcon, TrendUpIcon, UsersIcon } from "@/components/icons";
import { canAccessProjects, requireAuthUser } from "@/lib/auth";
import { getDashboardData } from "@/lib/data";
import { formatCompactCurrency } from "@/lib/format";
import { activeDataSource, getStorageLabel } from "@/lib/storage";

export default async function DashboardPage() {
  const user = await requireAuthUser();

  return (
    <div className="space-y-5">
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

      <section className="dashboard-page-heading">
        <div>
          <p>RINGKASAN OPERASIONAL</p>
          <h1>Dashboard proyek</h1>
          <span>Pantau aktivitas proyek, biaya, dan tenaga kerja dalam satu tampilan.</span>
        </div>
        {canAccessProjects(user) ? (
          <Link href="/projects" className="button-primary dashboard-page-heading__action">
            <ProjectIcon className="h-4 w-4" />
            Lihat proyek
          </Link>
        ) : null}
      </section>

      <Suspense fallback={<DashboardOverviewLoading />}>
        <DashboardOverview />
      </Suspense>
    </div>
  );
}

async function DashboardOverview() {
  const dashboard = await getDashboardData();
  const budgetScopeLabel = "Semua proyek";

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
        .map((item) => ({ label: item.label, total: item.total })),
    }))
    .filter((client) => client.totalExpense > 0)
    .sort((a, b) => b.totalExpense - a.totalExpense || a.clientName.localeCompare(b.clientName, "id-ID"))
    .slice(0, 6);

  const maxClientExpense = clientRowsBase[0]?.totalExpense ?? 0;
  const clientRows = clientRowsBase.map((client) => ({
    ...client,
    expenseRatio: maxClientExpense
      ? Math.max(8, Math.round((client.totalExpense / maxClientExpense) * 100))
      : 0,
  }));

  const projectExpenseRows = dashboard.projectExpenseTotals.filter((item) => item.totalExpense > 0);
  const summaryCards = [
    {
      key: "month-expense",
      label: "Pengeluaran bulan ini",
      value: formatCompactCurrency(dashboard.monthExpense),
      note: "Total biaya yang tercatat pada bulan berjalan.",
      accent: "amber",
      icon: <TrendUpIcon className="h-5 w-5" />,
      chip: "Bulan berjalan",
    },
    {
      key: "active-projects",
      label: "Proyek aktif",
      value: dashboard.activeProjects.toLocaleString("id-ID"),
      note: `${dashboard.totalProjects.toLocaleString("id-ID")} proyek tercatat di sistem.`,
      accent: "blue",
      icon: <ProjectIcon className="h-5 w-5" />,
      chip: "Status proyek",
    },
    {
      key: "active-workers",
      label: "Pekerja aktif",
      value: dashboard.activeWorkers.toLocaleString("id-ID"),
      note: "Pekerja dengan catatan absensi dalam 30 hari terakhir.",
      accent: "emerald",
      icon: <UsersIcon className="h-5 w-5" />,
      chip: "30 hari terakhir",
    },
    {
      key: "kasbon",
      label: "Total kasbon",
      value: formatCompactCurrency(dashboard.totalKasbon),
      note: "Akumulasi kasbon yang telah dicatat pada absensi.",
      accent: "slate",
      icon: <CashInIcon className="h-5 w-5" />,
      chip: "Akumulasi",
    },
  ] as const;

  return (
    <div className="space-y-5">
      <section className="dashboard-kpi-grid" aria-label="Ringkasan utama">
        {summaryCards.map((card) => (
          <article key={card.key} className={`dashboard-kpi-card dashboard-kpi-card--${card.accent}`}>
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
        <section className="soft-card dashboard-client-panel p-4 sm:p-5 xl:p-6">
          <div className="section-header">
            <div>
              <h2 className="section-title">Biaya per klien</h2>
              <p className="section-description">Enam klien dengan total pengeluaran tertinggi.</p>
            </div>
            <span className="badge badge-primary">{clientRows.length} klien</span>
          </div>
          <div className="dashboard-client-panel__body mt-4">
            <DashboardClientBoard clients={clientRows} />
          </div>
        </section>

        <DashboardProjectExpenseList rows={projectExpenseRows} />
      </section>

      <DashboardChartsLazy
        projectStatusTotals={dashboard.projectStatusTotals}
        budgetCategoryTotals={dashboard.categoryTotals}
        budgetScopeLabel={budgetScopeLabel}
      />
    </div>
  );
}

function DashboardOverviewLoading() {
  return (
    <div className="space-y-5" aria-label="Memuat ringkasan dashboard" aria-busy="true">
      <section className="dashboard-kpi-grid">
        {Array.from({ length: 4 }, (_, index) => (
          <div className="dashboard-skeleton dashboard-skeleton--kpi" key={index} />
        ))}
      </section>
      <section className="dashboard-focus-grid">
        <div className="dashboard-skeleton dashboard-skeleton--panel" />
        <div className="dashboard-skeleton dashboard-skeleton--panel" />
      </section>
      <div className="dashboard-chart-grid">
        <div className="dashboard-skeleton dashboard-skeleton--chart" />
        <div className="dashboard-skeleton dashboard-skeleton--chart" />
      </div>
    </div>
  );
}
