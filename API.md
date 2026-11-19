# Channel Counter API

A public, read-only JSON API for external websites. This Worker is separate from the Channel Counter website and does not change its existing counter behavior.

## Deploy

1. In Cloudflare, create a Worker named `channel-counter-api`.
2. Paste `worker.js` into the Worker editor and deploy, or connect this repository with Wrangler.
3. The included `wrangler.toml` provides the Worker name and entry point.
4. Cloudflare assigns a URL such as `https://channel-counter-api.<your-subdomain>.workers.dev`.

## Endpoints

- `GET /api/youtube/channel/UC...` — effective count and all available source values.
- `GET /api/youtube/channel/UC...?source=estimated` — Mixerno.Space estimate.
- `GET /api/youtube/channel/UC...?source=nextcounts` — exact NextCounts Studio count, when publicly published.
- `GET /api/youtube/channel/UC...?source=custom` — forced shared override or active custom growth count.

No API key is required for public reads. CORS is enabled for browser-based sites.

## Response example

```json
{
  "success": true,
  "channelId": "UC...",
  "count": 123456,
  "source": "nextcounts",
  "observedAt": "2026-11-19T12:00:00.000Z",
  "data": { "estimated": 123400, "nextcounts": 123456, "custom": null },
  "availability": { "estimated": true, "nextcounts": true, "custom": false }
}
```

The default source priority matches the website: forced shared Firebase override, active Firebase growth override, NextCounts, then Mixerno.Space. Browser-local overrides are not exposed because they exist only in an individual visitor's local storage.

The API is read-only and does not expose admin writes or Firebase credentials. Default responses are cached for up to five seconds. Custom count is null when no shared override or growth override is active.
