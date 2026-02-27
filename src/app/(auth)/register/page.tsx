import Link from "next/link";
import { redirect } from "next/navigation";
import { registerAction } from "@/app/auth-actions";
import { getCurrentUser } from "@/lib/auth";

type RegisterPageProps = {
  searchParams: Promise<{
    error?: string;
  }>;
};

export default async function RegisterPage({ searchParams }: RegisterPageProps) {
  const user = await getCurrentUser();
  if (user) {
    redirect("/");
  }

  const params = await searchParams;
  const error = typeof params.error === "string" ? params.error : "";

  return (
    <section className="auth-card">
      <div className="auth-card-header">
        <p className="auth-tagline">Registrasi Akun</p>
        <h1 className="auth-title">Buat Akun</h1>
        <p className="auth-subtitle">
          Akun pertama otomatis menjadi <strong>dev</strong>. Akun berikutnya default
          <strong> viewer</strong> dan bisa diubah oleh dev.
        </p>
      </div>

      {error ? (
        <p className="auth-message auth-message--error">{error}</p>
      ) : null}

      <form action={registerAction} className="auth-form">
        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-600">Nama lengkap</label>
          <input
            name="full_name"
            placeholder="contoh: Andi Saputra"
            autoComplete="name"
            required
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-600">Username</label>
          <input
            name="username"
            placeholder="huruf kecil, angka, titik, _ atau -"
            autoComplete="username"
            required
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-600">Password</label>
          <input
            type="password"
            name="password"
            placeholder="Minimal 6 karakter"
            autoComplete="new-password"
            required
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-600">
            Konfirmasi Password
          </label>
          <input
            type="password"
            name="password_confirm"
            placeholder="Ulangi password"
            autoComplete="new-password"
            required
          />
        </div>
        <button className="auth-submit">Buat Akun</button>
      </form>

      <p className="auth-switch-text">
        Sudah punya akun?{" "}
        <Link href="/login" className="auth-switch-link">
          Kembali ke login
        </Link>
      </p>
    </section>
  );
}
