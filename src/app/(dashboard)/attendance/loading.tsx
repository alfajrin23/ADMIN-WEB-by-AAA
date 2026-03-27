function SkeletonBlock({ className }: { className: string }) {
  return <div className={`animate-pulse rounded-2xl bg-slate-200/80 ${className}`} />;
}

export default function AttendanceLoading() {
  return (
    <div className="space-y-4" aria-hidden="true">
      <section className="soft-card p-4 md:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-2">
            <SkeletonBlock className="h-5 w-32" />
            <SkeletonBlock className="h-3 w-60" />
          </div>
          <div className="grid w-full gap-2 sm:w-auto sm:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <SkeletonBlock key={index} className="h-20 w-full min-w-0 rounded-2xl sm:w-32" />
            ))}
          </div>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <SkeletonBlock className="h-10 w-full rounded-xl" />
          <SkeletonBlock className="h-10 w-full rounded-xl" />
          <SkeletonBlock className="h-10 w-full rounded-xl" />
        </div>
      </section>

      <section className="soft-card p-4 md:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-2">
            <SkeletonBlock className="h-5 w-40" />
            <SkeletonBlock className="h-3 w-64" />
          </div>
          <div className="flex gap-2">
            <SkeletonBlock className="h-9 w-32 rounded-xl" />
            <SkeletonBlock className="h-9 w-32 rounded-xl" />
          </div>
        </div>

        <div className="mt-5 space-y-3">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="rounded-2xl border border-slate-200/80 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <SkeletonBlock className="h-4 w-40" />
                <SkeletonBlock className="h-3 w-20" />
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-[1.1fr_0.8fr_0.7fr_0.6fr]">
                <SkeletonBlock className="h-14 w-full" />
                <SkeletonBlock className="h-14 w-full" />
                <SkeletonBlock className="h-14 w-full" />
                <SkeletonBlock className="h-14 w-full" />
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
