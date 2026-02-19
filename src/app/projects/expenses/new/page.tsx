import { redirect } from "next/navigation";

type NewExpensePageProps = {
  searchParams: Promise<{ project?: string }>;
};

export default async function NewExpensePage({ searchParams }: NewExpensePageProps) {
  const params = await searchParams;
  const project = typeof params.project === "string" ? params.project : "";
  const query = new URLSearchParams({ modal: "expense-new" });
  if (project) {
    query.set("project", project);
  }
  redirect(`/projects?${query.toString()}`);
}
