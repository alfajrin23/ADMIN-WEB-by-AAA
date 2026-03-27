function SkeletonBlock({ className }: { className: string }) {
  return <div className={`animate-pulse rounded-2xl bg-slate-200/80 ${className}`} />;
}

export default function ProjectsLoading() {
  return (
    <div className="space-y-4" aria-hidden="true">
      <section className="soft-card p-4 md:p-5">
        <div className="grid gap-4 xl:grid-cols-[1fr_auto]">
          <div className="space-y-3">
            <SkeletonBlock className="h-6 w-44" />
            <SkeletonBlock className="h-3 w-full max-w-2xl" />
            <SkeletonBlock className="h-3 w-full max-w-xl" />
          </div>
          <div className="flex flex-wrap items-center gap-2 xl:justify-end">
            <SkeletonBlock className="h-9 w-36 rounded-xl" />
            <SkeletonBlock className="h-9 w-32 rounded-xl" />
            <SkeletonBlock className="h-9 w-32 rounded-xl" />
          </div>
        </div>
      </section>

      <section className="soft-card p-4 md:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-2">
            <SkeletonBlock className="h-5 w-40" />
            <SkeletonBlock className="h-3 w-64" />
          </div>
          <SkeletonBlock className="h-10 w-full max-w-sm rounded-xl" />
        </div>

        <div className="mt-5 space-y-3">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="rounded-2xl border border-slate-200/80 p-4">
              <div className="grid gap-3 lg:grid-cols-[1.4fr_0.9fr_0.8fr]">
                <div className="space-y-2">
                  <SkeletonBlock className="h-4 w-48" />
                  <SkeletonBlock className="h-3 w-full max-w-md" />
                </div>
                <div className="space-y-2">
                  <SkeletonBlock className="h-3 w-28" />
                  <SkeletonBlock className="h-3 w-24" />
                </div>
                <div className="flex flex-wrap gap-2 lg:justify-end">
                  <SkeletonBlock className="h-8 w-24 rounded-xl" />
                  <SkeletonBlock className="h-8 w-24 rounded-xl" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
