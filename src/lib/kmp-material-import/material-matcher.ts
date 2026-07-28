import { KMP_CIANJUR_MATERIAL_CHECKLIST } from "@/lib/kmp-materials";
import type { KmpClientMaterialConfig } from "@/lib/data";
import type {
  KmpMaterialImportMaster,
  KmpMaterialImportMaterialAlias,
  KmpMaterialImportSplitPart,
  MaterialMatchConfidence,
} from "@/lib/kmp-material-import/types";
import {
  KMP_MATERIAL_IMPORT_CLIENT_KEY,
  normalizeImportText,
  normalizeMaterialKey,
} from "@/lib/kmp-material-import/validators";
import { getTextSimilarity } from "@/lib/kmp-material-import/project-matcher";

const BUILT_IN_MATERIAL_ALIASES: Record<string, string> = {
  folding: "folding_gate",
  "folding gate": "folding_gate",
  me: "mep",
  "m e": "mep",
  logo: "logo_akrilik",
  pln: "pln_kdkmp",
  zinkromate: "zincromate",
  zinchromate: "zincromate",
  thinner: "thiner",
  kramik: "keramik",
};

export function buildKmpMaterialImportMasters(
  configs: KmpClientMaterialConfig[],
): KmpMaterialImportMaster[] {
  const configByKey = new Map(
    configs
      .filter((config) => config.clientKey === KMP_MATERIAL_IMPORT_CLIENT_KEY)
      .map((config) => [config.materialKey, config] as const),
  );
  const masters: KmpMaterialImportMaster[] = KMP_CIANJUR_MATERIAL_CHECKLIST.map((rule) => {
    const config = configByKey.get(rule.key);
    return {
      id: config?.id ?? null,
      materialKey: rule.key,
      materialName: config?.materialName || rule.label,
      submissionName: config?.submissionName ?? null,
      standardAmount: config?.standardAmount ?? rule.amountTargets?.[0] ?? 0,
      minimumAmount:
        config?.minimumAmount ??
        ("minimumDetectedAmount" in rule ? rule.minimumDetectedAmount : 0) ??
        0,
      checklistType: config?.checklistType ?? "system",
      checklistStatus: config?.checklistStatus ?? "auto",
      aliases: Array.from(
        new Set([
          rule.label,
          rule.key,
          ...rule.keywords,
          ...(config ? [config.materialName] : []),
        ]),
      ),
      isStatic: true,
    };
  });
  const staticKeys = new Set(masters.map((master) => master.materialKey));

  for (const config of configs) {
    if (
      config.clientKey !== KMP_MATERIAL_IMPORT_CLIENT_KEY ||
      staticKeys.has(config.materialKey)
    ) {
      continue;
    }
    masters.push({
      id: config.id,
      materialKey: config.materialKey,
      materialName: config.materialName,
      submissionName: config.submissionName,
      standardAmount: config.standardAmount,
      minimumAmount: config.minimumAmount,
      checklistType: config.checklistType,
      checklistStatus: config.checklistStatus,
      aliases: [config.materialName, config.materialKey],
      isStatic: false,
    });
  }
  return masters.sort((left, right) =>
    left.materialName.localeCompare(right.materialName, "id-ID"),
  );
}

function findMaster(
  masters: KmpMaterialImportMaster[],
  materialKey: string,
) {
  return masters.find((master) => master.materialKey === materialKey) ?? null;
}

function createSplitSuggestion(
  sourceAmount: number,
  masters: KmpMaterialImportMaster[],
): KmpMaterialImportSplitPart[] | null {
  const zincromate = findMaster(masters, "zincromate");
  const thiner = findMaster(masters, "thiner");
  if (!zincromate || !thiner) {
    return null;
  }
  const zincromateAmount = zincromate.standardAmount || 2_100_000;
  const thinerAmount = thiner.standardAmount || 1_170_000;
  if (zincromateAmount + thinerAmount !== sourceAmount) {
    return null;
  }
  return [
    {
      materialKey: zincromate.materialKey,
      materialName: zincromate.materialName,
      amount: zincromateAmount,
    },
    {
      materialKey: thiner.materialKey,
      materialName: thiner.materialName,
      amount: thinerAmount,
    },
  ];
}

export type KmpMaterialMatchResult = {
  materialKey: string | null;
  materialName: string | null;
  submissionName: string | null;
  confidence: MaterialMatchConfidence;
  needsReview: boolean;
  suggestedSplit: KmpMaterialImportSplitPart[] | null;
  warning: string | null;
};

