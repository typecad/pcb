import tseslint from "typescript-eslint";

export default tseslint.config(
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
      },
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
      "@typescript-eslint/no-require-imports": "error",
      "no-console": ["warn", { allow: ["warn", "error"] }],
    },
  },
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/dist-obfuscated/**",
      "**/examples/**",
      "**/*.test.ts",
      "**/__tests__/**",
      "**/*.js",
      "**/.svelte-kit/**",
      "**/tailwind.config.ts",
      "**/vite.config.ts",
      "**/svelte.config.js",
    ],
  }
);
