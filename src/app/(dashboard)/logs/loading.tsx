function SkeletonBlock({ className }: { className: string }) {
  return <div className={`animate-pulse rounded-2xl bg-slate-200/80 ${className}`} />;
}

export default function LogsLoading() {
  return (
    <div className="space-y-4" aria-hidden="true">
      <section className="page-hero">
        <div className="page-hero-grid xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
          <div className="space-y-4">
            <SkeletonBlock className="h-3 w-24" />
            <SkeletonBlock className="h-10 w-full max-w-2xl" />
            <SkeletonBlock className="h-3 w-full max-w-xl" />
            <SkeletonBlock className="h-3 w-full max-w-lg" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {Array.from({ length: 4 }).map((_, index) => (
              <SkeletonBlock key={index} className="h-28 w-full rounded-[1.5rem]" />
            ))}
          </div>
        </div>
      </section>

      <section className="soft-card p-4 md:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SkeletonBlock className="h-5 w-48" />
          <SkeletonBlock className="h-9 w-40 rounded-xl" />
        </div>
        <div className="mt-5 space-y-3">
          {Array.from({ length: 5 }).map((_, index) => (
            <div key={index} className="grid gap-3 rounded-2xl border border-slate-200/80 p-4 lg:grid-cols-[0.9fr_0.8fr_0.9fr_1.2fr_1fr]">
              <SkeletonBlock className="h-14 w-full" />
              <SkeletonBlock className="h-14 w-full" />
              <SkeletonBlock className="h-14 w-full" />
              <SkeletonBlock className="h-14 w-full" />
              <SkeletonBlock className="h-14 w-full" />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
