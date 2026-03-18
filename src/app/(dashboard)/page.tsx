import { DashboardCharts } from "@/components/dashboard-charts";
import { DashboardClientBoard } from "@/components/dashboard-client-board";
import { AttendanceIcon, ProjectIcon, ShieldIcon, WalletIcon } from "@/components/icons";
import { requireAuthUser } from "@/lib/auth";
import { getDashboardData } from "@/lib/data";
import { activeDataSource, getStorageLabel } from "@/lib/storage";

const dateFormatter = new Intl.DateTimeFormat("id-ID", {
  day: "2-digit",
  month: "long",
  year: "numeric",
});

function formatCompactCurrency(value: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    notation: "compact",
    maximumFractionDigits: 1,
  })
    .format(value)
    .replace("Rp", "Rp ");
}

export default async function DashboardPage() {
  const user = await requireAuthUser();
  const dashboard = await getDashboardData();
  const today = dateFormatter.format(new Date());
  const totalBudget = dashboard.categoryTotals.reduce((sum, item) => sum + item.total, 0);
  const budgetScopeLabel = "Keseluruhan Portfolio";

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

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {/* Ringkasan kecil: hanya data inti yang dibutuhkan user di bagian atas. */}
        <article className="soft-card p-4">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
              <ShieldIcon className="h-4 w-4" />
            </span>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">
                Role Aktif
              </p>
              <p className="mt-1 text-sm font-semibold text-slate-950">{user.roleLabel}</p>
            </div>
          </div>
        </article>

        <article className="soft-card p-4">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
              <AttendanceIcon className="h-4 w-4" />
            </span>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">
                Tanggal
              </p>
              <p className="mt-1 text-sm font-semibold text-slate-950">{today}</p>
            </div>
          </div>
        </article>

        <article className="soft-card p-4">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-50 text-indigo-700">
              <ProjectIcon className="h-4 w-4" />
            </span>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">
                Total Project
              </p>
              <p className="mt-1 text-sm font-semibold text-slate-950">
                {dashboard.totalProjects.toLocaleString("id-ID")}
              </p>
            </div>
          </div>
        </article>

        <article className="soft-card p-4">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-50 text-amber-700">
              <WalletIcon className="h-4 w-4" />
            </span>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">
                Total Budget
              </p>
              <p className="mt-1 text-sm font-semibold text-slate-950">{formatCompactCurrency(totalBudget)}</p>
              <p className="mt-1 text-[11px] text-slate-500">{budgetScopeLabel}</p>
            </div>
          </div>
        </article>
      </section>

      <section className="soft-card p-4 md:p-5">
        <div className="section-header">
          <div>
            <h2 className="section-title">Biaya Pengeluaran per Klien</h2>
            <p className="section-description">
              Section ini menggantikan budget filter dan menampilkan kartu klien yang bergeser satu
              per satu seperti membuka buku ringkasan biaya.
            </p>
          </div>
          <span className="badge badge-primary">{clientRows.length} klien</span>
        </div>

        <div className="mt-4">
          <DashboardClientBoard clients={clientRows} />
        </div>
      </section>

      <DashboardCharts
        projectStatusTotals={dashboard.projectStatusTotals}
        budgetCategoryTotals={dashboard.categoryTotals}
        budgetScopeLabel={budgetScopeLabel}
      />
    </div>
  );
}
