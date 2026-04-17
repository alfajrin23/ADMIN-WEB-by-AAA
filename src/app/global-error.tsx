"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="id">
      <body
        style={{
          margin: 0,
          fontFamily:
            "'Inter', 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif",
          backgroundColor: "#fef2f2",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "100vh",
          padding: "2rem",
        }}
      >
        <div
          style={{
            maxWidth: "480px",
            backgroundColor: "white",
            borderRadius: "1rem",
            padding: "2rem",
            boxShadow: "0 4px 24px rgba(0,0,0,0.08)",
            textAlign: "center",
          }}
        >
          <div
            style={{
              width: "48px",
              height: "48px",
              borderRadius: "12px",
              backgroundColor: "#fee2e2",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              marginBottom: "1rem",
              color: "#dc2626",
              fontSize: "24px",
            }}
          >
            ⚠
          </div>
          <h1
            style={{
              fontSize: "1.25rem",
              fontWeight: 600,
              color: "#991b1b",
              margin: "0 0 0.5rem",
            }}
          >
            Terjadi Kesalahan Fatal
          </h1>
          <p
            style={{
              fontSize: "0.875rem",
              color: "#7f1d1d",
              margin: "0 0 1.5rem",
            }}
          >
            Aplikasi mengalami error yang tidak terduga. Silakan muat ulang
            halaman.
          </p>
          <button
            onClick={() => reset()}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.5rem",
              padding: "0.625rem 1.5rem",
              backgroundColor: "#dc2626",
              color: "white",
              border: "none",
              borderRadius: "0.75rem",
              fontSize: "0.875rem",
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            Muat Ulang
          </button>
        </div>
      </body>
    </html>
  );
}
