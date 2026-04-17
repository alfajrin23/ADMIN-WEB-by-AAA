import { describe, it, expect } from "vitest";
import {
  getString,
  getNumber,
  normalizeText,
  normalizeSearchText,
  isFirebaseNotFoundError,
  parseRupiahString,
} from "@/lib/shared-utils";

// Helper to create FormData
function createFormData(entries: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(entries)) {
    fd.set(key, value);
  }
  return fd;
}

describe("getString", () => {
  it("should extract and trim string from FormData", () => {
    const fd = createFormData({ name: "  hello  " });
    expect(getString(fd, "name")).toBe("hello");
  });

  it("should return empty string for missing key", () => {
    const fd = createFormData({});
    expect(getString(fd, "missing")).toBe("");
  });
});

describe("getNumber", () => {
  it("should parse integer from FormData", () => {
    const fd = createFormData({ amount: "1500000" });
    expect(getNumber(fd, "amount")).toBe(1500000);
  });

  it("should parse dot-separated Rupiah format", () => {
    const fd = createFormData({ amount: "1.500.000" });
    expect(getNumber(fd, "amount")).toBe(1500000);
  });

  it("should parse comma decimal format", () => {
    const fd = createFormData({ amount: "1.500,50" });
    expect(getNumber(fd, "amount")).toBe(1500.5);
  });

  it("should return 0 for non-numeric input", () => {
    const fd = createFormData({ amount: "abc" });
    expect(getNumber(fd, "amount")).toBe(0);
  });

  it("should return 0 for missing key", () => {
    const fd = createFormData({});
    expect(getNumber(fd, "missing")).toBe(0);
  });
});

describe("normalizeText", () => {
  it("should uppercase and strip non-alphanumeric", () => {
    expect(normalizeText("Hello World!")).toBe("HELLOWORLD");
    expect(normalizeText("abc-123")).toBe("ABC123");
  });
});

describe("normalizeSearchText", () => {
  it("should lowercase and collapse whitespace", () => {
    expect(normalizeSearchText("  Hello   World  ")).toBe("hello world");
  });
});

describe("isFirebaseNotFoundError", () => {
  it("should detect code 5", () => {
    expect(isFirebaseNotFoundError({ code: 5 })).toBe(true);
  });

  it("should detect string not-found code", () => {
    expect(isFirebaseNotFoundError({ code: "not-found" })).toBe(true);
    expect(isFirebaseNotFoundError({ code: "NOT_FOUND" })).toBe(true);
  });

  it("should detect NOT_FOUND in message", () => {
    expect(
      isFirebaseNotFoundError({ message: "Document NOT_FOUND in collection" }),
    ).toBe(true);
  });

  it("should return false for other errors", () => {
    expect(isFirebaseNotFoundError({ code: 404 })).toBe(false);
    expect(isFirebaseNotFoundError(null)).toBe(false);
    expect(isFirebaseNotFoundError(undefined)).toBe(false);
  });
});

describe("parseRupiahString", () => {
  it("should parse standard number", () => {
    expect(parseRupiahString("1500000")).toBe(1500000);
  });

  it("should parse dot-separated Rupiah", () => {
    expect(parseRupiahString("1.500.000")).toBe(1500000);
  });

  it("should handle Rp prefix", () => {
    expect(parseRupiahString("Rp 1.500.000")).toBe(1500000);
  });

  it("should return 0 for invalid input", () => {
    expect(parseRupiahString("")).toBe(0);
    expect(parseRupiahString("abc")).toBe(0);
  });
});
