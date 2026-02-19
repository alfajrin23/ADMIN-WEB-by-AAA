import path from "node:path";
import { isSupabaseConfigured } from "@/lib/supabase";

type RequestedDataSource = "excel" | "supabase";
export type ActiveDataSource = "excel" | "supabase" | "demo";

const requested = (process.env.DATA_SOURCE ?? "excel").toLowerCase();
const requestedDataSource: RequestedDataSource =
  requested === "supabase" ? "supabase" : "excel";

const configuredExcelPath =
  process.env.EXCEL_DB_PATH?.trim() || path.join(process.cwd(), "data", "admin-web.xlsx");

export const excelDbPath = configuredExcelPath;

export const activeDataSource: ActiveDataSource =
  requestedDataSource === "supabase"
    ? isSupabaseConfigured
      ? "supabase"
      : "demo"
    : "excel";

export const isDemoMode = activeDataSource === "demo";
export const isExcelMode = activeDataSource === "excel";
export const isSupabaseMode = activeDataSource === "supabase";

export function getStorageLabel() {
  if (activeDataSource === "excel") {
    return `Excel (${excelDbPath})`;
  }
  if (activeDataSource === "supabase") {
    return "Supabase";
  }
  return "Demo";
}
