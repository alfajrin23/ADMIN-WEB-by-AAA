const currencyFormatter = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0,
});

const compactNumberFormatter = new Intl.NumberFormat("id-ID", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 1,
});

const dateFormatter = new Intl.DateTimeFormat("id-ID", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

export function formatCurrency(value: number) {
  return currencyFormatter.format(value);
}

export function formatCompactCurrency(value: number) {
  const compactSteps = [
    { divisor: 1_000_000_000_000, suffix: "T" },
    { divisor: 1_000_000_000, suffix: "M" },
    { divisor: 1_000_000, suffix: "jt" },
    { divisor: 1_000, suffix: "rb" },
  ] as const;

  const absoluteValue = Math.abs(value);
  const prefix = value < 0 ? "-Rp " : "Rp ";

  for (const step of compactSteps) {
    if (absoluteValue < step.divisor) {
      continue;
    }

    const rounded = Math.round((absoluteValue / step.divisor) * 10) / 10;
    const formatted = compactNumberFormatter.format(rounded).replace(/,0$/, "");
    return `${prefix}${formatted} ${step.suffix}`;
  }

  return `${prefix}${compactNumberFormatter.format(Math.round(absoluteValue))}`;
}

export function formatDate(value: string) {
  return dateFormatter.format(new Date(value));
}
