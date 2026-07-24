export type KmpMaterialAmountOption = {
  label: string;
  amount: number;
};

export type KmpMaterialChecklistRule = {
  key: string;
  label: string;
  keywords: readonly string[];
  amountTargets?: readonly number[];
  amountOptions?: readonly KmpMaterialAmountOption[];
  minimumDetectedAmount?: number;
};

const REMOVED_KMP_CIANJUR_MATERIAL_PATTERNS = [
  "hollo",
  "hollow",
  "holo",
  "wiremesh",
  "wire mesh",
] as const;

export const KMP_CIANJUR_MATERIAL_CHECKLIST = [
  {
    key: "semen",
    label: "Semen",
    keywords: ["semen", "cement"],
    amountTargets: [9300000, 10500000],
    amountOptions: [
      { label: "Utara", amount: 9300000 },
      { label: "Selatan", amount: 10500000 },
    ],
  },
  {
    key: "besi",
    label: "Besi",
    keywords: ["besi"],
    amountTargets: [39569320],
  },
  {
    key: "alumunium",
    label: "Alumunium",
    keywords: ["aluminium", "alumunium", "aluminum"],
    amountTargets: [25000000],
  },
  {
    key: "atap",
    label: "Atap",
    keywords: ["atap", "spandek"],
    amountTargets: [113577500],
  },
  {
    key: "cnp",
    label: "CNP",
    keywords: ["cnp", "kanal cnp"],
    amountTargets: [7894933],
  },
  {
    key: "folding_gate",
    label: "Folding Gate",
    keywords: ["folding gate", "polding gate"],
    amountTargets: [29641185],
  },
  {
    key: "logo_akrilik",
    label: "Logo Akrilik",
    keywords: ["logo", "akrilik", "acrylic"],
    amountTargets: [6500000],
  },
  {
    key: "mep",
    label: "MEP",
    keywords: ["mep", "mat me", "material me", "mekanikal elektrikal", "m/e", "mekanikal", "elektrikal"],
    amountTargets: [13855500],
  },
  {
    key: "pln_kdkmp",
    label: "PLN KDKMP",
    keywords: ["pln kdkmp", "kdkmp"],
    amountTargets: [16030000],
  },
  {
    key: "zincromate",
    label: "Zincromate",
    keywords: ["zincromate", "zinkromate", "zinc chromate"],
    amountTargets: [2100000],
  },
  {
    key: "thiner",
    label: "Thiner",
    keywords: ["thiner", "thinner", "tiner"],
    amountTargets: [1170000],
  },
  {
    key: "beton",
    label: "Beton",
    keywords: ["beton", "ready mix", "readymix"],
    amountTargets: [60000000],
  },
  {
    key: "cat",
    label: "Cat",
    keywords: ["cat", "paint"],
    amountTargets: [5500000],
    minimumDetectedAmount: 5500000,
  },
] as const satisfies readonly KmpMaterialChecklistRule[];

export function isRemovedKmpCianjurMaterial(value: string | null | undefined) {
  const normalized = (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
  if (!normalized) {
    return false;
  }
  return REMOVED_KMP_CIANJUR_MATERIAL_PATTERNS.some((pattern) => normalized === pattern);
}

export function getKmpCianjurMaterialRule(key: string): KmpMaterialChecklistRule | null {
  return KMP_CIANJUR_MATERIAL_CHECKLIST.find((item) => item.key === key) ?? null;
}

export function getKmpCianjurMaterialAmountOptions(rule: KmpMaterialChecklistRule) {
  if (rule.amountOptions && rule.amountOptions.length > 0) {
    return rule.amountOptions;
  }

  return (rule.amountTargets ?? []).map((amount) => ({
    label: "Sistem",
    amount,
  }));
}
