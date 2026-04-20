import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

export async function run(): Promise<void> {
  const indexHtml = await readFile(new URL("../../public/index.html", import.meta.url), "utf8");

  assert.match(indexHtml, /href="\/login"/);
  assert.match(indexHtml, />Sign in</);
  assert.match(indexHtml, /href="\/dashboard"/);
  assert.match(indexHtml, /href="\/docs\/api"/);

  const dashboardHtml = await readFile(new URL("../../public/dashboard.html", import.meta.url), "utf8");
  assert.match(dashboardHtml, /fetch\("\/api\/web\/session"/);
  assert.match(dashboardHtml, /href="\/docs\/api"/);
}
