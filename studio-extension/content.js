(() => {
  if (window.__channelCounterStudioReader) return;
  window.__channelCounterStudioReader = true;

  const clean = value => String(value || "").replace(/\\s+/g, " ").trim();

  function readCounters() {
    // The supplied Studio markup uses the yta-explore-subscribers class on
    // descendants; it does not guarantee a <yta-explore-subscribers> ancestor.
    const roots = [...document.querySelectorAll("yta-smooth-counter")];
    const diagnostics = [];
    const candidates = [];

    for (const root of roots) {
      const counter = root.querySelector(".counter");
      const cells = [...root.querySelectorAll(".counter-value")];
      const visibleCells = cells.filter(el => el.getClientRects().length);
      const visibleText = visibleCells.map(el => clean(el.textContent));
      diagnostics.push({
        rootVisible: !!root.getClientRects().length,
        counterFound: !!counter,
        cellsFound: cells.length,
        visibleCells: visibleCells.length,
        values: visibleText.slice(0, 30),
        rootClasses: root.className?.toString?.() || ""
      });

      if (!counter || !root.getClientRects().length || !visibleCells.length) continue;

      // Read only the displayed counter cells, preserving their DOM order.
      let digits = "";
      let valid = true;
      for (const cell of visibleCells) {
        const value = clean(cell.textContent);
        if (/^\\d$/.test(value)) digits += value;
        else if (value === ",") continue;
        else if (value === "") continue;
        else { valid = false; break; }
      }

      if (valid && digits.length >= 1 && digits.length <= 15) {
        candidates.push({
          exactCount: digits,
          formattedCount: digits.replace(/\\B(?=(\\d{3})+(?!\\d))/g, ","),
          source: "YouTube Studio smooth counter"
        });
      }
    }
    return { candidates, diagnostics, smoothCounterElements: roots.length };
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type === "READ_STUDIO_COUNT") {
      sendResponse({
        url: location.href,
        title: document.title,
        ...readCounters(),
        checkedAt: new Date().toISOString()
      });
    }
  });
})();