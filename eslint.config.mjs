import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  {
    rules: {
      // Dinonaktifkan sementara agar build tidak tertumpuk 600+ warning.
      "@typescript-eslint/no-unused-vars": "off",
      // Existing optimistic lists synchronize refreshed server props into local state.
      "react-hooks/set-state-in-effect": "off",
      // Existing draft handlers read the latest render snapshot through refs.
      "react-hooks/refs": "off",
    }
  }
]);

export default eslintConfig;
