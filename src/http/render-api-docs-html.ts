import { marked } from "marked";

/**
 * Wrap trusted repo Markdown in a readable hosted page (tables, code, headings).
 */
export function renderApiDocsPageHtml(markdown: string): string {
  const bodyHtml = marked.parse(markdown, { async: false }) as string;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>HTTP API reference · YouTube Video Analyzer</title>
  <style>
    :root {
      color-scheme: dark;
      --bg: #0a0d12;
      --surface: #121722;
      --line: rgba(255, 255, 255, 0.12);
      --text: #f4eee4;
      --muted: rgba(244, 238, 228, 0.72);
      --gold: #f7c98b;
      --accent: #ff9152;
      --code-bg: rgba(0, 0, 0, 0.35);
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: system-ui, -apple-system, Segoe UI, sans-serif;
      color: var(--text);
      background: linear-gradient(180deg, #141923 0%, var(--bg) 38%);
      line-height: 1.6;
      min-height: 100vh;
    }
    a { color: var(--gold); }
    a:hover { color: var(--accent); }
    .bar {
      border-bottom: 1px solid var(--line);
      background: rgba(10, 13, 18, 0.85);
      backdrop-filter: blur(12px);
    }
    .bar-inner {
      max-width: 52rem;
      margin: 0 auto;
      padding: 14px 22px;
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }
    .bar a { text-decoration: none; font-weight: 600; letter-spacing: 0.04em; color: var(--text); }
    .bar nav { display: flex; flex-wrap: wrap; gap: 18px; font-size: 0.92rem; }
    .bar nav a { font-weight: 500; color: var(--muted); }
    .bar nav a:hover { color: var(--gold); }
    main {
      max-width: 52rem;
      margin: 0 auto;
      padding: 28px 22px 56px;
    }
    .doc {
      padding: 28px 26px;
      border: 1px solid var(--line);
      border-radius: 18px;
      background: var(--surface);
    }
    .doc h1 {
      margin: 0 0 0.35em;
      font-size: 1.85rem;
      font-weight: 700;
      letter-spacing: -0.02em;
      line-height: 1.2;
    }
    .doc h2 {
      margin: 1.75em 0 0.5em;
      font-size: 1.15rem;
      font-weight: 600;
      color: var(--gold);
      letter-spacing: 0.04em;
      text-transform: uppercase;
      border-bottom: 1px solid var(--line);
      padding-bottom: 8px;
    }
    .doc h3 { margin: 1.35em 0 0.45em; font-size: 1.05rem; }
    .doc p { margin: 0.85em 0; color: var(--muted); }
    .doc p strong { color: var(--text); }
    .doc ul, .doc ol { margin: 0.6em 0; padding-left: 1.35em; color: var(--muted); }
    .doc li { margin: 0.35em 0; }
    .doc hr {
      border: none;
      border-top: 1px solid var(--line);
      margin: 2rem 0;
    }
    .doc table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.9rem;
      margin: 1em 0;
    }
    .doc th, .doc td {
      text-align: left;
      padding: 10px 12px;
      border: 1px solid var(--line);
      vertical-align: top;
    }
    .doc th {
      background: rgba(255, 255, 255, 0.04);
      color: var(--text);
      font-weight: 600;
    }
    .doc td { color: var(--muted); }
    .doc td code, .doc p code, .doc li code {
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 0.84em;
      padding: 2px 7px;
      border-radius: 6px;
      background: var(--code-bg);
      border: 1px solid var(--line);
      color: var(--text);
    }
    .doc pre {
      margin: 1em 0;
      padding: 16px 18px;
      border-radius: 12px;
      background: var(--code-bg);
      border: 1px solid var(--line);
      overflow-x: auto;
    }
    .doc pre code {
      padding: 0;
      border: none;
      background: none;
      font-size: 0.82rem;
      line-height: 1.5;
      color: var(--text);
    }
    .raw-hint {
      margin-top: 22px;
      font-size: 0.88rem;
      color: var(--muted);
    }
  </style>
</head>
<body>
  <header class="bar">
    <div class="bar-inner">
      <a href="/">YouTube Video Analyzer</a>
      <nav>
        <a href="/dashboard">Account</a>
        <a href="/docs/api/raw">Plain Markdown</a>
        <a href="/login">Sign in</a>
      </nav>
    </div>
  </header>
  <main>
    <article class="doc">${bodyHtml}</article>
    <p class="raw-hint">Machine-readable copy: <a href="/docs/api/raw"><code>GET /docs/api/raw</code></a></p>
  </main>
</body>
</html>`;
}

