import { canExportReports, getCurrentUser } from "@/lib/auth";
import { buildExpenseDetailClipboardText } from "@/lib/expense-clipboard";
import { getProjectReportDetail, getProjects } from "@/lib/data";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user || !canExportReports(user)) {
    return new Response("Akses export ditolak untuk role ini.", { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const selectedOnly = searchParams.get("selected_only") === "1";
  const requestedProjectIds = Array.from(
    new Set(
      searchParams
        .getAll("project")
        .map((item) => item.trim())
        .filter((item) => item.length > 0),
    ),
  );
  if (selectedOnly && requestedProjectIds.length === 0) {
    return new Response("Pilih minimal satu project untuk salin rincian biaya.", { status: 400 });
  }

  const allProjects = await getProjects();
  const selectedProjects =
    requestedProjectIds.length > 0
      ? allProjects.filter((project) => requestedProjectIds.includes(project.id))
      : allProjects;
  if (selectedProjects.length === 0) {
    return new Response("Project tidak ditemukan.", { status: 404 });
  }

  const details = await Promise.all(selectedProjects.map((project) => getProjectReportDetail(project.id)));
  const text = buildExpenseDetailClipboardText(
    details.flatMap((detail) =>
      detail
        ? [
            {
              projectName: detail.project.name,
              expenses: detail.expenses,
            },
          ]
        : [],
    ),
  );
  if (!text.trim()) {
    return new Response("Belum ada data biaya project.", { status: 404 });
  }

  return new Response(text, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
    },
  });
}
