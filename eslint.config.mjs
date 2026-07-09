import js from "@eslint/js";
import globals from "globals";
import process from "node:process";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["dist/**", "reports/**", "coverage/**", "node_modules/**", "webapp/**", "scripts/**", "*.min.js"]
  },
  js.configs.recommended,
  {
    files: ["**/*.ts"],
    extends: [...tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      parserOptions: {
        project: "./tsconfig.json",
        tsconfigRootDir: process.cwd()
      },
      globals: {
        ...globals.node
      }
    },
    rules: {
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-floating-promises": "error"
    }
  },
  {
    files: ["tests/**/*.ts"],
    languageOptions: {
      globals: {
        ...globals.node
      }
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "off"
    }
  }
);
