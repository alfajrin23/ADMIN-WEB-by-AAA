export const COST_CATEGORIES = [
  { value: "material", label: "Material" },
  { value: "upah_kasbon_tukang", label: "Upah / Kasbon Tukang" },
  { value: "upah_staff_pelaksana", label: "Upah Staff Pelaksana" },
  { value: "upah_tim_spesialis", label: "Upah Tim Spesialis" },
  { value: "alat", label: "Alat" },
  { value: "operasional", label: "Operasional" },
] as const;

export type CostCategory = (typeof COST_CATEGORIES)[number]["value"];

export const COST_CATEGORY_LABEL: Record<CostCategory, string> = {
  material: "Material",
  upah_kasbon_tukang: "Upah / Kasbon Tukang",
  upah_staff_pelaksana: "Upah Staff Pelaksana",
  upah_tim_spesialis: "Upah Tim Spesialis",
  alat: "Alat",
  operasional: "Operasional",
};

export const COST_CATEGORY_STYLE: Record<CostCategory, string> = {
  material: "bg-blue-100 text-blue-700",
  upah_kasbon_tukang: "bg-emerald-100 text-emerald-700",
  upah_staff_pelaksana: "bg-indigo-100 text-indigo-700",
  upah_tim_spesialis: "bg-cyan-100 text-cyan-700",
  alat: "bg-amber-100 text-amber-700",
  operasional: "bg-rose-100 text-rose-700",
};

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
