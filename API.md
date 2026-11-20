# Channel Counter API

A public, read-only JSON endpoint for other websites. It returns **one subscriber count**, not a list of selectable data sources.

## Endpoint

`GET /api/youtube/channel/UC...`

Example response:

```json
{
  "success": true,
  "channelId": "UC...",
  "count": 123456,
  "updatedAt": "2026-11-19T12:00:00.000Z"
}
```

## How the count is chosen

1. If you set a shared admin override for the channel in Channel Counter, the API returns that override.
2. Otherwise, it uses the exact NextCounts count when the channel is published in NextCounts Studio.
3. If NextCounts does not have a count for the channel, it falls back to the Mixerno.Space estimate.

An enabled shared custom-growth setting is also treated as an admin override. Browser-local overrides are not available to the public API because they are stored only in an individual browser's local storage; use the shared admin override setting for a value that external websites should receive.

No API key is required for public reads. CORS is enabled. Responses are not cached so admin changes can be reflected promptly. The endpoint is read-only and does not expose admin write access or Firebase credentials.

## Deploy

Deploy `worker.js` as a Cloudflare Worker. The included `wrangler.toml` contains the Worker name and entry point. Cloudflare will provide a `workers.dev` URL; use that URL as the base for the endpoint.
