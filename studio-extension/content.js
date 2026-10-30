(() => {
  if (window.__channelCounterStudioReader) return;
  window.__channelCounterStudioReader = true;

  const clean = value => String(value || "").replace(/\\s+/g, " ").trim();
  const numberPattern = /\\b\\d{1,3}(?:,\\d{3})+(?:\\.\\d+)?\\b|\\b\\d{4,}\\b/g;

  function scan() {
    const candidates = [];
    const add = (text, source) => {
      const value = clean(text);
      if (!value || value.length > 500) return;
      const numbers = value.match(numberPattern) || [];
      if (numbers.length) candidates.push({ text: value, numbers, source });
    };

    const selectors = [
      '[aria-label*="subscriber" i]',
      '[title*="subscriber" i]',
      '[class*="subscriber" i]',
      '[id*="subscriber" i]',
      'ytcp-live-subscriber-count',
      'ytcp-analytics-overview'
    ];
    for (const selector of selectors) {
      document.querySelectorAll(selector).forEach(el => {
        if (el.getClientRects().length) {
          add(el.getAttribute("aria-label"), selector + " aria-label");
          add(el.getAttribute("title"), selector + " title");
          add(el.innerText || el.textContent, selector);
        }
      });
    }

    const lines = (document.body?.innerText || "").split(/\\n+/).map(clean).filter(Boolean);
    for (let i = 0; i < lines.length; i++) {
      if (/subscriber/i.test(lines[i])) {
        add(lines.slice(Math.max(0, i - 2), Math.min(lines.length, i + 4)).join(" | "), "page text near Subscribers");
      }
    }

    const unique = [];
    const seen = new Set();
    for (const item of candidates) {
      const key = item.text.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(item);
      }
    }
    return unique.slice(0, 20);
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