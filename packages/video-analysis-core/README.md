# `@ludylops/video-analysis-core`

Private shared library for YouTube video analysis (Gemini, yt-dlp, schemas). Consumed by this repo’s hosted stack and, after split, by the MCP npm package.

## Development

From the repository root:

```bash
npm install
npm run build:core
```

## Publish

Configure registry auth (e.g. GitHub Packages or npm org), then from this directory:

```bash
npm run build
npm publish
```

`publishConfig.access` is `restricted` for private packages; adjust if you publish publicly.