export function matchKmpMaterial(input: {
  sourceLabel: string | null;
  amount: number;
  masters: KmpMaterialImportMaster[];
  aliases?: KmpMaterialImportMaterialAlias[];
}): KmpMaterialMatchResult {
  const normalizedLabel = normalizeImportText(input.sourceLabel);
  if (!normalizedLabel) {
    return {
      materialKey: null,
      materialName: null,
      submissionName: null,
      confidence: "Unresolved",
      needsReview: true,
      suggestedSplit: null,
      warning: "Nama material belum tersedia.",
    };
  }

  if (
    normalizedLabel.includes("zinchromate") &&
    (normalizedLabel.includes("thiner") || normalizedLabel.includes("thinner"))
  ) {
    return {
      materialKey: null,
      materialName: input.sourceLabel,
      submissionName: null,
      confidence: "Suggested",
      needsReview: true,
      suggestedSplit: createSplitSuggestion(input.amount, input.masters),
      warning: "Material gabungan perlu dipilih: simpan gabungan atau pecah.",
    };
  }

  const normalizedAsKey = normalizeMaterialKey(input.sourceLabel);
  const exactKey = input.masters.find(
    (master) => normalizeMaterialKey(master.materialKey) === normalizedAsKey,
  );
  if (exactKey) {
    return {
      materialKey: exactKey.materialKey,
      materialName: exactKey.materialName,
      submissionName: exactKey.submissionName,
      confidence: "Exact",
      needsReview: false,
      suggestedSplit: null,
      warning: null,
    };
  }

  const exactName = input.masters.find(
    (master) => normalizeImportText(master.materialName) === normalizedLabel,
  );
  if (exactName) {
    return {
      materialKey: exactName.materialKey,
      materialName: exactName.materialName,
      submissionName: exactName.submissionName,
      confidence: "Exact",
      needsReview: false,
      suggestedSplit: null,
      warning: null,
    };
  }

  const rememberedAlias = input.aliases?.find(
    (alias) =>
      alias.clientKey === KMP_MATERIAL_IMPORT_CLIENT_KEY &&
      normalizeImportText(alias.sourceLabel) === normalizedLabel,
  );
  if (rememberedAlias?.split?.length) {
    return {
      materialKey: null,
      materialName: input.sourceLabel,
      submissionName: null,
      confidence: "Alias",
      needsReview: true,
      suggestedSplit: rememberedAlias.split,
      warning: "Rule split tersimpan ditemukan dan perlu dikonfirmasi.",
    };
  }
  if (rememberedAlias) {
    const master = findMaster(input.masters, rememberedAlias.materialKey);
    if (master) {
      return {
        materialKey: master.materialKey,
        materialName: master.materialName,
        submissionName: master.submissionName,
        confidence: "Alias",
        needsReview: false,
        suggestedSplit: null,
        warning: null,
      };
    }
  }

  const aliasKey = BUILT_IN_MATERIAL_ALIASES[normalizedLabel];
  if (aliasKey) {
    const master = findMaster(input.masters, aliasKey);
    if (master) {
      return {
        materialKey: master.materialKey,
        materialName: master.materialName,
        submissionName: master.submissionName,
        confidence: "Alias",
        needsReview: false,
        suggestedSplit: null,
        warning: null,
      };
    }
  }

  const keywordMaster = input.masters.find((master) =>
    master.aliases.some((alias) => {
      const normalizedAlias = normalizeImportText(alias);
      return (
        normalizedAlias.length >= 2 &&
        (` ${normalizedLabel} `.includes(` ${normalizedAlias} `) ||
          ` ${normalizedAlias} `.includes(` ${normalizedLabel} `))
      );
    }),
  );
  if (keywordMaster) {
    const isAtapVariant =
      keywordMaster.materialKey === "atap" && normalizedLabel !== normalizeImportText(keywordMaster.materialName);
    return {
      materialKey: keywordMaster.materialKey,
      materialName: keywordMaster.materialName,
      submissionName: keywordMaster.submissionName,
      confidence: isAtapVariant ? "Suggested" : "Alias",
      needsReview: isAtapVariant,
      suggestedSplit: null,
      warning: isAtapVariant
        ? `"${input.sourceLabel}" disarankan ke ${keywordMaster.materialName}; konfirmasi diperlukan.`
        : null,
    };
  }

  const fuzzy = input.masters
    .map((master) => ({
      master,
      similarity: Math.max(
        getTextSimilarity(normalizedLabel, master.materialName),
        ...master.aliases.map((alias) => getTextSimilarity(normalizedLabel, alias)),
      ),
    }))
    .sort((left, right) => right.similarity - left.similarity)[0];
  if (fuzzy && fuzzy.similarity >= 0.72) {
    return {
      materialKey: fuzzy.master.materialKey,
      materialName: fuzzy.master.materialName,
      submissionName: fuzzy.master.submissionName,
      confidence: "Suggested",
      needsReview: true,
      suggestedSplit: null,
      warning: `Kemiripan nama ${(fuzzy.similarity * 100).toFixed(0)}%; konfirmasi diperlukan.`,
    };
  }

  return {
    materialKey: null,
    materialName: input.sourceLabel,
    submissionName: null,
    confidence: "Unresolved",
    needsReview: true,
    suggestedSplit: null,
    warning: "Label Excel belum cocok dengan master material.",
  };
}
