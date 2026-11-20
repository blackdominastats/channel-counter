# Channel Counter API

A public, read-only JSON endpoint for other websites.

## Endpoint

`GET /api/youtube/channel/UC...`

For a Top 50 batch, pass up to 50 comma-separated channel IDs:

`GET /api/youtube/channel/UC...,UC...`

## Count logic

1. A forced shared admin override takes priority.
2. Otherwise, the Worker reads the channel's public subscriber count from the YouTube Data API.
3. The existing per-channel time-based growth setting can estimate movement within YouTube's current public-count bucket.
4. The estimate is clamped to the bucket YouTube returned. It cannot cross into the next or previous public-count bucket until YouTube's API reports that bucket.

YouTube rounds public subscriber counts down to three significant figures above 1,000. For example, an API value of 80,500,000 permits an estimate from 80,500,000 through 80,599,999. The Worker does not use Mixerno or NextCounts as subscriber-count fallbacks. Mixerno remains only as the channel-search proxy.

The batch response is `{ "success": true, "data": [...] }`. Each item includes `channelId`, `name`, `avatar`, `count`, `youtubeCount`, `bucketMinimum`, `bucketMaximum`, and `source`.

## Required Cloudflare secret

The Worker needs a YouTube Data API key stored as a Cloudflare Worker secret named `YOUTUBE_API_KEY`. Do not put the key in GitHub or in the website's JavaScript.

In Cloudflare:
1. Open **Workers & Pages** and select `channel-counter-api`.
2. Open **Settings → Variables and Secrets**.
3. Add a variable with type **Secret**, name `YOUTUBE_API_KEY`, and your key as its value.
4. Save/deploy the Worker.

YouTube channel-list requests for up to 50 IDs are batched into one API request and cached for 30 seconds to reduce quota use.

## Deployment

Deploy `worker.js` as a Cloudflare Worker. The included `wrangler.toml` contains the Worker name and entry point. CORS is enabled. The endpoint is read-only and does not expose admin write access or the API key.
