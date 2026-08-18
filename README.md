# bulcoin-static

Public static CDN for [BulCoin](https://miniapp.blc.cab) Mini App (JS/CSS from `frontend/dist/assets`).

Served via **GitHub Pages** at `https://static.blc.cab` (Cloudflare DNS only / grey cloud — traffic does not go through Cloudflare proxy).

## Cloudflare DNS (required)

In Cloudflare → `blc.cab` → DNS:

| Type  | Name   | Content                              | Proxy status      |
|-------|--------|--------------------------------------|-------------------|
| CNAME | static | `pressfreedomcoalition-art.github.io` | **DNS only** (grey cloud) |

Do **not** enable the orange cloud. Grey cloud = browser talks to GitHub directly (avoids CF HTTP/2 issues in Russia).

Optional equivalent (A records, also grey):

- `185.199.108.153`
- `185.199.109.153`
- `185.199.110.153`
- `185.199.111.153`

## GitHub Pages

1. Repo Settings → Pages → Source: **GitHub Actions** (or Deploy from branch `main` / root).
2. Custom domain: `static.blc.cab`
3. Wait until HTTPS shows “Certificate ready” (can take up to ~15 min after DNS).

`CNAME` in this repo must stay as `static.blc.cab`.

## Publish

From the private `miniapp_blc` repo after `npm run release`:

`ash
node scripts/publish-static.mjs
`

Or automatic: release pipeline copies `frontend/dist/assets` here and pushes `main`.
