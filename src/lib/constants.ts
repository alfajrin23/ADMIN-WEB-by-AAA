export const COST_CATEGORIES = [
  { value: "material", label: "Material" },
  { value: "upah_kasbon_tukang", label: "Upah / Kasbon Tukang" },
  { value: "upah_staff_pelaksana", label: "Upah Staff Pelaksana" },
  { value: "upah_tim_spesialis", label: "Upah Tim Spesialis" },
  { value: "alat", label: "Alat" },
  { value: "operasional", label: "Operasional" },
] as const;

export type CostCategory = string;

const DEFAULT_CATEGORY_STYLE = "bg-slate-100 text-slate-700";
const FALLBACK_CATEGORY_STYLES = [
  "bg-blue-100 text-blue-700",
  "bg-emerald-100 text-emerald-700",
  "bg-amber-100 text-amber-700",
  "bg-cyan-100 text-cyan-700",
  "bg-rose-100 text-rose-700",
  "bg-indigo-100 text-indigo-700",
  "bg-lime-100 text-lime-700",
] as const;

export const COST_CATEGORY_LABEL: Record<string, string> = {
  material: "Material",
  upah_kasbon_tukang: "Upah / Kasbon Tukang",
  upah_staff_pelaksana: "Upah Staff Pelaksana",
  upah_tim_spesialis: "Upah Tim Spesialis",
  alat: "Alat",
  operasional: "Operasional",
};

export const COST_CATEGORY_STYLE: Record<string, string> = {
  material: "bg-blue-100 text-blue-700",
  upah_kasbon_tukang: "bg-emerald-100 text-emerald-700",
  upah_staff_pelaksana: "bg-indigo-100 text-indigo-700",
  upah_tim_spesialis: "bg-cyan-100 text-cyan-700",
  alat: "bg-amber-100 text-amber-700",
  operasional: "bg-rose-100 text-rose-700",
};

const COST_CATEGORY_ALIAS: Record<string, string> = {
  pasir: "material",
};

export type ExpenseCategoryOption = {
  value: string;
  label: string;
};

function toTitleCaseWord(word: string) {
  if (!word) {
    return word;
  }
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}

export function toCategorySlug(value: string) {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_");
  if (!normalized) {
    return "";
  }
  return COST_CATEGORY_ALIAS[normalized] ?? normalized;
}

export function formatCostCategoryLabel(value: string) {
  const normalized = value.trim().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
  if (!normalized) {
    return "Kategori";
  }
  return normalized
    .split(" ")
    .map((part) => toTitleCaseWord(part))
    .join(" ");
}

export function getCostCategoryLabel(category: string) {
  return COST_CATEGORY_LABEL[category] ?? formatCostCategoryLabel(category);
}

function getCategoryStyleHash(category: string) {
  let hash = 0;
  for (let index = 0; index < category.length; index += 1) {
    hash = (hash * 31 + category.charCodeAt(index)) >>> 0;
  }
  return hash;
}

export function getCostCategoryStyle(category: string) {
  if (COST_CATEGORY_STYLE[category]) {
    return COST_CATEGORY_STYLE[category];
  }
  if (!category) {
    return DEFAULT_CATEGORY_STYLE;
  }
  const hash = getCategoryStyleHash(category);
  return FALLBACK_CATEGORY_STYLES[hash % FALLBACK_CATEGORY_STYLES.length] ?? DEFAULT_CATEGORY_STYLE;
}

export function mergeExpenseCategoryOptions(
  ...sources: Array<Array<string | ExpenseCategoryOption> | undefined>
): ExpenseCategoryOption[] {
  const defaults = COST_CATEGORIES.map((item) => ({
    value: item.value,
    label: item.label,
  }));
  const byValue = new Map<string, ExpenseCategoryOption>(
    defaults.map((item) => [item.value, item] as [string, ExpenseCategoryOption]),
  );
  const orderedValues: string[] = defaults.map((item) => item.value);

  const upsert = (item: string | ExpenseCategoryOption) => {
    const valueRaw = typeof item === "string" ? item : item.value;
    const value = toCategorySlug(valueRaw);
    if (!value) {
      return;
    }
    const explicitLabel = typeof item === "string" ? "" : item.label;
    const label = explicitLabel.trim() || getCostCategoryLabel(value);
    if (!byValue.has(value)) {
      orderedValues.push(value);
    }
    byValue.set(value, { value, label });
  };

  for (const source of sources) {
    for (const item of source ?? []) {
      upsert(item);
    }
  }

  return orderedValues.map((value) => byValue.get(value)).filter((item): item is ExpenseCategoryOption => Boolean(item));
}

export function parseCategoryListInput(value: string) {
  return Array.from(
    new Set(
      value
        .split(/[,\n;]/)
        .map((item) => toCategorySlug(item))
        .filter((item) => item.length > 0),
    ),
  );
}

export const ATTENDANCE_STATUSES = [
  { value: "hadir", label: "Hadir" },
  { value: "izin", label: "Izin" },
  { value: "sakit", label: "Sakit" },
  { value: "alpa", label: "Alpa" },
] as const;

export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number]["value"];

export const ATTENDANCE_STATUS_LABEL: Record<AttendanceStatus, string> = {
  hadir: "Hadir",
  izin: "Izin",
  sakit: "Sakit",
  alpa: "Alpa",
};

export const ATTENDANCE_STATUS_STYLE: Record<AttendanceStatus, string> = {
  hadir: "bg-emerald-100 text-emerald-700",
  izin: "bg-amber-100 text-amber-700",
  sakit: "bg-cyan-100 text-cyan-700",
  alpa: "bg-rose-100 text-rose-700",
};

export const REIMBURSE_TYPES = [
  { value: "material", label: "Material" },
  { value: "kekurangan_dana", label: "Kekurangan Dana" },
] as const;

export type ReimburseType = (typeof REIMBURSE_TYPES)[number]["value"];

export const REIMBURSE_TYPE_LABEL: Record<ReimburseType, string> = {
  material: "Material",
  kekurangan_dana: "Kekurangan Dana",
};

export const WORKER_TEAMS = [
  { value: "tukang", label: "Tukang" },
  { value: "laden", label: "Laden" },
  { value: "spesialis", label: "Tim Spesialis" },
] as const;

export type WorkerTeam = (typeof WORKER_TEAMS)[number]["value"];

export const WORKER_TEAM_LABEL: Record<WorkerTeam, string> = {
  tukang: "Tukang",
  laden: "Laden",
  spesialis: "Tim Spesialis",
};

export const SPECIALIST_COST_PRESETS = [
  { value: "listrik", label: "Listrik" },
  { value: "baja", label: "Baja" },
  { value: "sipil", label: "Sipil" },
] as const;

export type SpecialistCostPreset = (typeof SPECIALIST_COST_PRESETS)[number]["value"];

export const PROJECT_STATUSES = [
  { value: "aktif", label: "Aktif" },
  { value: "selesai", label: "Selesai" },
  { value: "tertunda", label: "Tertunda" },
] as const;

export type ProjectStatus = (typeof PROJECT_STATUSES)[number]["value"];

export const PROJECT_STATUS_STYLE: Record<ProjectStatus, string> = {
  aktif: "bg-emerald-100 text-emerald-700",
  selesai: "bg-blue-100 text-blue-700",
  tertunda: "bg-amber-100 text-amber-700",
};
