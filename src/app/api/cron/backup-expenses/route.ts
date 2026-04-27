import { Buffer } from "node:buffer";
import * as XLSX from "xlsx/xlsx.mjs";
import { google } from "googleapis";
import { createDetailReportWorkbook } from "@/lib/excel-db";
import { getExpenseCategories, getProjectReportDetail, getProjects } from "@/lib/data";
import { buildReportCategoryOptions, buildReportCategoryTotals } from "@/lib/expense-report";

export const runtime = "nodejs";

const GOOGLE_DRIVE_FOLDER_ID = "1Gl8GL6aH0AFLEKazCrKbaWfpdeUD6q2M";

function appendUniqueSheet(workbook: XLSX.WorkBook, worksheet: XLSX.WorkSheet, baseName: string) {
  const cleanedBase = baseName.replace(/[\\/?*[\]:]/g, " ").trim() || "Sheet";
  let candidate = cleanedBase.slice(0, 31);
  let index = 2;
  const used = new Set(workbook.SheetNames.map((name) => name.toUpperCase()));
  while (used.has(candidate.toUpperCase())) {
    const suffix = ` (${index})`;
    candidate = `${cleanedBase.slice(0, Math.max(1, 31 - suffix.length))}${suffix}`;
    index += 1;
  }
  XLSX.utils.book_append_sheet(workbook, worksheet, candidate);
}

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}` && process.env.NODE_ENV !== "development") {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const allProjects = await getProjects();
    if (allProjects.length === 0) {
      return new Response("Belum ada data project.", { status: 404 });
    }

    const [details, expenseCategories] = await Promise.all([
      Promise.all(allProjects.map((project) => getProjectReportDetail(project.id))),
      getExpenseCategories(),
    ]);

    const reportProjects: Array<{ id: string; name: string }> = [];
    const reportExpenses: Array<any> = [];
    const categoryOptionsByProject: Record<string, Array<{ value: string; label: string }>> = {};
    const summaryRows: Array<Record<string, string | number>> = [];
    const allCategoryValues: string[] = [];

    // Construct workbook (reusing excel-db approach)
    for (const detail of details) {
      if (!detail) continue;
      const rows = detail.expenses.slice().sort((a, b) => {
        if (a.expenseDate !== b.expenseDate) return a.expenseDate.localeCompare(b.expenseDate);
        return (a.requesterName ?? "").localeCompare(b.requesterName ?? "");
      });
      if (rows.length === 0) continue;

      reportProjects.push({ id: detail.project.id, name: detail.project.name });
      const categoryOptions = buildReportCategoryOptions(expenseCategories, rows.map((row) => row.category));
      categoryOptionsByProject[detail.project.id] = categoryOptions;
      allCategoryValues.push(...rows.map((row) => row.category));

      for (const row of rows) {
        reportExpenses.push({
          project_id: detail.project.id,
          category: row.category,
          requester_name: row.requesterName,
          description: row.description,
          quantity: row.quantity,
          unit_label: row.unitLabel,
          usage_info: row.usageInfo,
          unit_price: row.unitPrice,
          amount: row.amount,
          expense_date: row.expenseDate.slice(0, 10),
        });
      }
    }

    if (reportProjects.length === 0) {
      return new Response("Belum ada data biaya project.", { status: 404 });
    }

    const summaryCategoryOptions = buildReportCategoryOptions(expenseCategories, allCategoryValues);
    const grandTotalsByCategory = Object.fromEntries(
      summaryCategoryOptions.map((item) => [item.value, 0]),
    ) as Record<string, number>;
    let grandTotal = 0;

    for (const detail of details) {
      if (!detail || detail.expenses.length === 0) continue;
      const { totalsByCategory, total } = buildReportCategoryTotals(detail.expenses, summaryCategoryOptions);
      for (const category of summaryCategoryOptions) {
        grandTotalsByCategory[category.value] += totalsByCategory[category.value] ?? 0;
      }
      grandTotal += total;

      const row: Record<string, string | number> = { PROJECT: detail.project.name };
      for (const category of summaryCategoryOptions) {
        row[`KATEGORI: ${category.label}`] = totalsByCategory[category.value] ?? 0;
      }
      row.TOTAL = total;
      summaryRows.push(row);
    }

    const workbook = createDetailReportWorkbook({
      projects: reportProjects,
      project_expenses: reportExpenses,
      category_options_by_project: categoryOptionsByProject,
    });

    const totalRow: Record<string, string | number> = { PROJECT: "TOTAL" };
    for (const category of summaryCategoryOptions) {
      totalRow[`KATEGORI: ${category.label}`] = grandTotalsByCategory[category.value] ?? 0;
    }
    totalRow.TOTAL = grandTotal;
    summaryRows.push(totalRow);

    const summaryHeaders = ["PROJECT", ...summaryCategoryOptions.map((item) => `KATEGORI: ${item.label}`), "TOTAL"];
    const summarySheetRows: Array<Array<string | number>> = [
      ["REKAP KESELURUHAN RINCIAN BIAYA"],
      [`Dicetak ${new Date().toLocaleString("id-ID")}`],
      [],
      summaryHeaders,
      ...summaryRows.map((row) => {
        const values: Array<string | number> = [String(row.PROJECT ?? "")];
        for (const category of summaryCategoryOptions) {
          values.push(Number(row[`KATEGORI: ${category.label}`] ?? 0));
        }
        values.push(Number(row.TOTAL ?? 0));
        return values;
      }),
    ];

    const summarySheet = XLSX.utils.aoa_to_sheet(summarySheetRows);
    summarySheet["!merges"] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: summaryHeaders.length - 1 } },
      { s: { r: 1, c: 0 }, e: { r: 1, c: summaryHeaders.length - 1 } },
    ];
    summarySheet["!cols"] = [{ wch: 34 }, ...summaryCategoryOptions.map(() => ({ wch: 18 })), { wch: 20 }];
    appendUniqueSheet(workbook, summarySheet, "Rekap Keseluruhan");

    const infoSheet = XLSX.utils.aoa_to_sheet([
      ["LAPORAN", "RINCIAN BIAYA SEMUA PROJECT"],
      ["DICETAK", new Date().toLocaleString("id-ID")],
    ]);
    infoSheet["!cols"] = [{ wch: 14 }, { wch: 55 }];
    appendUniqueSheet(workbook, infoSheet, "Info");

    const bytes = XLSX.write(workbook, { type: "buffer", bookType: "xlsx", cellStyles: true });
    const buffer = Buffer.from(bytes);

    // Initialize Google API Auth
    const credentialsRaw = process.env.GOOGLE_DRIVE_CREDENTIALS;
    if (!credentialsRaw) {
      console.error("Missing GOOGLE_DRIVE_CREDENTIALS");
      return new Response("Missing Google Drive credentials configuration.", { status: 500 });
    }

    const credentials = JSON.parse(credentialsRaw);
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ["https://www.googleapis.com/auth/drive.file"],
    });

    const drive = google.drive({ version: "v3", auth });
    
    // Create File Stream from Buffer
    const stream = require("stream");
    const bufferStream = new stream.PassThrough();
    bufferStream.end(buffer);

    const now = new Date();
    // Assuming timezone +07:00 (WIB) / converting simplified
    const localNow = new Date(now.getTime() + 7 * 60 * 60 * 1000); 
    const formattedDate = `${localNow.getFullYear()}-${String(localNow.getMonth() + 1).padStart(2, '0')}-${String(localNow.getDate()).padStart(2, '0')}`;
    const filename = `semua-project-rincian-biaya-${formattedDate}.xlsx`;

    const fileMetadata = {
      name: filename,
      parents: [GOOGLE_DRIVE_FOLDER_ID],
    };
    
    const media = {
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      body: bufferStream,
    };

    const response = await drive.files.create({
      requestBody: fileMetadata,
      media: media,
      fields: "id",
    });

    return new Response(JSON.stringify({ success: true, fileId: response.data.id }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("Error in backup job:", error);
    return new Response(`Server Error: ${error instanceof Error ? error.message : "Unknown error"}`, { status: 500 });
  }
}
