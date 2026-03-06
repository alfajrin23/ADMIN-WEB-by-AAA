import { ProjectIcon, WalletIcon } from "@/components/icons";
import { ProjectExpenseTotalsTable } from "@/components/project-expense-totals-table";
import { StatCard } from "@/components/stat-card";
import { getCostCategoryStyle } from "@/lib/constants";
import { getDashboardData } from "@/lib/data";
import { formatCurrency } from "@/lib/format";
import { activeDataSource, getStorageLabel } from "@/lib/storage";

export default async function DashboardPage() {
  const dashboard = await getDashboardData();
  const clientSlides =
    dashboard.projectCountByClient.length > 1
      ? [...dashboard.projectCountByClient, ...dashboard.projectCountByClient]
      : dashboard.projectCountByClient;
  const shouldAnimateClientSlides = dashboard.projectCountByClient.length > 1;

  return (
    <div className="space-y-4">
      {activeDataSource === "demo" ? (
        <section className="panel border-amber-300 bg-amber-50 p-4">
          <p className="text-sm text-amber-700">
            Mode demo aktif. Isi env Supabase untuk menyimpan data ke database.
          </p>
        </section>
      ) : null}
      {activeDataSource === "excel" ? (
        <section className="panel border-emerald-200 bg-emerald-50 p-4">
          <p className="text-sm text-emerald-700">Sumber data aktif: {getStorageLabel()}</p>
        </section>
      ) : null}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Total Proyek"
          value={String(dashboard.totalProjects)}
          note="Semua proyek yang tercatat"
          tone="blue"
          icon={<span className="inline-block h-4 w-4 rounded bg-blue-500" />}
        />
        <StatCard
          label="Total Pengeluaran"
          value={formatCurrency(dashboard.totalExpense)}
          note="Akumulasi seluruh kategori"
          tone="amber"
          icon={<WalletIcon className="h-4 w-4" />}
        />
        <StatCard
          label="Pengeluaran Bulan Ini"
          value={formatCurrency(dashboard.monthExpense)}
          note="Berdasarkan tanggal transaksi"
          tone="emerald"
          icon={<span className="inline-block h-4 w-4 rounded bg-emerald-500" />}
        />
        <StatCard
          label="Total Kasbon Tukang"
          value={formatCurrency(dashboard.totalKasbon)}
          note="Terhitung dari absensi harian"
          tone="slate"
          icon={<span className="inline-block h-4 w-4 rounded bg-slate-500" />}
        />
      </section>

      <section className="motion-display panel p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold text-slate-900">Jumlah Proyek per Klien</h2>
          <p className="text-xs text-slate-500">
            {dashboard.projectCountByClient.length} klien
          </p>
        </div>
        {dashboard.projectCountByClient.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">Belum ada data klien proyek.</p>
        ) : (
          <div className="client-slider mt-4">
            <div
              className={`client-slider-track${shouldAnimateClientSlides ? " client-slider-track--animated" : ""}`}
            >
              {clientSlides.map((item, index) => (
                <article
                  key={`${item.clientName}-${index}`}
                  className="motion-display client-slider-item rounded-xl border border-slate-200 bg-gradient-to-br from-slate-50 to-blue-50 px-4 py-3"
                >
                  <span className="motion-display-icon mb-2 inline-flex h-7 w-7 items-center justify-center rounded-lg bg-blue-100 text-blue-700">
                    <ProjectIcon />
                  </span>
                  <p className="text-xs text-slate-500">Klien</p>
                  <p className="line-clamp-1 text-sm font-semibold text-slate-900">
                    {item.clientName}
                  </p>
                  <p className="mt-1 text-xs text-blue-700">
                    {item.count} proyek
                  </p>
                </article>
              ))}
            </div>
          </div>
        )}
      </section>

      <section className="grid gap-4 xl:grid-cols-[1fr_1.35fr]">
        <article className="motion-display panel p-5">
          <h2 className="text-lg font-semibold text-slate-900">
            Rekap Biaya per Kategori dan Klien
          </h2>
          {dashboard.categoryTotalsByClient.length === 0 ? (
            <p className="mt-4 text-sm text-slate-500">Belum ada data biaya per klien.</p>
          ) : (
            <div className="mt-4 space-y-3">
              {dashboard.categoryTotalsByClient.map((clientSummary) => (
                <section
                  key={clientSummary.clientName}
                  className="rounded-xl border border-slate-200 bg-slate-50 p-3"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <h3 className="text-sm font-semibold text-slate-900">
                        {clientSummary.clientName}
                      </h3>
                      <p className="text-[11px] text-slate-500">
                        {clientSummary.projectCount} proyek
                      </p>
                    </div>
                    <p className="text-sm font-semibold text-slate-900">
                      {formatCurrency(clientSummary.totalExpense)}
                    </p>
                  </div>

                  {clientSummary.categoryTotals.length === 0 ? (
                    <p className="mt-3 text-[11px] text-slate-500">
                      Belum ada kategori biaya untuk klien ini.
                    </p>
                  ) : (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {clientSummary.categoryTotals.map((item) => (
                        <div
                          key={`${clientSummary.clientName}-${item.category}`}
                          className="rounded-xl border border-white bg-white px-3 py-2 shadow-sm"
                        >
                          <span
                            className={`inline-flex rounded-full px-2 py-1 text-[11px] font-semibold ${getCostCategoryStyle(item.category)}`}
                          >
                            {item.label}
                          </span>
                          <p className="mt-2 text-sm font-semibold text-slate-900">
                            {formatCurrency(item.total)}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              ))}
            </div>
          )}
        </article>

        <article className="motion-display panel p-5">
          <h2 className="text-lg font-semibold text-slate-900">Total Pengeluaran per Project</h2>
          <ProjectExpenseTotalsTable rows={dashboard.projectExpenseTotals} />
        </article>
      </section>
    </div>
  );
}
