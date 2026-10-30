(() => {
  if (window.__channelCounterStudioReader) return;
  window.__channelCounterStudioReader = true;

  const clean = value => String(value || "").replace(/\\s+/g, " ").trim();
  const visible = el => !!(el && el.getClientRects().length);

  function describe(el) {
    if (!el) return "";
    const parts = [];
    let node = el;
    for (let depth = 0; node && depth < 5; depth++, node = node.parentElement) {
      let label = node.tagName.toLowerCase();
      if (node.id) label += "#" + node.id;
      if (typeof node.className === "string" && node.className.trim()) {
        label += "." + node.className.trim().split(/\\s+/).slice(0, 3).join(".");
      }
      parts.push(label);
    }
    return parts.join(" ← ");
  }

  function scan() {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const markers = [];
    let textNode;
    while ((textNode = walker.nextNode())) {
      if (/updating\\s+live/i.test(textNode.nodeValue || "")) {
        const el = textNode.parentElement;
        if (visible(el)) markers.push(el);
      }
    }

    const diagnostics = [];
    const candidates = [];
    for (const marker of markers.slice(0, 5)) {
      let node = marker;
      for (let depth = 0; node && depth < 7; depth++, node = node.parentElement) {
        if (!visible(node)) continue;
        const text = clean(node.innerText || node.textContent);
        if (!/updating\\s+live/i.test(text) || !/subscribers/i.test(text)) continue;
        if (text.length > 500) continue;

        const digitLeaves = [...node.querySelectorAll("*")]
          .filter(el => visible(el) && el.children.length === 0)
          .map(el => clean(el.innerText || el.textContent))
          .filter(value => /^\\d$/.test(value));
        const combined = digitLeaves.join("");

        diagnostics.push({
          path: describe(node),
          text: text.slice(0, 220),
          digitLeaves: digitLeaves.slice(0, 20),
          digitCount: digitLeaves.length
        });

        // Only accept a compact local section with individually rendered digit cells.
        if (combined.length >= 2 && combined.length <= 12 && text.length <= 220) {
          const key = combined + "|" + describe(node);
          if (!candidates.some(item => item.key === key)) {
            candidates.push({
              key,
              exactCount: combined,
              source: "Digit elements inside Updating live section",
              text
            });
          }
        }
      }
    }

    return { candidates: candidates.slice(0, 3), diagnostics: diagnostics.slice(0, 8), markerCount: markers.length };
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type === "READ_STUDIO_COUNT") {
      sendResponse({
        url: location.href,
        title: document.title,
        ...scan(),
        checkedAt: new Date().toISOString()
      });
    }
  });
})();