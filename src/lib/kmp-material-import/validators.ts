export const KMP_MATERIAL_IMPORT_MAX_FILE_SIZE = 10 * 1024 * 1024;
export const KMP_MATERIAL_IMPORT_CLIENT_KEY = "kmp cianjur";
export const KMP_MATERIAL_IMPORT_CLIENT_NAME = "KMP Cianjur";

export function normalizeImportText(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function normalizeProjectIdentity(value: string | null | undefined) {
  return normalizeImportText(value)
    .replace(/^(?:kelurahan|kel|desa|ds)\s+/, "")
    .trim();
}

export function normalizeMaterialKey(value: string | null | undefined) {
  return normalizeImportText(value).replace(/\s+/g, "_");
}

export function parseSafeNumber(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) && Number.isSafeInteger(value) ? value : null;
  }
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim().replace(/\s+/g, "");
  if (!/^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/.test(normalized)) {
    return null;
  }
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && Number.isSafeInteger(parsed) ? parsed : null;
}

export function validateMaterialAmount(value: number) {
  if (!Number.isFinite(value)) {
    return "Nominal bukan angka yang valid.";
  }
  if (!Number.isSafeInteger(value)) {
    return "Nominal melebihi batas aman.";
  }
  if (value <= 0) {
    return value === 0 ? "Nominal material tidak boleh nol." : "Nominal material tidak boleh negatif.";
  }
  return "";
}

export function isKmpCianjurClient(value: string | null | undefined) {
  return normalizeImportText(value).includes(KMP_MATERIAL_IMPORT_CLIENT_KEY);
}

export function validateImportFile(file: File) {
  const name = file.name.trim();
  if (!name.toLowerCase().endsWith(".xlsx")) {
    return "File harus menggunakan format .xlsx.";
  }
  if (file.size <= 0) {
    return "File Excel kosong.";
  }
  if (file.size > KMP_MATERIAL_IMPORT_MAX_FILE_SIZE) {
    return "Ukuran file melebihi batas 10 MB.";
  }
  return "";
}

export function validateExpenseDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}
