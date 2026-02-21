import fs from "node:fs";
import path from "node:path";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

type ServiceAccountLike = {
  projectId?: string;
  project_id?: string;
  clientEmail?: string;
  client_email?: string;
  privateKey?: string;
  private_key?: string;
};

function resolveServiceAccountFromEnv(): ServiceAccountLike | null {
  const filePath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH?.trim();
  if (filePath) {
    const absolutePath = path.isAbsolute(filePath)
      ? filePath
      : path.join(process.cwd(), filePath);
    if (fs.existsSync(absolutePath)) {
      const raw = fs.readFileSync(absolutePath, "utf8");
      const parsed = JSON.parse(raw) as ServiceAccountLike;
      return {
        projectId: parsed.projectId ?? parsed.project_id,
        clientEmail: parsed.clientEmail ?? parsed.client_email,
        privateKey: parsed.privateKey ?? parsed.private_key,
      };
    }
  }

  const projectId = process.env.FIREBASE_PROJECT_ID?.trim();
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL?.trim();
  const privateKeyRaw = process.env.FIREBASE_PRIVATE_KEY?.trim();
  if (!projectId || !clientEmail || !privateKeyRaw) {
    return null;
  }
  const privateKeyNormalized = privateKeyRaw
    .replace(/^\\?"/, "")
    .replace(/\\?"$/, "");

  return {
    projectId,
    clientEmail,
    privateKey: privateKeyNormalized.replace(/\\n/g, "\n"),
  };
}

const serviceAccount = resolveServiceAccountFromEnv();

export const isFirebaseConfigured = Boolean(
  serviceAccount?.projectId && serviceAccount?.clientEmail && serviceAccount?.privateKey,
);

export function getFirestoreServerClient() {
  if (!isFirebaseConfigured || !serviceAccount) {
    return null;
  }

  if (getApps().length === 0) {
    initializeApp({
      credential: cert({
        projectId: serviceAccount.projectId!,
        clientEmail: serviceAccount.clientEmail!,
        privateKey: serviceAccount.privateKey!,
      }),
    });
  }

  const databaseId = process.env.FIREBASE_DATABASE_ID?.trim();
  if (databaseId) {
    return getFirestore(databaseId);
  }
  return getFirestore();
}
