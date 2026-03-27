function SkeletonBlock({ className }: { className: string }) {
  return <div className={`animate-pulse rounded-2xl bg-slate-200/80 ${className}`} />;
}

export default function DashboardLoading() {
  return (
    <div className="space-y-4" aria-hidden="true">
      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <article key={index} className="soft-card p-4">
            <div className="flex items-center gap-3">
              <SkeletonBlock className="h-10 w-10 rounded-xl" />
              <div className="flex-1 space-y-2">
                <SkeletonBlock className="h-3 w-20" />
                <SkeletonBlock className="h-4 w-28" />
              </div>
            </div>
          </article>
        ))}
      </section>

      <section className="soft-card p-4 md:p-5">
        <div className="space-y-3">
          <SkeletonBlock className="h-4 w-40" />
          <SkeletonBlock className="h-3 w-full max-w-2xl" />
          <SkeletonBlock className="h-3 w-full max-w-xl" />
        </div>
        <div className="mt-5 grid gap-3 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <article key={index} className="soft-card-muted p-4">
              <SkeletonBlock className="h-3 w-24" />
              <SkeletonBlock className="mt-3 h-6 w-32" />
              <SkeletonBlock className="mt-4 h-2 w-full" />
            </article>
          ))}
        </div>
      </section>

      <section className="soft-card p-4 md:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SkeletonBlock className="h-5 w-44" />
          <SkeletonBlock className="h-9 w-36 rounded-xl" />
        </div>
        <div className="mt-5 space-y-3">
          {Array.from({ length: 5 }).map((_, index) => (
            <div key={index} className="grid gap-3 rounded-2xl border border-slate-200/80 p-4 md:grid-cols-[1.2fr_0.8fr_0.7fr]">
              <div className="space-y-2">
                <SkeletonBlock className="h-4 w-40" />
                <SkeletonBlock className="h-3 w-full max-w-md" />
              </div>
              <div className="space-y-2">
                <SkeletonBlock className="h-3 w-28" />
                <SkeletonBlock className="h-3 w-24" />
              </div>
              <div className="flex items-center justify-start md:justify-end">
                <SkeletonBlock className="h-9 w-28 rounded-xl" />
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
