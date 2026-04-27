type HokImportPreset = {
  projectId: string;
  projectName: string;
  clientName?: string | null;
};

type HokImportMatch = {
  rowNumber: number;
  projectId: string;
  projectName: string;
  sourceProjectName: string;
  requesterName: string;
  amountRaw: string;
};

type HokImportIssue = {
  rowNumber: number;
  sourceProjectName: string;
};

type HokImportInvalidRow = HokImportIssue & {
  reason: "missing_project" | "missing_amount";
};

type HokImportDuplicateRow = HokImportIssue & {
  projectId: string;
};

type HokImportResult = {
  headerDetected: boolean;
  parsedRowCount: number;
  matchedRows: HokImportMatch[];
  unmatchedRows: HokImportIssue[];
  invalidRows: HokImportInvalidRow[];
  duplicateRows: HokImportDuplicateRow[];
};

type HokHeaderRole = "project" | "requester" | "amount";

const HEADER_KEYWORDS: Record<HokHeaderRole, string[]> = {
  project: [
    "project",
    "proyek",
    "nama project",
    "nama proyek",
    "project name",
    "nama pekerjaan",
    "pekerjaan",
  ],
  requester: [
    "nama pengajuan",
    "pengajuan",
    "nama pengaju",
    "pengaju",
    "requester",
    "pemohon",
    "mandor",
  ],
  amount: [
    "nominal",
    "jumlah",
    "amount",
    "nilai",
    "total",
    "biaya",
    "rupiah",
    "hok",
  ],
};

function normalizeCellText(value: unknown) {
  if (value == null) {
    return "";
  }
  return String(value).trim();
}

function normalizeLookupText(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function normalizeLookupKey(value: string) {
  return normalizeLookupText(value).replace(/\s+/g, "");
}

function tokenizeLookup(value: string) {
  return normalizeLookupText(value)
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token.length > 1);
}

function normalizeAmountRaw(value: string) {
  const digits = value.replace(/[^\d]/g, "");
  if (!digits) {
    return "";
  }
  return digits.replace(/^0+(?=\d)/, "") || "0";
}

function isProbablyAmountCell(value: string) {
  if (!value.trim()) {
    return false;
  }
  const amountRaw = normalizeAmountRaw(value);
  if (!amountRaw) {
    return false;
  }
  return /^[\d\s.,rpRP-]+$/.test(value.trim());
}

function isSerialNumberCell(value: string) {
  return /^\d{1,4}$/.test(value.trim());
}

function isHeaderMatch(value: string, role: HokHeaderRole) {
  const normalized = normalizeLookupText(value);
  if (!normalized) {
    return false;
  }
  return HEADER_KEYWORDS[role].some((keyword) => normalized.includes(keyword));
}

function detectHeaderColumns(row: string[]) {
  const header = {
    project: -1,
    requester: -1,
    amount: -1,
  };

  row.forEach((cell, index) => {
    if (header.project < 0 && isHeaderMatch(cell, "project")) {
      header.project = index;
    }
    if (header.requester < 0 && isHeaderMatch(cell, "requester")) {
      header.requester = index;
    }
    if (header.amount < 0 && isHeaderMatch(cell, "amount")) {
      header.amount = index;
    }
  });

  const recognizedCount =
    Number(header.project >= 0) + Number(header.requester >= 0) + Number(header.amount >= 0);
  const headerDetected = header.project >= 0 && header.amount >= 0 && recognizedCount >= 2;

  return {
    headerDetected,
    projectIndex: header.project,
    requesterIndex: header.requester >= 0 ? header.requester : null,
    amountIndex: header.amount,
  };
}

function diceCoefficient(str1: string, str2: string): number {
  const s1 = str1.replace(/\s+/g, "");
  const s2 = str2.replace(/\s+/g, "");
  if (s1 === s2) return 1;
  if (s1.length < 2 || s2.length < 2) return s1 === s2 ? 1 : 0;
  
  let bigrams1 = [];
  for (let i = 0; i < s1.length - 1; i++) {
    bigrams1.push(s1.slice(i, i + 2));
  }
  let bigrams2 = [];
  for (let i = 0; i < s2.length - 1; i++) {
    bigrams2.push(s2.slice(i, i + 2));
  }

  let intersection = 0;
  let bg2Copy = [...bigrams2];
  for (let i = 0; i < bigrams1.length; i++) {
    const index = bg2Copy.indexOf(bigrams1[i]);
    if (index > -1) {
      intersection++;
      bg2Copy.splice(index, 1);
    }
  }

  return (2.0 * intersection) / (bigrams1.length + bigrams2.length);
}

