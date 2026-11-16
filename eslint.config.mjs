import { defineConfig, globalIgnores } from "eslint/config";
import next from "eslint-config-next/core-web-vitals.js";
import ts from "eslint-config-next/typescript.js";

export default defineConfig([
  ...next,
  ...ts,
  globalIgnores([".next/**", "node_modules/**"]),
]);
