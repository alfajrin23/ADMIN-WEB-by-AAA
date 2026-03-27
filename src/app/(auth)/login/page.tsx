import Link from "next/link";
import { redirect } from "next/navigation";
import { loginAction } from "@/app/auth-actions";
import { PasswordRevealInput } from "@/components/password-reveal-input";
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
    <section className="auth-card auth-card--login">
      <div className="auth-card-header">
        <p className="auth-tagline">Admin Web Rekap Proyek</p>
        <h1 className="auth-title">Control Access</h1>
        <p className="auth-subtitle">
          Login ke dashboard administrasi proyek dengan akses yang lebih rapi, terang, dan fokus.
        </p>
      </div>

      <div className="auth-highlight-row">
        <div className="auth-highlight-pill">
          <span className="auth-highlight-label">Access</span>
          <span className="auth-highlight-value">Secure Login</span>
        </div>
        <div className="auth-highlight-pill">
          <span className="auth-highlight-label">Panel</span>
          <span className="auth-highlight-value">Project + Cost</span>
        </div>
      </div>

      {error ? (
        <p className="auth-message auth-message--error">{error}</p>
      ) : null}
      {success ? (
        <p className="auth-message auth-message--success">{success}</p>
      ) : null}

      <form action={loginAction} className="auth-form">
        <div className="auth-field">
          <label className="auth-field-label">Username</label>
          <input name="username" placeholder="contoh: admin.project" autoComplete="username" required />
        </div>
        <PasswordRevealInput
          name="password"
          label="Password"
          placeholder="Masukkan password"
          autoComplete="current-password"
          required
          hint="Gunakan ikon mata untuk reveal password."
        />
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
