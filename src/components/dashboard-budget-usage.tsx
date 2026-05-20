"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowLeftIcon, ArrowRightIcon, WalletIcon } from "@/components/icons";
import { formatCompactCurrency, formatCurrency } from "@/lib/format";
import type { CategoryTotal, DashboardData } from "@/lib/types";

type DashboardBudgetUsageProps = {
  categoryTotals: CategoryTotal[];
  clients: DashboardData["categoryTotalsByClient"];
  scopeLabel: string;
};

const CATEGORY_COLORS = ["#2563eb", "#0f766e", "#f59e0b", "#7c3aed", "#db2777", "#0891b2"];

export function DashboardBudgetUsage({
  categoryTotals,
  clients,
  scopeLabel,
}: DashboardBudgetUsageProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const slides = useMemo(() => {
    const overallTotal = categoryTotals.reduce((sum, item) => sum + item.total, 0);
    const overallProjectCount = clients.reduce((sum, item) => sum + item.projectCount, 0);
    const overallSlide = {
      key: "__overall__",
      label: scopeLabel,
      projectCount: overallProjectCount,
      totalExpense: overallTotal,
      categoryTotals,
    };

    return [
      overallSlide,
      ...clients
        .filter((client) => client.totalExpense > 0)
        .map((client) => ({
          key: client.clientName,
          label: client.clientName,
          projectCount: client.projectCount,
          totalExpense: client.totalExpense,
          categoryTotals: client.categoryTotals,
        })),
    ];
  }, [categoryTotals, clients, scopeLabel]);

  useEffect(() => {
    if (slides.length <= 1 || isPaused) {
      return;
    }

    const intervalId = window.setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % slides.length);
    }, 3800);

    return () => window.clearInterval(intervalId);
  }, [isPaused, slides.length]);

  const safeActiveIndex = slides.length > 0 ? activeIndex % slides.length : 0;
  const activeSlide = slides[safeActiveIndex];
  const categoryRows = (activeSlide?.categoryTotals ?? [])
    .filter((item) => item.total > 0)
    .slice()
    .sort((a, b) => b.total - a.total)
    .slice(0, 5);
  const maxCategoryTotal = categoryRows[0]?.total ?? 0;

  return (
    <section
      className="soft-card dashboard-budget-card p-4"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      <div className="section-header">
        <div>
          <h2 className="section-title">Budget Usage</h2>
          <p className="section-description">Akumulasi biaya keseluruhan dan per klien.</p>
        </div>
        <span className="dashboard-budget-card__icon">
          <WalletIcon />
        </span>
      </div>

      {activeSlide ? (
        <>
          <div className="dashboard-budget-stage">
            <div
              className="dashboard-budget-track"
              style={{ transform: `translate3d(0, -${safeActiveIndex * 100}%, 0)` }}
            >
              {slides.map((slide) => (
                <article key={slide.key} className="dashboard-budget-slide">
                  <p className="dashboard-budget-slide__scope">{slide.label}</p>
                  <strong className="dashboard-budget-slide__value">
                    {formatCompactCurrency(slide.totalExpense)}
                  </strong>
                  <div className="dashboard-budget-slide__meta">
                    <span>{slide.projectCount.toLocaleString("id-ID")} project</span>
                    <span>{slide.categoryTotals.filter((item) => item.total > 0).length} kategori</span>
                  </div>
                </article>
              ))}
            </div>
          </div>

          <div className="dashboard-budget-category-list">
            {categoryRows.map((category, index) => {
              const ratio = maxCategoryTotal
                ? Math.max(8, Math.round((category.total / maxCategoryTotal) * 100))
                : 0;
              return (
                <div key={`${activeSlide.key}-${category.category}`} className="dashboard-budget-category">
                  <div className="dashboard-budget-category__head">
                    <span>{category.label}</span>
                    <strong>{formatCurrency(category.total)}</strong>
                  </div>
                  <div className="dashboard-budget-category__bar">
                    <span
                      style={{
                        width: `${ratio}%`,
                        backgroundColor: CATEGORY_COLORS[index % CATEGORY_COLORS.length],
                      }}
                    />
                  </div>
                </div>
              );
            })}
            {categoryRows.length === 0 ? (
              <div className="empty-state dashboard-budget-empty">Belum ada biaya pada scope ini.</div>
            ) : null}
          </div>

          {slides.length > 1 ? (
            <div className="dashboard-budget-card__controls">
              <button
                type="button"
                className="dashboard-mini-control"
                aria-label="Budget sebelumnya"
                onClick={() => setActiveIndex((prev) => (prev - 1 + slides.length) % slides.length)}
              >
                <ArrowLeftIcon className="-rotate-90" />
              </button>
              <span>
                {safeActiveIndex + 1}/{slides.length}
              </span>
              <button
                type="button"
                className="dashboard-mini-control"
                aria-label="Budget berikutnya"
                onClick={() => setActiveIndex((prev) => (prev + 1) % slides.length)}
              >
                <ArrowRightIcon className="rotate-90" />
              </button>
            </div>
          ) : null}
        </>
      ) : (
        <div className="empty-state mt-4">Belum ada budget usage.</div>
      )}
    </section>
  );
}
