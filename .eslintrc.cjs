/** @type {import("eslint").Linter.Config} */
module.exports = {
  root: true,
  parser: "@typescript-eslint/parser",
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: "module",
  },
  plugins: ["@typescript-eslint"],
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
  ],
  rules: {
    // No unused variables (warn so CI flags but doesn't block)
    "@typescript-eslint/no-unused-vars": [
      "warn",
      { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
    ],
    // No explicit any
    "@typescript-eslint/no-explicit-any": "error",
    // Require explicit return types on exported functions
    "@typescript-eslint/explicit-module-boundary-types": "warn",
    // Consistent type imports
    "@typescript-eslint/consistent-type-imports": [
      "error",
      { prefer: "type-imports", fixStyle: "inline-type-imports" },
    ],
    // Standard ESLint rules
    "no-console": "off",
    eqeqeq: ["error", "always"],
    curly: ["error", "all"],
  },
  ignorePatterns: [
    "node_modules/",
    "dist/",
    "build/",
    ".next/",
    "drizzle/",
    "**/*.js",
    "**/*.cjs",
    "**/*.mjs",
  ],
};
