import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import process from "node:process";
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import * as XLSX from "xlsx/xlsx.mjs";

const DEFAULT_EXCEL_PATH = path.join(process.cwd(), "data", "admin-web.xlsx");
const SHEETS = ["projects", "project_expenses", "attendance_records", "payroll_resets"];
const args = process.argv.slice(2);
const shouldClear = args.includes("--clear");
const sourceArg = args.find((arg) => arg.startsWith("--source="));
const sourcePath = sourceArg ? sourceArg.slice("--source=".length) : "";

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return;
  }
  const content = fs.readFileSync(filePath, "utf8");
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }
    const equalsIndex = line.indexOf("=");
    if (equalsIndex <= 0) {
      continue;
    }
    const key = line.slice(0, equalsIndex).trim();
    const value = line.slice(equalsIndex + 1).trim();
    if (!key || process.env[key]) {
      continue;
    }
    process.env[key] = value.replace(/^['"]|['"]$/g, "");
  }
}

function ensureEnvLoaded() {
  loadEnvFile(path.join(process.cwd(), ".env.local"));
  loadEnvFile(path.join(process.cwd(), ".env"));
}

function getRequiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Environment variable ${name} wajib diisi.`);
  }
  return value;
}

function normalizeDateValue(value) {
  if (value == null) {
    return null;
  }
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString();
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed) {
      const month = String(parsed.m).padStart(2, "0");
      const day = String(parsed.d).padStart(2, "0");
      const hour = String(parsed.H ?? 0).padStart(2, "0");
      const minute = String(parsed.M ?? 0).padStart(2, "0");
      const second = String(Math.floor(parsed.S ?? 0)).padStart(2, "0");
      return `${parsed.y}-${month}-${day}T${hour}:${minute}:${second}.000Z`;
    }
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    return trimmed;
  }
  return value;
}

function normalizeRow(row) {
  const normalized = {};
  for (const [key, value] of Object.entries(row)) {
    if (key.endsWith("_date") || key.endsWith("_at")) {
      normalized[key] = normalizeDateValue(value);
      continue;
    }
    normalized[key] = value;
  }
  return normalized;
}

function readSheetRows(workbook, sheetName) {
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) {
    return [];
  }
  return XLSX.utils.sheet_to_json(sheet, {
    defval: null,
    raw: true,
  });
}

async function clearCollection(db, collectionName) {
  while (true) {
    const snapshot = await db.collection(collectionName).limit(400).get();
    if (snapshot.empty) {
      break;
    }

    const batch = db.batch();
    for (const doc of snapshot.docs) {
      batch.delete(doc.ref);
    }
    await batch.commit();
  }
}

async function writeCollection(db, collectionName, rows, clearFirst) {
  if (clearFirst) {
    await clearCollection(db, collectionName);
  }

  let written = 0;
  let batch = db.batch();
  let batchCount = 0;
  for (const rawRow of rows) {
    const row = normalizeRow(rawRow);
    const id = typeof row.id === "string" && row.id.trim() ? row.id.trim() : randomUUID();
    row.id = id;
    const docRef = db.collection(collectionName).doc(id);
    batch.set(docRef, row, { merge: true });
    written += 1;
    batchCount += 1;

    if (batchCount >= 400) {
      await batch.commit();
      batch = db.batch();
      batchCount = 0;
    }
  }

  if (batchCount > 0) {
    await batch.commit();
  }

  return written;
}

async function main() {
  ensureEnvLoaded();

  const projectId = getRequiredEnv("FIREBASE_PROJECT_ID");
  const clientEmail = getRequiredEnv("FIREBASE_CLIENT_EMAIL");
  const privateKey = getRequiredEnv("FIREBASE_PRIVATE_KEY").replace(/\\n/g, "\n");
  const excelPath = sourcePath || process.env.EXCEL_DB_PATH?.trim() || DEFAULT_EXCEL_PATH;

  if (!fs.existsSync(excelPath)) {
    throw new Error(`File Excel tidak ditemukan: ${excelPath}`);
  }

  if (getApps().length === 0) {
    initializeApp({
      credential: cert({
        projectId,
        clientEmail,
        privateKey,
      }),
    });
  }

  const db = getFirestore();
  const workbook = XLSX.readFile(excelPath, { cellDates: true });
  const summary = {};

  for (const sheetName of SHEETS) {
    const rows = readSheetRows(workbook, sheetName);
    const count = await writeCollection(db, sheetName, rows, shouldClear);
    summary[sheetName] = count;
  }

  console.log("Migrasi Firebase selesai.");
  console.log(`Sumber Excel: ${excelPath}`);
  console.log(`Mode clear koleksi: ${shouldClear ? "YA" : "TIDAK"}`);
  for (const sheetName of SHEETS) {
    console.log(`- ${sheetName}: ${summary[sheetName] ?? 0} dokumen`);
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error("Migrasi Firebase gagal:", message);
  process.exitCode = 1;
});
