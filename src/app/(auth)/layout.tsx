import type { ReactNode } from "react";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="auth-shell">
      <div className="auth-bg-grid" />
      <div className="auth-wave auth-wave--top" />
      <div className="auth-wave auth-wave--bottom" />
      <div className="auth-sweep auth-sweep--one" />
      <div className="auth-sweep auth-sweep--two" />
      <div className="auth-orb auth-orb--one" />
      <div className="auth-orb auth-orb--two" />
      <main className="auth-content">{children}</main>
    </div>
  );
}
