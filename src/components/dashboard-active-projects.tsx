"use client";

import { useEffect, useState } from "react";
import { ArrowLeftIcon, ArrowRightIcon, ProjectIcon } from "@/components/icons";
import type { DashboardData } from "@/lib/types";

type DashboardActiveProjectsProps = {
  totalProjects: number;
  activeProjects: number;
  completedProjects: number;
  delayedProjects: number;
  clients: DashboardData["projectStatusByClient"];
};

export function DashboardActiveProjects({
  totalProjects,
  activeProjects,
  completedProjects,
  delayedProjects,
  clients,
}: DashboardActiveProjectsProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const visibleClients = clients.filter((client) => client.total > 0);
  const maxActiveProjects = Math.max(...visibleClients.map((client) => client.active), 1);

  useEffect(() => {
    if (visibleClients.length <= 1 || isPaused) {
      return;
    }

    const intervalId = window.setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % visibleClients.length);
    }, 3600);

    return () => window.clearInterval(intervalId);
  }, [isPaused, visibleClients.length]);

  const safeActiveIndex = visibleClients.length > 0 ? activeIndex % visibleClients.length : 0;

  return (
    <section
      className="dashboard-active-card"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      <div className="dashboard-active-card__summary">
        <div className="dashboard-active-card__icon">
          <ProjectIcon />
        </div>
        <div className="min-w-0">
          <p className="dashboard-active-card__label">Project Aktif</p>
          <div className="dashboard-active-card__value-row">
            <strong>{activeProjects.toLocaleString("id-ID")}</strong>
            <span>dari {totalProjects.toLocaleString("id-ID")} project</span>
          </div>
        </div>
      </div>

      <div className="dashboard-active-card__stats">
        <span>
          Aktif <strong>{activeProjects.toLocaleString("id-ID")}</strong>
        </span>
        <span>
          Selesai <strong>{completedProjects.toLocaleString("id-ID")}</strong>
        </span>
        <span>
          Tertunda <strong>{delayedProjects.toLocaleString("id-ID")}</strong>
        </span>
      </div>

      {visibleClients.length > 0 ? (
        <div className="dashboard-active-client-stage">
          <div
            className="dashboard-active-client-track"
            style={{ transform: `translate3d(0, -${safeActiveIndex * 100}%, 0)` }}
          >
            {visibleClients.map((client) => {
              const activeRatio = Math.max(8, Math.round((client.active / maxActiveProjects) * 100));
              return (
                <article key={client.clientName} className="dashboard-active-client-card">
                  <div className="dashboard-active-client-card__header">
                    <p>{client.clientName}</p>
                    <strong>{client.active.toLocaleString("id-ID")} aktif</strong>
                  </div>
                  <div className="dashboard-active-client-card__meta">
                    <span>{client.total.toLocaleString("id-ID")} total</span>
                    <span>{client.completed.toLocaleString("id-ID")} selesai</span>
                    <span>{client.delayed.toLocaleString("id-ID")} tertunda</span>
                  </div>
                  <div className="dashboard-active-client-card__bar">
                    <span style={{ width: `${activeRatio}%` }} />
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="dashboard-active-client-empty">Belum ada project tercatat.</div>
      )}

      {visibleClients.length > 1 ? (
        <div className="dashboard-active-card__controls">
          <button
            type="button"
            className="dashboard-mini-control"
            aria-label="Klien sebelumnya"
            onClick={() =>
              setActiveIndex((prev) => (prev - 1 + visibleClients.length) % visibleClients.length)
            }
          >
            <ArrowLeftIcon className="-rotate-90" />
          </button>
          <span>
            {safeActiveIndex + 1}/{visibleClients.length}
          </span>
          <button
            type="button"
            className="dashboard-mini-control"
            aria-label="Klien berikutnya"
            onClick={() => setActiveIndex((prev) => (prev + 1) % visibleClients.length)}
          >
            <ArrowRightIcon className="rotate-90" />
          </button>
        </div>
      ) : null}
    </section>
  );
}
