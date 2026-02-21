import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { GoogleAuth } from "google-auth-library";

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
    if (!key || process.env[key]) {
      continue;
    }
    const value = line.slice(equalsIndex + 1).trim();
    process.env[key] = value.replace(/^['"]|['"]$/g, "");
  }
}

function normalizePrivateKey(value) {
  return value
    .trim()
    .replace(/^\\?"/, "")
    .replace(/\\?"$/, "")
    .replace(/\\n/g, "\n");
}

function parseArgs() {
  const args = process.argv.slice(2);
  let location = "";
  let databaseId = process.env.FIREBASE_DATABASE_ID?.trim() || "(default)";
  for (const arg of args) {
    if (arg.startsWith("--location=")) {
      location = arg.slice("--location=".length).trim();
    }
    if (arg.startsWith("--database-id=")) {
      databaseId = arg.slice("--database-id=".length).trim() || "(default)";
    }
  }
  return { location, databaseId };
}

function getRequired(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Environment variable ${name} wajib diisi.`);
  }
  return value;
}

async function fetchWithAuth(client, url, init = {}) {
  const tokenValue = await client.getAccessToken();
  const token = typeof tokenValue === "string" ? tokenValue : tokenValue?.token;
  if (!token) {
    throw new Error("Gagal mendapatkan access token Google.");
  }
  return fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
}

async function checkDatabase(client, projectId, databaseId) {
  const encodedId = encodeURIComponent(databaseId);
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${encodedId}`;
  const response = await fetchWithAuth(client, url);
  if (response.status === 200) {
    return { exists: true, payload: await response.json() };
  }
  if (response.status === 404) {
    return { exists: false, payload: null };
  }
  const text = await response.text();
  throw new Error(`Gagal cek database Firestore. HTTP ${response.status}: ${text}`);
}

async function createDatabase(client, projectId, databaseId, locationId) {
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases?databaseId=${encodeURIComponent(databaseId)}`;
  const response = await fetchWithAuth(client, url, {
    method: "POST",
    body: JSON.stringify({
      type: "FIRESTORE_NATIVE",
      locationId,
    }),
  });
  const text = await response.text();
  if (response.status < 200 || response.status >= 300) {
    throw new Error(`Gagal create database. HTTP ${response.status}: ${text}`);
  }
  return JSON.parse(text);
}

async function waitOperation(client, operationName) {
  const url = `https://firestore.googleapis.com/v1/${operationName}`;
  for (let i = 0; i < 40; i += 1) {
    const response = await fetchWithAuth(client, url);
    const payload = await response.json();
    if (payload.done) {
      if (payload.error) {
        throw new Error(
          `Operasi gagal: ${payload.error.message ?? JSON.stringify(payload.error)}`,
        );
      }
      return payload;
    }
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }
  throw new Error("Timeout menunggu operasi create Firestore selesai.");
}

async function main() {
  loadEnvFile(path.join(process.cwd(), ".env.local"));
  loadEnvFile(path.join(process.cwd(), ".env"));

  const { location, databaseId } = parseArgs();
  const projectId = getRequired("FIREBASE_PROJECT_ID");
  const clientEmail = getRequired("FIREBASE_CLIENT_EMAIL");
  const privateKey = normalizePrivateKey(getRequired("FIREBASE_PRIVATE_KEY"));

  const auth = new GoogleAuth({
    credentials: {
      project_id: projectId,
      client_email: clientEmail,
      private_key: privateKey,
    },
    scopes: ["https://www.googleapis.com/auth/cloud-platform"],
  });
  const client = await auth.getClient();

  const existing = await checkDatabase(client, projectId, databaseId);
  if (existing.exists) {
    console.log(`Firestore database "${databaseId}" sudah ada.`);
    return;
  }

  if (!location) {
    throw new Error(
      `Database "${databaseId}" belum ada. Jalankan lagi dengan --location=REGION, contoh: npm run firebase:init -- --location=asia-southeast1`,
    );
  }

  console.log(`Membuat Firestore database "${databaseId}" di lokasi "${location}"...`);
  const operation = await createDatabase(client, projectId, databaseId, location);
  if (operation?.name) {
    await waitOperation(client, operation.name);
  }
  console.log(`Firestore database "${databaseId}" berhasil dibuat.`);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
