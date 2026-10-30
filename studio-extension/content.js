(() => {
  if (window.__channelCounterStudioReader) return;
  window.__channelCounterStudioReader = true;
  const API = "https://netxibndmfqbrvulkqgd.supabase.co/functions/v1/studio-counts";
  const clean = value => String(value || "").replace(/\\s+/g, " ").trim();

  function readCounters() {
    const roots = [...document.querySelectorAll("yta-smooth-counter")];
    const candidates = [];
    const diagnostics = [];
    for (const root of roots) {
      const counter = root.querySelector(".counter");
      const cells = [...root.querySelectorAll(".counter-value")].filter(el => el.getClientRects().length);
      const values = cells.map(el => clean(el.textContent));
      diagnostics.push({rootVisible:!!root.getClientRects().length,counterFound:!!counter,cellsFound:cells.length,values:values.slice(0,30)});
      if (!counter || !root.getClientRects().length || !cells.length) continue;
      let digits = "", valid = true;
      for (const value of values) {
        if (/^\\d$/.test(value)) digits += value;
        else if (value === "," || value === "") continue;
        else { valid = false; break; }
      }
      if (valid && digits.length >= 1 && digits.length <= 15) candidates.push({
        exactCount:digits,
        formattedCount:digits.replace(/\\B(?=(\\d{3})+(?!\\d))/g,","),
        source:"YouTube Studio smooth counter"
      });
    }
    return {candidates,diagnostics,smoothCounterElements:roots.length};
  }

  function getChannelId() {
    const match = location.pathname.match(/\\/channel\\/(UC[a-zA-Z0-9_-]{22})/);
    return match ? match[1] : null;
  }

  let lastSent = "";
  async function automaticShare() {
    try {
      const settings = await chrome.storage.local.get(["studioToken","sharingEnabled"]);
      if (!settings.sharingEnabled || !settings.studioToken) return;
      const channelId = getChannelId();
      const candidate = readCounters().candidates[0];
      if (!channelId || !candidate) return;
      const count = Number(candidate.exactCount);
      if (!Number.isSafeInteger(count)) return;
      const signature = channelId + ":" + count;
      if (signature === lastSent) return;
      const response = await fetch(API, {
        method:"POST",
        headers:{"Content-Type":"application/json","x-studio-token":settings.studioToken},
        body:JSON.stringify({channel_id:channelId,subscriber_count:count})
      });
      if (response.ok) lastSent = signature;
      else if (response.status !== 429) console.warn("[Channel Counter] Share failed:", response.status);
    } catch (error) {
      console.warn("[Channel Counter] Automatic sharing error:", error);
    }
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type === "READ_STUDIO_COUNT") {
      sendResponse({url:location.href,title:document.title,...readCounters(),checkedAt:new Date().toISOString()});
    }
  });

  // Poll Studio's rendered counter. No account credentials or cookies are read.
  setInterval(automaticShare, 5000);
  setTimeout(automaticShare, 1500);
})();