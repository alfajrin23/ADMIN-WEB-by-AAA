import { searchExpenseDetailsPage } from "@/lib/data";
import { canExportReports, getCurrentUser } from "@/lib/auth";

export const runtime = "nodejs";

const PAGE_SIZE = 500;

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user || !canExportReports(user)) {
    return new Response("Akses export ditolak untuk role ini.", { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const yearValue = Number(searchParams.get("year"));
  const year = Number.isInteger(yearValue) && yearValue > 0 ? yearValue : null;
  const filters = {
    query: searchParams.get("query") ?? "",
    refineQuery: searchParams.get("refineQuery") ?? "",
    from: searchParams.get("from") ?? "",
    to: searchParams.get("to") ?? "",
    year,
    category: searchParams.get("category") ?? "",
    projectId: searchParams.get("projectId") ?? "",
    client: searchParams.get("client") ?? "",
    date: searchParams.get("date") ?? "",
  };

  try {
    const firstPage = await searchExpenseDetailsPage({ ...filters, page: 1, pageSize: PAGE_SIZE });
    // The live Supabase RPC may still have its older 50-row cap until the
    // database migration is applied. Use the effective size reported by page 1.
    const pageSize = firstPage.pageSize;
    const totalPageCount = Math.ceil(firstPage.totalCount / pageSize);
    const concurrentPageCount = Math.max(1, Math.min(10, Math.floor(1500 / pageSize)));
    const remainingPages = [];
    for (let firstPageNumber = 2; firstPageNumber <= totalPageCount; firstPageNumber += concurrentPageCount) {
      const pageNumbers = Array.from(
        { length: Math.min(concurrentPageCount, totalPageCount - firstPageNumber + 1) },
        (_, index) => firstPageNumber + index,
      );
      remainingPages.push(
        ...(await Promise.all(
          pageNumbers.map((page) =>
            searchExpenseDetailsPage({ ...filters, page, pageSize }),
          ),
        )),
      );
    }
    const results = [firstPage, ...remainingPages].flatMap((page) => page.results);

    return Response.json({
      results,
      totalCount: firstPage.totalCount,
      totalAmount: firstPage.totalAmount,
    });
  } catch (error) {
    console.error("[expense-search] Export seluruh hasil pencarian gagal.", error);
    return new Response("Export seluruh hasil pencarian gagal.", { status: 500 });
  }
}
