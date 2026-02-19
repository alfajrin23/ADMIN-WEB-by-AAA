import { redirect } from "next/navigation";

export default function NewProjectPage() {
  redirect("/projects?modal=project-new");
}
