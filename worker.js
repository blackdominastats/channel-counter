const MIXERNO = "https://mixerno.space/api/youtube-channel-counter";
const NEXTCOUNTS = "https://api.nextcounts.com";
const FIREBASE = "https://channel-counter-d7a71-default-rtdb.firebaseio.com";

export default {
  async fetch(request) {
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

    const match = url.pathname.match(/^\/api\/youtube\/channel\/([A-Za-z0-9_-]+)\/?$/);
    if (!match) return json({
      success: true,
      name: "Channel Counter API",
      endpoint: "/api/youtube/channel/:channelId",
      description: "Returns one current subscriber count. Shared admin overrides take priority; otherwise NextCounts is used when available, with Mixerno estimates as fallback."
    }, 200, cors);

    const id = match[1];
    if (!/^UC[A-Za-z0-9_-]{20,}$/.test(id)) return json({ success: false, error: "Provide a valid YouTube channel ID." }, 400, cors);

    // Admin-configured shared override/growth always wins over live data.
    const custom = await getCustom(id);
    if (custom !== null) {
      return json({ success: true, channelId: id, count: custom, updatedAt: new Date().toISOString() }, 200, cors);
    }

    // Prefer an available exact NextCounts value; otherwise use Mixerno estimate.
    const exact = await getNextCounts(id);
    if (exact !== null) {
      return json({ success: true, channelId: id, count: exact, updatedAt: new Date().toISOString() }, 200, cors);
    }

    const estimated = await getEstimated(id);
    if (estimated !== null) {
      return json({ success: true, channelId: id, count: estimated, updatedAt: new Date().toISOString() }, 200, cors);
    }

    return json({ success: false, channelId: id, count: null, error: "No subscriber count is currently available for this channel." }, 502, cors);
  }
};

function json(value, status = 200, cors = {}) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...cors }
  });
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

async function getCustom(id) {
  try {
    const [override, growth] = await Promise.all([
      fetchJson(FIREBASE + "/overrides/" + encodeURIComponent(id) + ".json"),
      fetchJson(FIREBASE + "/growthOverrides/" + encodeURIComponent(id) + ".json")
    ]);
    if (override != null) {
      const value = Number(typeof override === "object" ? override.value : override);
      const force = !(override && typeof override === "object" && override.force === false);
      if (Number.isSafeInteger(value) && value >= 0 && force) return value;
    }
    if (growth?.enabled === true) {
      const value = calculateGrowth(growth);
      if (Number.isSafeInteger(value) && value >= 0) return value;
    }
    return null;
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
