import path from "node:path";
import { isFirebaseConfigured } from "@/lib/firebase";
import { isSupabaseConfigured } from "@/lib/supabase";

type RequestedDataSource = "excel" | "supabase" | "firebase";
export type ActiveDataSource = "excel" | "supabase" | "firebase" | "demo";

const requested = (process.env.DATA_SOURCE ?? "supabase").toLowerCase();
const requestedDataSource: RequestedDataSource =
  requested === "supabase" ? "supabase" : requested === "firebase" ? "firebase" : "excel";

const configuredExcelPath =
  process.env.EXCEL_DB_PATH?.trim() || path.join(process.cwd(), "data", "admin-web.xlsx");

export const excelDbPath = configuredExcelPath;

export const activeDataSource: ActiveDataSource =
  requestedDataSource === "supabase"
    ? isSupabaseConfigured
      ? "supabase"
      : "demo"
    : requestedDataSource === "firebase"
      ? isFirebaseConfigured
        ? "firebase"
        : "demo"
      : "excel";

export const isDemoMode = activeDataSource === "demo";
export const isExcelMode = activeDataSource === "excel";
export const isSupabaseMode = activeDataSource === "supabase";
export const isFirebaseMode = activeDataSource === "firebase";

export function getStorageLabel() {
  if (activeDataSource === "excel") {
    return `Excel (${excelDbPath})`;
  }
  if (activeDataSource === "supabase") {
    return "Supabase";
  }
  if (activeDataSource === "firebase") {
    return "Firebase (Firestore)";
  }
  return "Demo";
}