function matchPresetByProjectName(value: string, presets: HokImportPreset[]) {
  const normalizedValue = normalizeLookupText(value);
  const normalizedKey = normalizedValue.replace(/\s+/g, "");
  if (!normalizedKey) {
    return null;
  }

  // 1. Try exact matches first (most reliable)
  const exactCandidates = presets.filter((preset) => {
    const presetProjectKey = normalizeLookupKey(preset.projectName);
    const presetProjectClientKey = normalizeLookupKey(`${preset.projectName} ${preset.clientName ?? ""}`);
    return normalizedKey === presetProjectKey || normalizedKey === presetProjectClientKey;
  });
  if (exactCandidates.length === 1) {
    return exactCandidates[0];
  }

  // 2. Token-based scoring
  const sourceTokens = tokenizeLookup(value);
  if (sourceTokens.length === 0) {
    return null;
  }

  let bestMatch: HokImportPreset | null = null;
  let maxScore = -1;

  for (const preset of presets) {
    const presetTokens = tokenizeLookup(`${preset.projectName} ${preset.clientName ?? ""}`);
    let score = 0;
    
    // Calculate how many source tokens appear in the preset
    for (const sToken of sourceTokens) {
      if (presetTokens.includes(sToken)) {
        score++;
      }
    }

    if (score > maxScore) {
      maxScore = score;
      bestMatch = preset;
    } else if (score === maxScore && score > 0 && bestMatch) {
      // Tie-breaker: prefer the one where more of the PRESET tokens are covered by the source
      // This helps when one preset is more specific than another
      const currentBestTokens = tokenizeLookup(`${bestMatch.projectName} ${bestMatch.clientName ?? ""}`);
      
      // If new preset has fewer tokens but same score, it's a "tighter" match
      if (presetTokens.length < currentBestTokens.length) {
        bestMatch = preset;
      }
    }
  }

  // Only return if we actually matched at least one token
  if (maxScore > 0) {
    return bestMatch;
  }

  // 3. Fallback to substring if no tokens matched
  if (normalizedKey.length >= 5) {
    const substringCandidates = presets.filter((preset) => {
      const presetProjectKey = normalizeLookupKey(preset.projectName);
      return presetProjectKey.includes(normalizedKey) || normalizedKey.includes(presetProjectKey);
    });
    if (substringCandidates.length === 1) {
      return substringCandidates[0];
    }
  }

  // 4. Fuzzy match using Dice Coefficient
  if (normalizedKey.length >= 4) {
    let bestFuzzyMatch: HokImportPreset | null = null;
    let maxFuzzyScore = 0;
    
    for (const preset of presets) {
      const presetProjectKey = normalizeLookupKey(preset.projectName);
      const presetClientKey = normalizeLookupKey(preset.clientName ?? "");
      
      const score1 = diceCoefficient(normalizedKey, presetProjectKey);
      const score2 = presetClientKey ? diceCoefficient(normalizedKey, presetProjectKey + presetClientKey) : 0;
      const score = Math.max(score1, score2);
      
      if (score > maxFuzzyScore) {
        maxFuzzyScore = score;
        bestFuzzyMatch = preset;
      }
    }
    
    // Configurable threshold: 0.6 is usually good for typos.
    if (maxFuzzyScore >= 0.6) {
      return bestFuzzyMatch;
    }
  }

  return null;
}


function parseRowWithoutHeader(row: string[]) {
  const nonEmptyCells = row.map(normalizeCellText);
  const amountIndex = [...nonEmptyCells.keys()]
    .reverse()
    .find((index) => isProbablyAmountCell(nonEmptyCells[index]));

  if (amountIndex == null || amountIndex < 0) {
    const firstTextCell = nonEmptyCells.find((cell) => cell.length > 0) ?? "";
    return {
      projectName: firstTextCell,
      requesterName: "",
      amountRaw: "",
    };
  }

  const textIndexes = nonEmptyCells
    .map((cell, index) => ({ cell, index }))
    .filter(({ cell, index }) => index !== amountIndex && cell.length > 0)
    .filter(({ cell, index }) => !(index === 0 && isSerialNumberCell(cell) && nonEmptyCells.length >= 3));

  return {
    projectName: textIndexes[0]?.cell ?? "",
    requesterName: textIndexes[1]?.cell ?? "",
    amountRaw: normalizeAmountRaw(nonEmptyCells[amountIndex] ?? ""),
  };
}

