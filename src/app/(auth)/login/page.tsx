import Link from "next/link";
import { redirect } from "next/navigation";
import { loginAction } from "@/app/auth-actions";
import { getCurrentUser } from "@/lib/auth";

type LoginPageProps = {
  searchParams: Promise<{
    error?: string;
    success?: string;
  }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const user = await getCurrentUser();
  if (user) {
    redirect("/");
  }

  const params = await searchParams;
  const error = typeof params.error === "string" ? params.error : "";
  const success = typeof params.success === "string" ? params.success : "";

  return (
    <section className="auth-card">
      <div className="auth-card-header">
        <p className="auth-tagline">Admin Web Rekap Proyek</p>
        <h1 className="auth-title">Selamat Datang</h1>
        <p className="auth-subtitle">
          Login untuk masuk ke dashboard administrasi proyek.
        </p>
      </div>

      {error ? (
        <p className="auth-message auth-message--error">{error}</p>
      ) : null}
      {success ? (
        <p className="auth-message auth-message--success">{success}</p>
      ) : null}

      <form action={loginAction} className="auth-form">
        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-600">Username</label>
          <input name="username" placeholder="contoh: admin.project" autoComplete="username" required />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-600">Password</label>
          <input
            type="password"
            name="password"
            placeholder="Masukkan password"
            autoComplete="current-password"
            required
          />
        </div>
        <button className="auth-submit">Masuk</button>
      </form>

      <p className="auth-switch-text">
        Belum punya akun?{" "}
        <Link href="/register" className="auth-switch-link">
          Buat akun baru
        </Link>
      </p>
    </section>
  );
}
