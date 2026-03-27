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
const serverJson = readJson(new URL("../server.json", import.meta.url));

console.log(`release-check: package version ${packageJson.version}`);
console.log(`release-check: server.json version ${serverJson.version}`);

if (packageJson.version === serverJson.version) {
  console.log(
    "release-check: package.json and server.json versions match. This is correct if you intend to republish MCP Registry metadata too."
  );
} else {
  console.log(
    "release-check: package.json and server.json versions differ. This is expected for an npm-only release that should not update the MCP Registry entry."
  );
}

run("npm", ["run", "test"]);
run("npm", ["pack", "--dry-run"]);

console.log("release-check: passed");
