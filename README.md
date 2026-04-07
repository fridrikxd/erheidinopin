# erheidinopin

Cloudflare Worker fyrir `erheidinopin.is`.

## Innihald

- Forsíða á `/`
- JSON staða á `/status`
- `ads.txt` á `/ads.txt`
- Google AdSense grunnstilling í `<head>`

## Keyra locally

```bash
npm install
npm run dev
```

## Deploy

```bash
npm install
npm run deploy
```

## Skrár

- `src/index.js` - allur Worker kóðinn
- `wrangler.toml` - Cloudflare stillingar
- `package.json` - scripts og dependencies
