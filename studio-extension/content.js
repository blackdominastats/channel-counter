(() => {
  if (window.__channelCounterStudioReader) return;
  window.__channelCounterStudioReader = true;

  const clean = value => String(value || "").replace(/\s+/g, " ").trim();

  function scan() {
    const bodyText = clean(document.body?.innerText || "");
    const candidates = [];
    const liveIndex = bodyText.toLowerCase().indexOf("updating live");

    if (liveIndex !== -1) {
      const afterLive = bodyText.slice(liveIndex, liveIndex + 300);
      const match = afterLive.match(/updating live\s+(.{1,140}?)\s+subscribers\b/i);
      if (match) {
        const middle = match[1];
        const digitTokens = middle.match(/\b\d\b/g) || [];
        const combined = digitTokens.join("");
        if (combined.length >= 2 && combined.length <= 12) {
          candidates.push({
            text: match[0],
            numbers: [combined],
            exactCount: combined,
            source: "Studio live subscriber count"
          });
        }
      }
    }

    // Fallback: inspect visible elements whose accessible label explicitly mentions
    // the live subscriber count. Avoid scanning analytics charts and date labels.
    const selectors = [
      '[aria-label*="live subscriber count" i]',
      '[title*="live subscriber count" i]',
      'ytcp-live-subscriber-count'
    ];
    for (const selector of selectors) {
      document.querySelectorAll(selector).forEach(el => {
        if (!el.getClientRects().length) return;
        const text = clean(el.getAttribute("aria-label") || el.getAttribute("title") || el.innerText || el.textContent);
        const digits = text.match(/\d/g) || [];
        if (digits.length >= 2 && digits.length <= 12) {
          const combined = digits.join("");
          if (!candidates.some(item => item.exactCount === combined)) {
            candidates.push({
              text,
              numbers: [combined],
              exactCount: combined,
              source: "Accessible live-count label"
            });
          }
        }
      });
    }

    return candidates.slice(0, 5);
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type === "READ_STUDIO_COUNT") {
      sendResponse({
        url: location.href,
        title: document.title,
        candidates: scan(),
        checkedAt: new Date().toISOString()
      });
    }
  });
})();