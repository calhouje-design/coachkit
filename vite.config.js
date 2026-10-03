import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolveBuildSha } from "./src/lib/buildStamp.js";

export default defineConfig({
  plugins: [react()],
  define: {
    __COACHKIT_BUILD_SHA__: JSON.stringify(resolveBuildSha()),
  },
});
