import nextCoreWebVitals from "eslint-config-next/core-web-vitals";

const eslintConfig = [
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "desktop/**",
      "extension/**",
      "public/sw.js",
      "tsconfig.tsbuildinfo",
    ],
  },
  ...nextCoreWebVitals,
  {
    rules: {
      // Legacy fetch-in-effect data loading trips this compiler rule all over the
      // codebase; keep it visible as a warning until those flows are refactored.
      "react-hooks/set-state-in-effect": "warn",
    },
  },
];

export default eslintConfig;
