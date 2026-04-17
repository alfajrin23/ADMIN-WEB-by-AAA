import { describe, it, expect } from "vitest";
import { checkRateLimit, type RateLimitConfig } from "@/lib/rate-limit";

describe("checkRateLimit", () => {
  const testConfig: RateLimitConfig = {
    maxAttempts: 3,
    windowMs: 5000,
  };

  it("should allow requests within the limit", () => {
    const key = `test-allow-${Date.now()}`;
    const result1 = checkRateLimit(key, testConfig);
    expect(result1.success).toBe(true);
    expect(result1.remaining).toBe(2);

    const result2 = checkRateLimit(key, testConfig);
    expect(result2.success).toBe(true);
    expect(result2.remaining).toBe(1);

    const result3 = checkRateLimit(key, testConfig);
    expect(result3.success).toBe(true);
    expect(result3.remaining).toBe(0);
  });

  it("should block requests over the limit", () => {
    const key = `test-block-${Date.now()}`;
    checkRateLimit(key, testConfig);
    checkRateLimit(key, testConfig);
    checkRateLimit(key, testConfig);

    const result = checkRateLimit(key, testConfig);
    expect(result.success).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it("should allow requests from different keys independently", () => {
    const key1 = `test-key1-${Date.now()}`;
    const key2 = `test-key2-${Date.now()}`;

    checkRateLimit(key1, testConfig);
    checkRateLimit(key1, testConfig);
    checkRateLimit(key1, testConfig);

    const result1 = checkRateLimit(key1, testConfig);
    expect(result1.success).toBe(false);

    const result2 = checkRateLimit(key2, testConfig);
    expect(result2.success).toBe(true);
    expect(result2.remaining).toBe(2);
  });

  it("should return resetAt timestamp in the future", () => {
    const key = `test-reset-${Date.now()}`;
    const result = checkRateLimit(key, testConfig);
    expect(result.resetAt).toBeGreaterThan(Date.now());
  });
});
