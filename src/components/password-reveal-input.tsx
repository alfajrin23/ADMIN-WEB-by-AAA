"use client";

import { useId, useState } from "react";
import { EyeIcon, EyeOffIcon } from "@/components/icons";

type PasswordRevealInputProps = {
  name: string;
  label: string;
  placeholder?: string;
  autoComplete?: string;
  required?: boolean;
  hint?: string;
};

export function PasswordRevealInput({
  name,
  label,
  placeholder,
  autoComplete,
  required = false,
  hint,
}: PasswordRevealInputProps) {
  const inputId = useId();
  const [isVisible, setIsVisible] = useState(false);

  return (
    <div className="auth-field auth-field--password">
      <label htmlFor={inputId} className="auth-field-label">
        {label}
      </label>
      <div className="auth-password-frame">
        <input
          id={inputId}
          type={isVisible ? "text" : "password"}
          name={name}
          placeholder={placeholder}
          autoComplete={autoComplete}
          required={required}
          className="auth-password-input"
        />
        <button
          type="button"
          className="auth-password-toggle"
          aria-label={isVisible ? "Sembunyikan password" : "Tampilkan password"}
          aria-pressed={isVisible}
          onClick={() => setIsVisible((prev) => !prev)}
        >
          <span className="auth-password-toggle-surface">
            {isVisible ? <EyeOffIcon /> : <EyeIcon />}
          </span>
        </button>
        <span className="auth-password-sheen" aria-hidden="true" />
      </div>
      {hint ? <p className="auth-field-note">{hint}</p> : null}
    </div>
  );
}
