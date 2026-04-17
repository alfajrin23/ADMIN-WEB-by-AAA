/**
 * Rate limiter berbasis in-memory Map.
 * Untuk produksi skala besar, ganti dengan Redis-based solution.
 */

type RateLimitEntry = {
  count: number;
  resetAt: number;
};

const store = new Map<string, RateLimitEntry>();

// Bersihkan entry expired setiap 5 menit agar tidak memori leak
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
let lastCleanup = Date.now();

function cleanup() {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) {
    return;
  }
  lastCleanup = now;
  for (const [key, entry] of store) {
    if (now > entry.resetAt) {
      store.delete(key);
    }
  }
}

export type RateLimitConfig = {
  /** Jumlah maksimal request yang diizinkan */
  maxAttempts: number;
  /** Window waktu dalam milidetik */
  windowMs: number;
};

export type RateLimitResult = {
  success: boolean;
  remaining: number;
  resetAt: number;
};

/**
 * Check dan increment rate limit counter.
 * @param key - Identifier unik (misal: IP address, username, dsb.)
 * @param config - Konfigurasi limit
 * @returns RateLimitResult
 */
export function checkRateLimit(
  key: string,
  config: RateLimitConfig,
): RateLimitResult {
  cleanup();

  const now = Date.now();
  const entry = store.get(key);

  // Jika tidak ada entry atau sudah expired, buat baru
  if (!entry || now > entry.resetAt) {
    const newEntry: RateLimitEntry = {
      count: 1,
      resetAt: now + config.windowMs,
    };
    store.set(key, newEntry);
    return {
      success: true,
      remaining: config.maxAttempts - 1,
      resetAt: newEntry.resetAt,
    };
  }

  // Increment counter
  entry.count += 1;

  if (entry.count > config.maxAttempts) {
    return {
      success: false,
      remaining: 0,
      resetAt: entry.resetAt,
    };
  }

  return {
    success: true,
    remaining: config.maxAttempts - entry.count,
    resetAt: entry.resetAt,
  };
}

/**
 * Rate limit config untuk login attempts.
 * Max 5 percobaan per 15 menit per IP/username.
 */
export const LOGIN_RATE_LIMIT: RateLimitConfig = {
  maxAttempts: 5,
  windowMs: 15 * 60 * 1000, // 15 menit
};

/**
 * Rate limit config untuk register.
 * Max 3 percobaan per 30 menit per IP.
 */
export const REGISTER_RATE_LIMIT: RateLimitConfig = {
  maxAttempts: 3,
  windowMs: 30 * 60 * 1000, // 30 menit
};
