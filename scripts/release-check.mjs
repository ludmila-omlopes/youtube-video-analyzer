import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function run(command, args) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    shell: process.platform === "win32",
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

const packageJson = readJson(new URL("../package.json", import.meta.url));

console.log(`release-check: package version ${packageJson.version}`);

run("npm", ["run", "test"]);
run("npm", ["pack", "--dry-run"]);

console.log("release-check: passed");
