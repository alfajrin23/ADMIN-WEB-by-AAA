"use client";

import dynamic from "next/dynamic";
import type { ComponentProps } from "react";
import type { DashboardCharts } from "@/components/dashboard-charts";

type DashboardChartsProps = ComponentProps<typeof DashboardCharts>;

const DashboardChartsView = dynamic(
  () => import("@/components/dashboard-charts").then((module) => module.DashboardCharts),
  {
    ssr: false,
    loading: () => (
      <div className="dashboard-chart-grid" aria-label="Memuat grafik" aria-busy="true">
        <div className="dashboard-chart-placeholder" />
        <div className="dashboard-chart-placeholder" />
      </div>
    ),
  },
);

export function DashboardChartsLazy(props: DashboardChartsProps) {
  return <DashboardChartsView {...props} />;
}
