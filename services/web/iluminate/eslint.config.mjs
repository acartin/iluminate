import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";

export default defineConfig([
  ...nextVitals,
  {
    rules: {
      // The application intentionally synchronizes editor drafts, browser
      // preferences and async API results in effects. Keep these findings
      // visible without treating every existing synchronization as a build
      // failure; rules-of-hooks remains an error through core-web-vitals.
      "react-hooks/set-state-in-effect": "warn",
    },
  },
  globalIgnores([".next/**", "next-env.d.ts"]),
]);
