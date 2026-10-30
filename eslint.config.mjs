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
    // Built plugin output, not source.
    "packages/*/dist/**",
  ]),
  {
    // Prose in JSX uses apostrophes; escaping them makes the copy harder to read.
    files: ["**/*.tsx"],
    rules: { "react/no-unescaped-entities": "off" },
  },
  {
    // Tests drive loose shapes on purpose; the product code keeps the strict type.
    files: ["**/*.test.ts", "**/*.test.tsx", "**/*.int.test.ts", "**/*.int.test.tsx"],
    rules: { "@typescript-eslint/no-explicit-any": "off" },
  },
]);

export default eslintConfig;
