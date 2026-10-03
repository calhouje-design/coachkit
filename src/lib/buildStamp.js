import { execSync } from "node:child_process";

export function resolveBuildSha(env = process.env, git = () => execSync("git rev-parse --short HEAD", { encoding: "utf8" })) {
  const fromVercel = String(env.VERCEL_GIT_COMMIT_SHA || "").trim();
  if (fromVercel) return fromVercel.slice(0, 7);
  try {
    const sha = String(git() || "").trim();
    if (sha) return sha;
  } catch {
    // git is unavailable in this environment
  }
  return "dev";
}
