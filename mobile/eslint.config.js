// https://docs.expo.dev/guides/using-eslint/ — mobile/ has its own lint setup;
// the root Next.js config ignores mobile/** (ADR-0003).
const { defineConfig } = require("eslint/config");
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ["dist/*"],
  },
]);
