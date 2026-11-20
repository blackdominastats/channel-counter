const MIXERNO = "https://mixerno.space/api/youtube-channel-counter";
const NEXTCOUNTS = "https://api.nextcounts.com";
const FIREBASE = "https://channel-counter-d7a71-default-rtdb.firebaseio.com";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const cors = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400"
    };
    if (request.method === "OPTIONS") return new Response(null, { headers: cors });
    if (request.method !== "GET") return json({ success: false, error: "Use GET." }, 405, cors);

    // No-key channel search proxy: preserves the site's existing Mixerno search.
    // The browser calls this Worker instead of contacting Mixerno cross-origin.
    const searchMatch = url.pathname.match(/^\/api\/youtube\/search\/(.+)$/);
    if (searchMatch) {
      let term;
      try { term = decodeURIComponent(searchMatch[1]); }
      catch { return json({ success: false, error: "Invalid search query." }, 400, cors); }
      try {
        const upstream = await fetch(MIXERNO + "/search/" + encodeURIComponent(term), {
          headers: { "Accept": "application/json" }
        });
        const body = await upstream.text();
        return new Response(body, {
          status: upstream.status,
          headers: {
            "Content-Type": upstream.headers.get("Content-Type") || "application/json; charset=utf-8",
            "Cache-Control": "no-store",
            ...cors
          }
        });
      } catch (error) {
        return json({ success: false, error: "Mixerno search is temporarily unavailable.", details: String(error) }, 502, cors);
      }
    }

    // Supports both one channel ID and the comma-separated {{channels}} token
    // used by the Top 50 custom API importer.
    const channelMatch = url.pathname.match(/^\/api\/youtube\/channel\/(.+)\/?$/);
    if (!channelMatch) return json({
      success: true,
      name: "Channel Counter API",
      endpoint: "/api/youtube/channel/:channelId",
      batchEndpoint: "/api/youtube/channel/{{channels}}",
      description: "Returns channel details and subscriber counts. For multiple IDs, returns { success: true, data: [...] }."
    }, 200, cors);

    let ids;
    try {
      ids = decodeURIComponent(channelMatch[1]).split(/[;,\s]+/).filter(Boolean);
    } catch {
      return json({ success: false, error: "Invalid channel ID list." }, 400, cors);
    }
    if (!ids.length || ids.length > 50 || ids.some(id => !/^UC[A-Za-z0-9_-]{20,}$/.test(id))) {
      return json({ success: false, error: "Provide one or more valid YouTube channel IDs (maximum 50)." }, 400, cors);
    }

    const youtube = await getYoutubeChannels(ids, env.YOUTUBE_API_KEY);
    const results = await Promise.all(ids.map(id => getChannelResult(id, youtube.get(id))));
    if (ids.length === 1) return json(results[0], 200, cors);
    return json({ success: true, data: results, updatedAt: new Date().toISOString() }, 200, cors);
  }
};

function json(value, status = 200, cors = {}) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...cors }
  });
}

async function getChannelResult(id, youtube) {
  const override = await getForcedOverride(id);
  if (override !== null) {
    return { success: true, channelId: id, name: youtube?.name || null, avatar: youtube?.avatar || null, count: override, source: "admin-override", updatedAt: new Date().toISOString() };
  }

  if (!youtube || !Number.isSafeInteger(youtube.count)) {
    return { success: false, channelId: id, name: youtube?.name || null, avatar: youtube?.avatar || null, count: null, error: "YouTube Data API count unavailable. Check the Worker YOUTUBE_API_KEY secret and channel ID." };
  }

  const bucket = getYoutubeBucket(youtube.count);
  const growth = await getGrowthConfig(id);
  const rawEstimate = growth?.enabled === true ? calculateGrowth(growth) : bucket.minimum;
  const count = Math.min(bucket.maximum, Math.max(bucket.minimum, Math.round(rawEstimate)));

  return {
    success: true,
    channelId: id,
    name: youtube.name,
    avatar: youtube.avatar,
    count,
    youtubeCount: bucket.minimum,
    bucketMinimum: bucket.minimum,
    bucketMaximum: bucket.maximum,
    source: growth?.enabled === true ? "custom-time-estimate" : "youtube-api",
    updatedAt: new Date().toISOString()
  };
}

// YouTube's public subscriberCount is rounded down to three significant figures.
// The returned value is therefore the lower edge of the only safe estimation bucket.
function getYoutubeBucket(value) {
  const count = Math.max(0, Math.floor(Number(value) || 0));
  if (count <= 1000) return { minimum: count, maximum: count };
  const magnitude = Math.floor(Math.log10(count));
  const step = Math.pow(10, magnitude - 2);
  const minimum = Math.floor(count / step) * step;
  return { minimum, maximum: minimum + step - 1 };
}

