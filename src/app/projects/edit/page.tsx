import Link from "next/link";
import { notFound } from "next/navigation";
import { updateProjectAction } from "@/app/actions";
import { SaveIcon } from "@/components/icons";
import { PROJECT_STATUSES } from "@/lib/constants";
import { getProjectById } from "@/lib/data";

type EditProjectPageProps = {
  searchParams: Promise<{ id?: string }>;
};

export default async function EditProjectPage({ searchParams }: EditProjectPageProps) {
  const params = await searchParams;
  const projectId = typeof params.id === "string" ? params.id : "";
  const project = await getProjectById(projectId);
  if (!project) {
    notFound();
  }

  return (
    <div className="mx-auto w-full max-w-2xl space-y-4">
      <section className="panel p-5">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-semibold text-slate-900">Edit Project</h1>
          <Link
            href={`/projects?project=${project.id}`}
            className="text-sm font-medium text-blue-700 hover:text-blue-900"
          >
            Kembali ke Rekap
          </Link>
        </div>
        <form action={updateProjectAction} className="mt-4 space-y-3">
          <input type="hidden" name="project_id" value={project.id} />
          <input type="hidden" name="return_to" value={`/projects?project=${project.id}`} />
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Nama project</label>
            <input name="name" defaultValue={project.name} required />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Kode</label>
              <input name="code" defaultValue={project.code ?? ""} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Status</label>
              <select name="status" defaultValue={project.status}>
                {PROJECT_STATUSES.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Klien</label>
            <input name="client_name" defaultValue={project.clientName ?? ""} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Tanggal mulai</label>
            <input type="date" name="start_date" defaultValue={project.startDate ?? ""} />
          </div>
          <button className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-600">
            <span className="btn-icon icon-bounce-soft bg-white/20 text-white">
              <SaveIcon />
            </span>
            Simpan Perubahan
          </button>
        </form>
      </section>
    </div>
  );
}
