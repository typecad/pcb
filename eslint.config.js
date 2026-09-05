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
    // kipm/ is vendored easyeda2kicad-derived code, demo/hw/src/tests are
    // scratch test scripts, and docgen dynamically loads optional markdown
    // plugins that ship no type declarations — all intentionally loosely typed.
    files: ["**/kipm/**", "**/demo/hw/src/tests/**", "**/cli/docgen/**"],
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
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
      "**/*.d.ts",
      "**/.svelte-kit/**",
      "**/tailwind.config.ts",
      "**/vite.config.ts",
      "**/vitest.config.ts",
      "**/tests/setup.ts",
      "**/tests/helpers/**",
      // built by the separate tsconfig.gitdiff-viewer.json browser build
      "**/src/gitdiff/viewer/**",
    ],
  }
);