function parseRowWithHeader(
  row: string[],
  header: { projectIndex: number; requesterIndex: number | null; amountIndex: number },
) {
  const projectName = normalizeCellText(row[header.projectIndex]);
  const requesterName =
    header.requesterIndex == null ? "" : normalizeCellText(row[header.requesterIndex]);
  const amountRaw = normalizeAmountRaw(normalizeCellText(row[header.amountIndex]));
  return {
    projectName,
    requesterName,
    amountRaw,
  };
}

function toGrid(rows: Array<Array<unknown>>) {
  return rows
    .map((row) => row.map(normalizeCellText))
    .filter((row) => row.some((cell) => cell.length > 0));
}

export function parseHokClipboardText(text: string, presets: HokImportPreset[]): HokImportResult {
  const rows = text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.split("\t"));
  return parseHokImportRows(rows, presets);
}

export function parseHokImportRows(
  rows: Array<Array<unknown>>,
  presets: HokImportPreset[],
): HokImportResult {
  const grid = toGrid(rows);
  if (grid.length === 0) {
    return {
      headerDetected: false,
      parsedRowCount: 0,
      matchedRows: [],
      unmatchedRows: [],
      invalidRows: [],
      duplicateRows: [],
    };
  }

  const firstRow = grid[0] ?? [];
  const detectedHeader = detectHeaderColumns(firstRow);
  const dataRows = detectedHeader.headerDetected ? grid.slice(1) : grid;
  const invalidRows: HokImportInvalidRow[] = [];
  const unmatchedRows: HokImportIssue[] = [];
  const duplicateRows: HokImportDuplicateRow[] = [];
  const matchedRowsByProjectId = new Map<string, HokImportMatch>();

  dataRows.forEach((rawRow, index) => {
    const rowNumber = detectedHeader.headerDetected ? index + 2 : index + 1;
    const parsedRow = detectedHeader.headerDetected
      ? parseRowWithHeader(rawRow, detectedHeader)
      : parseRowWithoutHeader(rawRow);

    const sourceProjectName = parsedRow.projectName;
    const hasAnyMeaningfulValue = Boolean(
      parsedRow.projectName || parsedRow.requesterName || parsedRow.amountRaw,
    );
    if (!hasAnyMeaningfulValue) {
      return;
    }

    if (!parsedRow.projectName) {
      invalidRows.push({
        rowNumber,
        sourceProjectName: "",
        reason: "missing_project",
      });
      return;
    }

    if (!parsedRow.amountRaw) {
      invalidRows.push({
        rowNumber,
        sourceProjectName,
        reason: "missing_amount",
      });
      return;
    }

    // 1. Try matching with the combined projectName and requesterName (e.g. Village + District)
    // This provides better disambiguation for duplicate village names
    let matchedPreset = parsedRow.requesterName 
      ? matchPresetByProjectName(`${parsedRow.projectName} ${parsedRow.requesterName}`, presets)
      : null;

    // 2. Fallback to matching with just the project name if combined matching failed or was not possible
    if (!matchedPreset) {
      matchedPreset = matchPresetByProjectName(parsedRow.projectName, presets);
    }
    if (!matchedPreset) {
      unmatchedRows.push({
        rowNumber,
        sourceProjectName,
      });
      return;
    }

    if (matchedRowsByProjectId.has(matchedPreset.projectId)) {
      duplicateRows.push({
        rowNumber,
        projectId: matchedPreset.projectId,
        sourceProjectName,
      });
    }

    matchedRowsByProjectId.set(matchedPreset.projectId, {
      rowNumber,
      projectId: matchedPreset.projectId,
      projectName: matchedPreset.projectName,
      sourceProjectName,
      requesterName: parsedRow.requesterName,
      amountRaw: parsedRow.amountRaw,
    });
  });

  const matchedRows = Array.from(matchedRowsByProjectId.values()).sort((a, b) => a.rowNumber - b.rowNumber);

  return {
    headerDetected: detectedHeader.headerDetected,
    parsedRowCount: dataRows.length,
    matchedRows,
    unmatchedRows,
    invalidRows,
    duplicateRows,
  };
}

export type { HokImportDuplicateRow, HokImportInvalidRow, HokImportIssue, HokImportMatch, HokImportPreset, HokImportResult };
