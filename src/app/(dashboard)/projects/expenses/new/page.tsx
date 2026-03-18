import { redirect } from "next/navigation";
import { requireProjectEditorUser } from "@/lib/auth";

type NewExpensePageProps = {
  searchParams: Promise<{ project?: string }>;
};

export default async function NewExpensePage({ searchParams }: NewExpensePageProps) {
  await requireProjectEditorUser();
  const params = await searchParams;
  const project = typeof params.project === "string" ? params.project : "";
  const query = new URLSearchParams({ modal: "expense-new" });
  if (project) {
    query.set("project", project);
  }
  redirect(`/projects?${query.toString()}`);
}
