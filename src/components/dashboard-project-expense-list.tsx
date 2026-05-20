"use client";

import { useEffect, useMemo, useState } from "react";
import { PROJECT_STATUS_STYLE } from "@/lib/constants";
import { formatCompactCurrency, formatCurrency, formatDate } from "@/lib/format";
import type { DashboardData } from "@/lib/types";

type DashboardProjectExpenseListProps = {
  rows: DashboardData["projectExpenseTotals"];
};

const PAGE_SIZE = 6;
const ALL_CLIENTS_VALUE = "__all_clients__";

function formatProjectStatusLabel(value: string) {
  if (!value) {
    return "-";
  }
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function resolveClientName(value: string | null | undefined) {
  const trimmed = (value ?? "").trim();
  return trimmed || "Tanpa Klien";
}

function resolveClientKey(value: string | null | undefined) {
  return resolveClientName(value).toLowerCase().replace(/\s+/g, " ");
}

function chunkRows<T>(rows: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < rows.length; index += size) {
    chunks.push(rows.slice(index, index + size));
  }
  return chunks;
}

export function DashboardProjectExpenseList({
  rows,
}: DashboardProjectExpenseListProps) {
  const [selectedClient, setSelectedClient] = useState(ALL_CLIENTS_VALUE);
  const [activePage, setActivePage] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const clientOptions = useMemo(() => {
    const options = new Map<string, string>();
    for (const item of rows) {
      const clientLabel = resolveClientName(item.clientName);
      const clientKey = resolveClientKey(item.clientName);
      if (!options.has(clientKey)) {
        options.set(clientKey, clientLabel);
      }
    }
    return Array.from(options.entries())
      .map(([key, label]) => ({ key, label }))
      .sort((a, b) => a.label.localeCompare(b.label, "id-ID"));
  }, [rows]);
  const effectiveSelectedClient =
    selectedClient === ALL_CLIENTS_VALUE || clientOptions.some((option) => option.key === selectedClient)
      ? selectedClient
      : ALL_CLIENTS_VALUE;
  const visibleRows = useMemo(() => {
    return rows
      .filter((item) => item.totalExpense > 0)
      .filter((item) =>
        effectiveSelectedClient === ALL_CLIENTS_VALUE
          ? true
          : resolveClientKey(item.clientName) === effectiveSelectedClient,
      );
  }, [effectiveSelectedClient, rows]);
  const selectedClientLabel =
    effectiveSelectedClient === ALL_CLIENTS_VALUE
      ? "Semua klien"
      : clientOptions.find((option) => option.key === effectiveSelectedClient)?.label ??
        resolveClientName(effectiveSelectedClient);
  const maxExpense = visibleRows[0]?.totalExpense ?? 0;
  const totalExpense = visibleRows.reduce((sum, item) => sum + item.totalExpense, 0);
  const topProject = visibleRows[0] ?? null;
  const pages = chunkRows(visibleRows, PAGE_SIZE);
  const safeActivePage = pages.length > 0 ? activePage % pages.length : 0;

  useEffect(() => {
    if (pages.length <= 1 || isPaused) {
      return;
    }

    const intervalId = window.setInterval(() => {
      setActivePage((prev) => (prev + 1) % pages.length);
    }, 4400);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [isPaused, pages.length]);

  return (
    <section
      className="soft-card dashboard-project-panel p-4 md:p-5"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      <div className="section-header">
        <div className="min-w-0">
          <h2 className="section-title">Total Pengeluaran per Project</h2>
          <p className="section-description">
            Pilih klien untuk menampilkan project sesuai klien yang dipilih user.
          </p>
        </div>
        <span className="badge badge-primary">{visibleRows.length} project</span>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_260px] md:items-end">
        <div className="table-caption">
          {effectiveSelectedClient === ALL_CLIENTS_VALUE
            ? "Menampilkan seluruh project dengan transaksi biaya."
            : `Menampilkan project untuk klien ${selectedClientLabel}.`}
        </div>
        <div>
          <label
            htmlFor="dashboard-project-client-filter"
            className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500"
          >
            Filter Klien
          </label>
          <select
            id="dashboard-project-client-filter"
            value={effectiveSelectedClient}
            onChange={(event) => {
              setSelectedClient(event.target.value);
              setActivePage(0);
            }}
            className="w-full"
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
                {effectiveSelectedClient === ALL_CLIENTS_VALUE
                  ? "Akumulasi Proyek"
                  : "Akumulasi Klien"}
              </span>
              <strong className="dashboard-project-panel__meta-value">
                {formatCompactCurrency(totalExpense)}
              </strong>
            </article>
            <article className="dashboard-project-panel__meta-card">
              <span className="dashboard-project-panel__meta-label">Project Tertinggi</span>
              <strong
                className="dashboard-project-panel__meta-value"
                title={topProject?.projectName ?? ""}
              >
                {topProject?.projectName ?? "Belum ada data"}
              </strong>
            </article>
          </div>

          <div className="dashboard-project-stage">
            <div
              className="dashboard-project-stage__track"
              style={{ transform: `translate3d(0, -${safeActivePage * 100}%, 0)` }}
            >
              {pages.map((page, pageIndex) => (
                <div key={`project-page-${pageIndex}`} className="dashboard-project-stage__page">
                  {page.map((item, index) => {
                    const ratio = maxExpense
                      ? Math.max(10, Math.round((item.totalExpense / maxExpense) * 100))
                      : 0;
                    const rank = pageIndex * PAGE_SIZE + index + 1;

                    return (
                      <article
                        key={item.projectId || item.projectName}
                        className="dashboard-project-item dashboard-project-item--compact"
                        title={`${item.projectName} - ${formatCurrency(item.totalExpense)}`}
                      >
                        <div className="dashboard-project-item__rank dashboard-project-item__rank--compact">
                          {String(rank).padStart(2, "0")}
                        </div>
                        <div className="dashboard-project-item__body dashboard-project-item__body--compact">
                          <div className="dashboard-project-item__topline">
                            <p className="dashboard-project-item__name dashboard-project-item__name--compact">
                              {item.projectName}
                            </p>
                            <strong className="dashboard-project-item__amount-compact">
                              {formatCompactCurrency(item.totalExpense)}
                            </strong>
                          </div>

                          <div className="dashboard-project-item__meta-row">
                            <span>{resolveClientName(item.clientName)}</span>
                            <span
                              className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${PROJECT_STATUS_STYLE[item.projectStatus]}`}
                            >
                              {formatProjectStatusLabel(item.projectStatus)}
                            </span>
                            <span>{item.transactionCount} trx</span>
                            <span>
                              {item.latestExpenseDate ? formatDate(item.latestExpenseDate) : "-"}
                            </span>
                          </div>

                          <div className="dashboard-project-item__progress dashboard-project-item__progress--compact">
                            <div
                              className="dashboard-project-item__progress-bar"
                              style={{ width: `${ratio}%` }}
                            />
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>

          {pages.length > 1 ? (
            <div className="dashboard-project-pagination">
              <p className="dashboard-project-pagination__label">
                Slide {safeActivePage + 1} / {pages.length}
              </p>
              <div className="dashboard-project-pagination__dots">
                {pages.map((_, index) => (
                  <button
                    key={`project-dot-${index}`}
                    type="button"
                    className={`dashboard-project-pagination__dot ${
                      index === safeActivePage ? "dashboard-project-pagination__dot--active" : ""
                    }`}
                    aria-label={`Tampilkan slide ${index + 1}`}
                    onClick={() => setActivePage(index)}
                  />
                ))}
              </div>
            </div>
          ) : null}
        </>
      ) : (
        <div className="empty-state mt-4">Belum ada data pengeluaran project.</div>
      )}
    </section>
  );
}
