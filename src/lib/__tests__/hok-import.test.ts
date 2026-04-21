import { describe, expect, it } from "vitest";
import { parseHokClipboardText, parseHokImportRows } from "@/lib/hok-import";

const presets = [
  {
    projectId: "p-alpha",
    projectName: "Project Alpha",
    clientName: "KMP Cianjur",
  },
  {
    projectId: "p-beta",
    projectName: "Project Beta",
    clientName: "KMP Cianjur",
  },
  {
    projectId: "gudang-timur",
    projectName: "Renovasi Gudang Timur",
    clientName: "KMP Cianjur",
  },
];

describe("parseHokClipboardText", () => {
  it("parses header-based clipboard rows with requester and amount", () => {
    const result = parseHokClipboardText(
      [
        "Project\tNama Pengajuan\tNominal",
        "Project Alpha\tMandor A\t1.500.000",
        "Project Beta\tMandor B\t250000",
      ].join("\n"),
      presets,
    );

    expect(result.headerDetected).toBe(true);
    expect(result.parsedRowCount).toBe(2);
    expect(result.invalidRows).toHaveLength(0);
    expect(result.unmatchedRows).toHaveLength(0);
    expect(result.matchedRows).toEqual([
      {
        rowNumber: 2,
        projectId: "p-alpha",
        projectName: "Project Alpha",
        sourceProjectName: "Project Alpha",
        requesterName: "Mandor A",
        amountRaw: "1500000",
      },
      {
        rowNumber: 3,
        projectId: "p-beta",
        projectName: "Project Beta",
        sourceProjectName: "Project Beta",
        requesterName: "Mandor B",
        amountRaw: "250000",
      },
    ]);
  });

  it("keeps the last duplicate row and reports unmatched projects", () => {
    const result = parseHokClipboardText(
      [
        "Project\tNominal",
        "Project Alpha\t500000",
        "Project Alpha\t750000",
        "Project Gamma\t120000",
      ].join("\n"),
      presets,
    );

    expect(result.matchedRows).toEqual([
      {
        rowNumber: 3,
        projectId: "p-alpha",
        projectName: "Project Alpha",
        sourceProjectName: "Project Alpha",
        requesterName: "",
        amountRaw: "750000",
      },
    ]);
    expect(result.duplicateRows).toEqual([
      {
        rowNumber: 3,
        projectId: "p-alpha",
        sourceProjectName: "Project Alpha",
      },
    ]);
    expect(result.unmatchedRows).toEqual([
      {
        rowNumber: 4,
        sourceProjectName: "Project Gamma",
      },
    ]);
  });
});

describe("parseHokImportRows", () => {
  it("parses rows without header and ignores leading nomor columns", () => {
    const result = parseHokImportRows(
      [
        ["1", "Project Alpha", "Mandor Lapangan", "2.000.000"],
        ["2", "Project Beta", "1.250.000"],
      ],
      presets,
    );

    expect(result.headerDetected).toBe(false);
    expect(result.parsedRowCount).toBe(2);
    expect(result.invalidRows).toHaveLength(0);
    expect(result.matchedRows).toEqual([
      {
        rowNumber: 1,
        projectId: "p-alpha",
        projectName: "Project Alpha",
        sourceProjectName: "Project Alpha",
        requesterName: "Mandor Lapangan",
        amountRaw: "2000000",
      },
      {
        rowNumber: 2,
        projectId: "p-beta",
        projectName: "Project Beta",
        sourceProjectName: "Project Beta",
        requesterName: "",
        amountRaw: "1250000",
      },
    ]);
  });

  it("matches project names by unique token subset and reports missing amount", () => {
    const result = parseHokImportRows(
      [
        ["Gudang Timur", "Mandor Gudang", "980000"],
        ["Project Beta", "Mandor Beta", ""],
      ],
      presets,
    );

    expect(result.matchedRows).toEqual([
      {
        rowNumber: 1,
        projectId: "gudang-timur",
        projectName: "Renovasi Gudang Timur",
        sourceProjectName: "Gudang Timur",
        requesterName: "Mandor Gudang",
        amountRaw: "980000",
      },
    ]);
    expect(result.invalidRows).toEqual([
      {
        rowNumber: 2,
        sourceProjectName: "Project Beta",
        reason: "missing_amount",
      },
    ]);
  });
});
