import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

export async function run(): Promise<void> {
  const appHtml = await readFile(new URL("../../public/app.html", import.meta.url), "utf8");

  assert.match(
    appHtml,
    /function handleAuthRequirement\(payload\)\s*\{\s*sessionState = payload;/
  );
  assert.match(
    appHtml,
    /dom\.oauthSigninButton\.style\.display = payload\?\.auth\?\.browserSignin\?\.enabled \? "inline-flex" : "none";/
  );
}
