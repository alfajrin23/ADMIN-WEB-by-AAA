import { redirect } from "next/navigation";
import { requireEditorUser } from "@/lib/auth";

export default async function NewProjectPage() {
  await requireEditorUser();
  redirect("/projects?modal=project-new");
}
