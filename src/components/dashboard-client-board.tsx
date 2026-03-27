"use client";

import { useEffect, useState } from "react";
import { ArrowLeftIcon, ArrowRightIcon, ProjectIcon, WalletIcon } from "@/components/icons";
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

function getRelativeOffset(index: number, activeIndex: number, total: number) {
  let offset = index - activeIndex;
  const half = total / 2;
  if (offset > half) {
    offset -= total;
  } else if (offset < -half) {
    offset += total;
  }
  return offset;
}

function getSlot(offset: number) {
  const distance = Math.abs(offset);
  if (distance === 0) {
    return "active";
  }
  if (distance === 1) {
    return "near";
  }
  if (distance === 2) {
    return "far";
  }
  return "hidden";
}

export function DashboardClientBoard({ clients }: DashboardClientBoardProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);

  useEffect(() => {
    if (clients.length <= 1 || isPaused) {
      return;
    }

    const intervalId = window.setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % clients.length);
    }, 4200);

    return () => window.clearInterval(intervalId);
  }, [clients.length, isPaused]);

  if (clients.length === 0) {
    return <div className="empty-state">Belum ada biaya per klien yang bisa ditampilkan.</div>;
  }

  const safeActiveIndex = activeIndex % clients.length;
  const activeClient = clients[safeActiveIndex] ?? clients[0];

  return (
    <div
      className="client-carousel"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      <div className="client-carousel-stage">
        {clients.map((client, index) => {
          const offset = getRelativeOffset(index, safeActiveIndex, clients.length);
          const slot = getSlot(offset);
          const side = offset < 0 ? "left" : offset > 0 ? "right" : "center";

          return (
            <article
              key={client.clientName}
              className={`client-carousel-card client-carousel-card--${slot}`}
              data-side={side}
              aria-hidden={slot === "hidden"}
              style={{ zIndex: clients.length - Math.abs(offset) }}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-950">{client.clientName}</p>
                  <p className="mt-1 text-[11px] text-slate-500">
                    Ringkasan biaya klien tampil bergantian seperti carousel portfolio.
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
          );
        })}
      </div>

      {clients.length > 1 ? (
        <div className="client-carousel-footer">
          <div className="client-carousel-summary">
            <p className="client-carousel-summary__label">Klien Aktif</p>
            <p className="client-carousel-summary__value">{activeClient.clientName}</p>
          </div>
          <div className="client-carousel-controls">
            <button
              type="button"
              className="client-carousel-control"
              aria-label="Klien sebelumnya"
              onClick={() =>
                setActiveIndex((prev) => (prev - 1 + clients.length) % clients.length)
              }
            >
              <ArrowLeftIcon />
            </button>
            <div className="client-carousel-dots">
              {clients.map((client, index) => (
                <button
                  key={`${client.clientName}-dot`}
                  type="button"
                  className={`client-carousel-dot ${
                    index === safeActiveIndex ? "client-carousel-dot--active" : ""
                  }`}
                  aria-label={`Tampilkan ${client.clientName}`}
                  onClick={() => setActiveIndex(index)}
                />
              ))}
            </div>
            <button
              type="button"
              className="client-carousel-control"
              aria-label="Klien berikutnya"
              onClick={() => setActiveIndex((prev) => (prev + 1) % clients.length)}
            >
              <ArrowRightIcon />
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
