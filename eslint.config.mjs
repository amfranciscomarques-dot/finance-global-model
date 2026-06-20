import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";
import { dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const eslintConfig = [...nextCoreWebVitals, ...nextTypescript, {
  rules: {
    // Rules that catch real bugs are warnings (surfaced in `next lint`/editor,
    // but don't fail the build) rather than off. The build had every meaningful
    // rule disabled, so nothing was enforced.
    "@typescript-eslint/no-explicit-any": "warn",
    "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    "react-hooks/exhaustive-deps": "warn",
    "prefer-const": "warn",
    "no-fallthrough": "warn",
    "no-unreachable": "warn",

    // React-Compiler-readiness lints that ship as errors in the Next 16 preset.
    // This app doesn't use the React Compiler (reactStrictMode is off), and these
    // flag common-but-safe patterns (setState in an effect, etc.). Kept visible as
    // warnings so they don't fail `next build` but still surface for cleanup.
    "react-hooks/set-state-in-effect": "warn",
    "react-hooks/immutability": "warn",

    // Intentionally relaxed for this codebase.
    "@typescript-eslint/no-non-null-assertion": "off",
    "@typescript-eslint/ban-ts-comment": "off",
    "@typescript-eslint/prefer-as-const": "off",
    "@typescript-eslint/no-unused-disable-directive": "off",
    "react-hooks/purity": "off",
    "react/no-unescaped-entities": "off",
    "react/display-name": "off",
    "react/prop-types": "off",
    "react-compiler/react-compiler": "off",
    "@next/next/no-img-element": "off",
    "@next/next/no-html-link-for-pages": "off",
    "no-console": "off",
    "no-debugger": "off",
    "no-empty": "off",
    "no-irregular-whitespace": "off",
    "no-case-declarations": "off",
    "no-mixed-spaces-and-tabs": "off",
    "no-redeclare": "off",
    "no-undef": "off",
    "no-useless-escape": "off",
  },
}, {
  ignores: ["node_modules/**", ".next/**", "out/**", "build/**", "next-env.d.ts", "examples/**", "skills"]
}];

export default eslintConfig;
