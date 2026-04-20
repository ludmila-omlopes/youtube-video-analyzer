import assert from "node:assert/strict";

import { renderApiDocsPageHtml } from "../http/render-api-docs-html.js";

export async function run(): Promise<void> {
  const html = renderApiDocsPageHtml("# Hello API\n\nSome **bold** text.");
  assert.match(html, /<article class="doc">/);
  assert.match(html, /<h1[^>]*>Hello API<\/h1>/);
  assert.match(html, /<strong>bold<\/strong>/);
  assert.match(html, /\/docs\/api\/raw/);
}
