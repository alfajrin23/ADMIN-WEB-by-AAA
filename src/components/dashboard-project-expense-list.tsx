"use client";

import { useMemo, useState } from "react";
import { PROJECT_STATUS_STYLE } from "@/lib/constants";
import { formatCompactCurrency, formatCurrency, formatDate } from "@/lib/format";
import type { DashboardData } from "@/lib/types";

type DashboardProjectExpenseListProps = {
  rows: DashboardData["projectExpenseTotals"];
};

const PAGE_SIZE = 8;
const ALL_CLIENTS_VALUE = "__all_clients__";

function resolveClientName(value: string | null | undefined) {
  return value?.trim() || "Tanpa Klien";
}

function resolveClientKey(value: string | null | undefined) {
  return resolveClientName(value).toLowerCase().replace(/\s+/g, " ");
}

export function DashboardProjectExpenseList({ rows }: DashboardProjectExpenseListProps) {
  const [selectedClient, setSelectedClient] = useState(ALL_CLIENTS_VALUE);
  const [activePage, setActivePage] = useState(0);

  const clientOptions = useMemo(() => {
    const options = new Map<string, string>();
    for (const item of rows) {
      const clientKey = resolveClientKey(item.clientName);
      if (!options.has(clientKey)) {
        options.set(clientKey, resolveClientName(item.clientName));
      }
    }
    return Array.from(options, ([key, label]) => ({ key, label })).sort((a, b) =>
      a.label.localeCompare(b.label, "id-ID"),
    );
  }, [rows]);

  const effectiveSelectedClient = clientOptions.some((option) => option.key === selectedClient)
    ? selectedClient
    : ALL_CLIENTS_VALUE;
  const visibleRows = useMemo(
    () =>
      rows
        .filter((item) => item.totalExpense > 0)
        .filter(
          (item) =>
            effectiveSelectedClient === ALL_CLIENTS_VALUE ||
            resolveClientKey(item.clientName) === effectiveSelectedClient,
        )
        .sort(
          (a, b) =>
            b.totalExpense - a.totalExpense || a.projectName.localeCompare(b.projectName, "id-ID"),
        ),
    [effectiveSelectedClient, rows],
  );
  const pageCount = Math.max(1, Math.ceil(visibleRows.length / PAGE_SIZE));
  const safeActivePage = Math.min(activePage, pageCount - 1);
  const pageRows = visibleRows.slice(safeActivePage * PAGE_SIZE, (safeActivePage + 1) * PAGE_SIZE);
  const totalExpense = visibleRows.reduce((sum, item) => sum + item.totalExpense, 0);
  const topProject = visibleRows[0] ?? null;
  const selectedClientLabel =
    effectiveSelectedClient === ALL_CLIENTS_VALUE
      ? "Semua klien"
      : clientOptions.find((option) => option.key === effectiveSelectedClient)?.label ?? "Semua klien";

  return (
    <section className="soft-card dashboard-project-panel p-4 sm:p-5 xl:p-6">
      <div className="section-header">
        <div className="min-w-0">
          <h2 className="section-title">Pengeluaran per proyek</h2>
          <p className="section-description">
            Urut berdasarkan nominal biaya. Pilih klien untuk mempersempit daftar.
          </p>
        </div>
        <span className="badge badge-primary">{visibleRows.length.toLocaleString("id-ID")} proyek</span>
      </div>

      <div className="dashboard-project-toolbar mt-4">
        <p className="table-caption">
          {effectiveSelectedClient === ALL_CLIENTS_VALUE
            ? "Semua proyek dengan transaksi biaya"
            : `Proyek untuk ${selectedClientLabel}`}
        </p>
        <div className="dashboard-project-filter">
          <label htmlFor="dashboard-project-client-filter">Klien</label>
          <select
            id="dashboard-project-client-filter"
            value={effectiveSelectedClient}
            onChange={(event) => {
              setSelectedClient(event.target.value);
              setActivePage(0);
            }}
          >
            <option value={ALL_CLIENTS_VALUE}>Semua klien</option>
            {clientOptions.map((option) => (
              <option key={option.key} value={option.key}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {visibleRows.length > 0 ? (
        <>
          <div className="dashboard-project-panel__meta dashboard-project-panel__meta--compact">
            <article className="dashboard-project-panel__meta-card">
              <span className="dashboard-project-panel__meta-label">
                {effectiveSelectedClient === ALL_CLIENTS_VALUE ? "Akumulasi proyek" : "Akumulasi klien"}
              </span>
              <strong className="dashboard-project-panel__meta-value">
                {formatCompactCurrency(totalExpense)}
              </strong>
            </article>
            <article className="dashboard-project-panel__meta-card">
              <span className="dashboard-project-panel__meta-label">Proyek dengan biaya tertinggi</span>
              <strong className="dashboard-project-panel__meta-value" title={topProject?.projectName ?? ""}>
                {topProject?.projectName ?? "Belum ada data"}
              </strong>
            </article>
          </div>

          <div className="dashboard-project-list" aria-live="polite">
            {pageRows.map((item, index) => {
              const ratio = topProject?.totalExpense
                ? Math.max(8, Math.round((item.totalExpense / topProject.totalExpense) * 100))
                : 0;
              const rank = safeActivePage * PAGE_SIZE + index + 1;

              return (
                <article className="dashboard-project-row" key={item.projectId || item.projectName}>
                  <span className="dashboard-project-row__rank">{String(rank).padStart(2, "0")}</span>
                  <div className="dashboard-project-row__content">
                    <div className="dashboard-project-row__heading">
                      <h3 title={item.projectName}>{item.projectName}</h3>
                      <strong title={formatCurrency(item.totalExpense)}>
                        {formatCompactCurrency(item.totalExpense)}
                      </strong>
                    </div>
                    <div className="dashboard-project-row__meta">
                      <span>{resolveClientName(item.clientName)}</span>
                      <span className={`dashboard-project-status ${PROJECT_STATUS_STYLE[item.projectStatus]}`}>
                        {item.projectStatus.charAt(0).toUpperCase() + item.projectStatus.slice(1)}
                      </span>
                      <span>{item.transactionCount.toLocaleString("id-ID")} transaksi</span>
                      <span>{item.latestExpenseDate ? formatDate(item.latestExpenseDate) : "-"}</span>
                    </div>
                    <div className="dashboard-project-row__progress" aria-hidden="true">
                      <span style={{ width: `${ratio}%` }} />
                    </div>
                  </div>
                </article>
              );
            })}
          </div>

          {pageCount > 1 ? (
            <nav className="dashboard-project-pagination" aria-label="Halaman daftar proyek">
              <p>
                {safeActivePage * PAGE_SIZE + 1}–{Math.min((safeActivePage + 1) * PAGE_SIZE, visibleRows.length)}
                {" "}dari {visibleRows.length.toLocaleString("id-ID")}
              </p>
              <div>
                <button
                  type="button"
                  className="button-ghost button-sm"
                  disabled={safeActivePage === 0}
                  onClick={() => setActivePage((page) => Math.max(0, page - 1))}
                >
                  Sebelumnya
                </button>
                <span aria-live="polite">{safeActivePage + 1} / {pageCount}</span>
                <button
                  type="button"
                  className="button-ghost button-sm"
                  disabled={safeActivePage >= pageCount - 1}
                  onClick={() => setActivePage((page) => Math.min(pageCount - 1, page + 1))}
                >
                  Berikutnya
                </button>
              </div>
            </nav>
          ) : null}
        </>
      ) : (
        <div className="empty-state mt-4">Belum ada data pengeluaran proyek.</div>
      )}
    </section>
  );
}
