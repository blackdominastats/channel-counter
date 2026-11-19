const MIXERNO = "https://mixerno.space/api/youtube-channel-counter";
const NEXTCOUNTS = "https://api.nextcounts.com";
const FIREBASE = "https://channel-counter-d7a71-default-rtdb.firebaseio.com";
const CACHE_SECONDS = 5;

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const cors = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400"
    };
    if (request.method === "OPTIONS") return new Response(null, { headers: cors });
    if (request.method !== "GET") return json({ success: false, error: { code: "METHOD_NOT_ALLOWED", message: "Use GET." } }, 405, cors);

    const match = url.pathname.match(/^\/api\/youtube\/channel\/([A-Za-z0-9_-]+)\/?$/);
    if (!match) return json({ success: true, name: "Channel Counter API", endpoints: ["/api/youtube/channel/:channelId", "/api/youtube/channel/:channelId?source=estimated", "/api/youtube/channel/:channelId?source=nextcounts", "/api/youtube/channel/:channelId?source=custom"], docs: "https://github.com/blackdominastats/channel-counter/blob/main/API.md" }, 200, cors);

    const id = match[1];
    if (!/^UC[A-Za-z0-9_-]{20,}$/.test(id)) return json({ success: false, error: { code: "INVALID_CHANNEL_ID", message: "Provide a valid YouTube channel ID." } }, 400, cors);
    const source = (url.searchParams.get("source") || "all").toLowerCase();
    if (!["all", "estimated", "nextcounts", "custom"].includes(source)) return json({ success: false, error: { code: "INVALID_SOURCE", message: "source must be all, estimated, nextcounts, or custom." } }, 400, cors);

    const cache = caches.default;
    const cacheKey = new Request(url.toString(), request);
    if (source === "all") {
      const cached = await cache.match(cacheKey);
      if (cached) {
        const headers = new Headers(cached.headers);
        Object.entries(cors).forEach(([k, v]) => headers.set(k, v));
        return new Response(cached.body, { status: cached.status, headers });
      }
    }

    const results = await Promise.all([
      source === "nextcounts" || source === "custom" ? null : getEstimated(id),
      source === "estimated" || source === "custom" ? null : getNextCounts(id),
      source === "estimated" || source === "nextcounts" ? null : getCustom(id)
    ]);
    const estimated = results[0]?.ok ? results[0].data : null;
    const nextcounts = results[1]?.ok ? results[1].data : null;
    const custom = results[2]?.ok ? results[2].data : null;

    let selected = null;
    if (source === "estimated") selected = estimated;
    else if (source === "nextcounts") selected = nextcounts;
    else if (source === "custom") selected = custom;
    else if (custom?.forcedOverride) selected = { count: custom.count, source: "custom", updatedAt: custom.updatedAt };
    else if (custom?.growth) selected = { count: custom.count, source: "custom-growth", updatedAt: custom.updatedAt };
    else selected = nextcounts || estimated;

    const payload = {
      success: Boolean(selected),
      channelId: id,
      count: selected?.count ?? null,
      source: selected?.source ?? null,
      observedAt: new Date().toISOString(),
      data: { estimated: estimated?.count ?? null, nextcounts: nextcounts?.count ?? null, custom: custom?.count ?? null },
      availability: { estimated: Boolean(estimated), nextcounts: Boolean(nextcounts), custom: Boolean(custom) }
    };
    if (!selected) payload.error = { code: "COUNT_UNAVAILABLE", message: "No subscriber count source is currently available for this channel." };
    const response = json(payload, selected ? 200 : 502, cors);
    if (source === "all" && selected) {
      const cacheResponse = response.clone();
      cacheResponse.headers.set("Cache-Control", "public, max-age=" + CACHE_SECONDS);
      ctx.waitUntil(cache.put(cacheKey, cacheResponse));
    }
    return response;
  }
};

function json(value, status = 200, cors = {}) {
  return new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...cors } });
}
async function getEstimated(id) {
  try {
    const data = await fetchJson(MIXERNO + "/user/" + encodeURIComponent(id));
    const roots = [data, data?.data, data?.result, data?.channel].filter(Boolean);
    const raw = first(roots, ["counts.0.count", "counts.0", "count", "subscriberCount", "estimatedSubscribers", "estimatedSubscriberCount", "statistics.subscriberCount"]);
    const count = parseCount(raw);
    if (raw == null || !Number.isSafeInteger(count) || count < 0) throw new Error("Mixerno count unavailable");
    return { ok: true, data: { count, source: "estimated" } };
  } catch (error) { return { ok: false, error: error.message }; }
}
async function getNextCounts(id) {
  try {
    const directory = await fetchJson(NEXTCOUNTS + "/api/youtube/studio/channels");
    if (!directory?.success || !Array.isArray(directory.data)) throw new Error("NextCounts directory unavailable");
    const entry = directory.data.find(item => String(item.id) === id);
    if (!entry || entry.countsAvailable === false) throw new Error("Channel is not publicly published in NextCounts Studio");
    const result = await fetchJson(NEXTCOUNTS + "/api/youtube/studio/channel/" + encodeURIComponent(id) + "/realtime");
    if (!result?.success) throw new Error(result?.error?.message || "NextCounts count unavailable");
    const raw = result.data?.subscribers ?? result.data?.subscriberCount ?? result.data?.statistics?.subscriberCount;
    const count = Number(raw);
    if (raw == null || raw === "" || !Number.isSafeInteger(count) || count < 0) throw new Error("Invalid NextCounts subscriber count");
    return { ok: true, data: { count, source: "nextcounts", observedAt: result.data?.observedAt ?? null } };
  } catch (error) { return { ok: false, error: error.message }; }
}
async function getCustom(id) {
  try {
    const pair = await Promise.all([
      fetchJson(FIREBASE + "/overrides/" + encodeURIComponent(id) + ".json"),
      fetchJson(FIREBASE + "/growthOverrides/" + encodeURIComponent(id) + ".json")
    ]);
    const override = pair[0], growth = pair[1];
    let count = null, forcedOverride = false, isGrowth = false, updatedAt = null;
    if (override != null) {
      const value = Number(typeof override === "object" ? override.value : override);
      const force = !(override && typeof override === "object" && override.force === false);
      if (Number.isSafeInteger(value) && value >= 0 && force) { count = value; forcedOverride = true; updatedAt = override.updatedAt ?? null; }
    }
    if (count === null && growth?.enabled === true) {
      count = calculateGrowth(growth);
      if (Number.isSafeInteger(count) && count >= 0) { isGrowth = true; updatedAt = growth.updatedAt ?? growth.startAt ?? null; }
      else count = null;
    }
    return { ok: count !== null, data: count === null ? null : { count, source: forcedOverride ? "custom" : "custom-growth", forcedOverride, growth: isGrowth, updatedAt } };
  } catch (error) { return { ok: false, error: error.message }; }
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
