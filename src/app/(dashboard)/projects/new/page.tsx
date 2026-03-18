import { redirect } from "next/navigation";
import { requireProjectEditorUser } from "@/lib/auth";

export default async function NewProjectPage() {
  await requireProjectEditorUser();
  redirect("/projects?modal=project-new");
}