// Fetch all requested channels in one YouTube API request (up to 50 IDs).
// Cache for 30 seconds to avoid consuming quota on every counter refresh.
async function getYoutubeChannels(ids, apiKey) {
  const output = new Map();
  if (!apiKey) return output;

  const cache = caches.default;
  const cacheUrl = "https://youtube-api-cache.invalid/v1/channels/" + ids.slice().sort().join(",");
  const cacheKey = new Request(cacheUrl);
  let payload = null;

  try {
    const cached = await cache.match(cacheKey);
    if (cached) payload = await cached.json();
  } catch {}

  if (!payload) {
    try {
      const endpoint = new URL("https://www.googleapis.com/youtube/v3/channels");
      endpoint.searchParams.set("part", "snippet,statistics");
      endpoint.searchParams.set("id", ids.join(","));
      endpoint.searchParams.set("key", apiKey);
      const response = await fetch(endpoint.toString(), { headers: { "Accept": "application/json" } });
      if (!response.ok) return output;
      payload = await response.json();
      try {
        await cache.put(cacheKey, new Response(JSON.stringify(payload), {
          headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=30" }
        }));
      } catch {}
    } catch {
      return output;
    }
  }

  for (const item of payload?.items || []) {
    const id = item?.id;
    const raw = item?.statistics?.subscriberCount;
    const count = Number(raw);
    if (!id || item?.statistics?.hiddenSubscriberCount || raw == null || !Number.isSafeInteger(count)) continue;
    const thumbs = item.snippet?.thumbnails || {};
    output.set(id, {
      count,
      name: item.snippet?.title || null,
      avatar: thumbs.high?.url || thumbs.medium?.url || thumbs.default?.url || null
    });
  }
  return output;
}

async function getForcedOverride(id) {
  try {
    const override = await fetchJson(FIREBASE + "/overrides/" + encodeURIComponent(id) + ".json");
    if (override == null) return null;
    const value = Number(typeof override === "object" ? override.value : override);
    const force = !(override && typeof override === "object" && override.force === false);
    return Number.isSafeInteger(value) && value >= 0 && force ? value : null;
  } catch { return null; }
}

async function getGrowthConfig(id) {
  try {
    return await fetchJson(FIREBASE + "/growthOverrides/" + encodeURIComponent(id) + ".json");
  } catch { return null; }
}

async function getChannelMetadata(id) {
  try {
    const data = await fetchJson(MIXERNO + "/user/" + encodeURIComponent(id));
    const roots = [data, data?.data, data?.result, data?.channel].filter(Boolean);
    const name = first(roots, ["user.0.count", "user.0", "name", "title", "channelName", "channel.title", "snippet.title"]);
    const avatar = first(roots, ["user.1.count", "user.1", "image", "avatar", "imageUrl", "thumbnail", "snippet.thumbnails.high.url", "snippet.thumbnails.medium.url"]);
    return { name: name == null ? null : String(name), avatar: avatar == null ? null : String(avatar) };
  } catch {
    return { name: null, avatar: null };
  }
}

async function getEstimated(id) {
  try {
    const data = await fetchJson(MIXERNO + "/user/" + encodeURIComponent(id));
    const roots = [data, data?.data, data?.result, data?.channel].filter(Boolean);
    const raw = first(roots, ["counts.0.count", "counts.0", "count", "subscriberCount", "estimatedSubscribers", "estimatedSubscriberCount", "statistics.subscriberCount"]);
    const count = parseCount(raw);
    return raw != null && Number.isSafeInteger(count) && count >= 0 ? count : null;
  } catch { return null; }
}

async function getNextCounts(id) {
  try {
    const directory = await fetchJson(NEXTCOUNTS + "/api/youtube/studio/channels");
    if (!directory?.success || !Array.isArray(directory.data)) return null;
    const entry = directory.data.find(item => String(item.id) === id);
    if (!entry || entry.countsAvailable === false) return null;
    const result = await fetchJson(NEXTCOUNTS + "/api/youtube/studio/channel/" + encodeURIComponent(id) + "/realtime");
    if (!result?.success) return null;
    const raw = result.data?.subscribers ?? result.data?.subscriberCount ?? result.data?.statistics?.subscriberCount;
    const count = Number(raw);
    return raw != null && raw !== "" && Number.isSafeInteger(count) && count >= 0 ? count : null;
  } catch { return null; }
}

function calculateGrowth(cfg, now = Date.now()) {
  const min = Math.max(0, Number(cfg.min) || 0), max = Math.max(min, Number(cfg.max) || min);
  const every = Math.max(1, Number(cfg.every) || 1);
  const units = { seconds: 1000, updates: 5000, minutes: 60000, hours: 3600000, days: 86400000 };
  const steps = Math.floor(Math.max(0, now - Number(cfg.startAt || now)) / ((units[cfg.unit] || 5000) * every));
  let total = Math.max(0, Number(cfg.startCount) || 0);
  const seed = Number(cfg.startAt) || 1;
  for (let i = 1; i <= steps; i++) {
    let x = (Math.imul((seed >>> 0) ^ i, 1664525) + 1013904223) >>> 0;
    x ^= x >>> 16;
    total += min + ((x >>> 0) % (max - min + 1));
  }
  return total;
}

async function fetchJson(url) {
  const response = await fetch(url, { headers: { "Accept": "application/json" } });
  if (!response.ok) throw new Error("HTTP " + response.status);
  return response.json();
}
function atPath(obj, path) { return path.split(".").reduce((value, key) => value == null ? undefined : value[key], obj); }
function first(objects, paths) {
  for (const object of objects) for (const path of paths) {
    const value = atPath(object, path);
    if (value !== undefined && value !== null && value !== "") return value && typeof value === "object" && "count" in value ? value.count : value;
  }
  return null;
}
function parseCount(value) {
  if (typeof value === "number") return value;
  if (value == null) return NaN;
  const match = String(value).trim().replace(/,/g, "").match(/^([\d.]+)([KMB])?$/i);
  if (!match) return NaN;
  return Math.round(Number(match[1]) * ({ K: 1e3, M: 1e6, B: 1e9 }[(match[2] || "").toUpperCase()] || 1));
}
