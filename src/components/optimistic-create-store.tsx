"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { usePathname, useSearchParams } from "next/navigation";
import type { AttendanceRecord, ExpenseEntry, Project } from "@/lib/types";

type PendingRow<T> = {
  createdAtMs: number;
  row: T;
};

type OptimisticCreateStoreValue = {
  pendingAttendances: AttendanceRecord[];
  pendingExpenses: ExpenseEntry[];
  pendingProjects: Project[];
  addPendingAttendances: (rows: AttendanceRecord[]) => void;
  addPendingExpenses: (rows: ExpenseEntry[]) => void;
  addPendingProjects: (rows: Project[]) => void;
  removePendingExpenseIds: (ids: string[]) => void;
};

const OptimisticCreateStore = createContext<OptimisticCreateStoreValue | null>(null);
const PENDING_ROW_TTL_MS = 15_000;

export function OptimisticCreateStoreProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const queryText = searchParams.toString();
  const hasResponseMessage = searchParams.has("error") || searchParams.has("success");
  const [pendingAttendances, setPendingAttendances] = useState<Array<PendingRow<AttendanceRecord>>>([]);
  const [pendingExpenses, setPendingExpenses] = useState<Array<PendingRow<ExpenseEntry>>>([]);
  const [pendingProjects, setPendingProjects] = useState<Array<PendingRow<Project>>>([]);

  const clearPendingRows = useCallback(() => {
    setPendingAttendances([]);
    setPendingExpenses([]);
    setPendingProjects([]);
  }, []);

  useEffect(() => {
    if (hasResponseMessage) {
      const timeoutId = window.setTimeout(clearPendingRows, 0);
      return () => window.clearTimeout(timeoutId);
    }
  }, [clearPendingRows, hasResponseMessage, pathname, queryText]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      const threshold = Date.now() - PENDING_ROW_TTL_MS;
      setPendingAttendances((previous) =>
        previous.filter((item) => item.createdAtMs >= threshold),
      );
      setPendingExpenses((previous) => previous.filter((item) => item.createdAtMs >= threshold));
      setPendingProjects((previous) => previous.filter((item) => item.createdAtMs >= threshold));
    }, 3000);
    return () => window.clearInterval(intervalId);
  }, []);

  const addPendingAttendances = useCallback((rows: AttendanceRecord[]) => {
    const createdAtMs = Date.now();
    setPendingAttendances((previous) => [
      ...previous,
      ...rows.map((row) => ({ createdAtMs, row })),
    ]);
  }, []);

  const addPendingExpenses = useCallback((rows: ExpenseEntry[]) => {
    const createdAtMs = Date.now();
    setPendingExpenses((previous) => [
      ...previous,
      ...rows.map((row) => ({ createdAtMs, row })),
    ]);
  }, []);

  const addPendingProjects = useCallback((rows: Project[]) => {
    const createdAtMs = Date.now();
    setPendingProjects((previous) => [
      ...previous,
      ...rows.map((row) => ({ createdAtMs, row })),
    ]);
  }, []);

  const removePendingExpenseIds = useCallback((ids: string[]) => {
    const targetIds = new Set(ids);
    setPendingExpenses((previous) => previous.filter((item) => !targetIds.has(item.row.id)));
  }, []);

  const value = useMemo(
    () => ({
      pendingAttendances: pendingAttendances.map((item) => item.row),
      pendingExpenses: pendingExpenses.map((item) => item.row),
      pendingProjects: pendingProjects.map((item) => item.row),
      addPendingAttendances,
      addPendingExpenses,
      addPendingProjects,
      removePendingExpenseIds,
    }),
    [
      addPendingAttendances,
      addPendingExpenses,
      addPendingProjects,
      removePendingExpenseIds,
      pendingAttendances,
      pendingExpenses,
      pendingProjects,
    ],
  );

  return <OptimisticCreateStore.Provider value={value}>{children}</OptimisticCreateStore.Provider>;
}

export function useOptimisticCreateStore() {
  const value = useContext(OptimisticCreateStore);
  if (!value) {
    throw new Error("useOptimisticCreateStore harus dipakai di dalam OptimisticCreateStoreProvider.");
  }
  return value;
}
