import test from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { resolveBuildSha } from "./buildStamp.js";
import { buildStampLabel } from "./buildStampLabel.js";

test("the build stamp uses the short Vercel SHA, then git, then dev", () => {
  assert.equal(resolveBuildSha({ VERCEL_GIT_COMMIT_SHA: "abcdef1234567890" }, () => {
    throw new Error("git should not run");
  }), "abcdef1");
  assert.equal(resolveBuildSha({ VERCEL_GIT_COMMIT_SHA: "  abc1234  " }, () => {
    throw new Error("git should not run");
  }), "abc1234");
  assert.equal(resolveBuildSha({}, () => "deadbee\n"), "deadbee");
  assert.equal(resolveBuildSha({ VERCEL_GIT_COMMIT_SHA: "   " }, () => ""), "dev");
  assert.equal(resolveBuildSha({}, () => {
    throw new Error("no git");
  }), "dev");
  const git = execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim();
  assert.equal(resolveBuildSha({}), git);
  assert.equal(buildStampLabel(git), `Build ${git}`);
  assert.equal(buildStampLabel("dev"), "Build dev");
});
