"use client";

import { useEffect } from "react";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[dashboard-error]", error);
  }, [error]);

  return (
    <section className="panel border-rose-200 bg-rose-50 p-6">
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-100 text-rose-600">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              className="h-5 w-5"
            >
              <path
                fillRule="evenodd"
                d="M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Zm-8-5a.75.75 0 0 1 .75.75v4.5a.75.75 0 0 1-1.5 0v-4.5A.75.75 0 0 1 10 5Zm0 10a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z"
                clipRule="evenodd"
              />
            </svg>
          </span>
          <div>
            <h2 className="text-base font-semibold text-rose-900">
              Terjadi Kesalahan
            </h2>
            <p className="mt-0.5 text-sm text-rose-700">
              Halaman ini mengalami error. Silakan coba lagi atau kembali ke
              dashboard.
            </p>
          </div>
        </div>
        {error.message && process.env.NODE_ENV === "development" ? (
          <pre className="mt-2 overflow-auto rounded-lg bg-rose-100/50 p-3 text-xs text-rose-800">
            {error.message}
          </pre>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => reset()}
            className="inline-flex items-center gap-2 rounded-xl bg-rose-600 px-4 py-2 text-sm font-medium text-white hover:bg-rose-700 transition-colors"
          >
            Coba Lagi
          </button>
          <a
            href="/"
            className="inline-flex items-center gap-2 rounded-xl border border-rose-300 bg-white px-4 py-2 text-sm font-medium text-rose-700 hover:bg-rose-50 transition-colors"
          >
            Kembali ke Dashboard
          </a>
        </div>
      </div>
    </section>
  );
}
