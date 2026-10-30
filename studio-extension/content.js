(() => {
  if (window.__channelCounterStudioReader) return;
  window.__channelCounterStudioReader = true;

  const clean = value => String(value || "").replace(/\\s+/g, " ").trim();

  function readCounter() {
    // Target the dedicated subscriber analytics counter, not arbitrary page numbers.
    const roots = [...document.querySelectorAll("yta-explore-subscribers yta-smooth-counter")];
    for (const root of roots) {
      const counter = root.querySelector("#counter.counter");
      if (!counter || !counter.getClientRects().length) continue;

      const symbols = [...counter.querySelectorAll(":scope > div > .counter-symbol")];
      if (!symbols.length) continue;

      let digits = "";
      let valid = true;
      for (const symbol of symbols) {
        const digitCell = [...symbol.querySelectorAll(".counter-value[is-digit]")]
          .find(el => el.getClientRects().length && /^\\d$/.test(clean(el.textContent)));
        if (digitCell) {
          digits += clean(digitCell.textContent);
          continue;
        }

        const punctuation = [...symbol.querySelectorAll(".counter-value")]
          .find(el => el.getClientRects().length && clean(el.textContent) === ",");
        if (punctuation) continue;

        valid = false;
        break;
      }

      if (valid && digits.length >= 1 && digits.length <= 15) {
        return {
          exactCount: digits,
          formattedCount: Number(digits).toLocaleString("en-US"),
          source: "YouTube Studio yta-smooth-counter",
          text: clean(counter.innerText || counter.textContent)
        };
      }
    }
    return null;
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type === "READ_STUDIO_COUNT") {
      const result = readCounter();
      sendResponse({
        url: location.href,
        title: document.title,
        candidate: result,
        checkedAt: new Date().toISOString()
      });
    }
  });
})();