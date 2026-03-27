import Link from "next/link";
import { redirect } from "next/navigation";
import { registerAction } from "@/app/auth-actions";
import { PasswordRevealInput } from "@/components/password-reveal-input";
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
        <div className="auth-field">
          <label className="auth-field-label">Nama lengkap</label>
          <input
            name="full_name"
            placeholder="contoh: Andi Saputra"
            autoComplete="name"
            required
          />
        </div>
        <div className="auth-field">
          <label className="auth-field-label">Username</label>
          <input
            name="username"
            placeholder="huruf kecil, angka, titik, _ atau -"
            autoComplete="username"
            required
          />
        </div>
        <PasswordRevealInput
          name="password"
          label="Password"
          placeholder="Minimal 6 karakter"
          autoComplete="new-password"
          required
        />
        <PasswordRevealInput
          name="password_confirm"
          label="Konfirmasi Password"
          placeholder="Ulangi password"
          autoComplete="new-password"
          required
        />
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
