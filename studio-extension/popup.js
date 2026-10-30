const statusEl = document.getElementById("status");
const resultsEl = document.getElementById("results");
document.getElementById("scan").addEventListener("click", async () => {
  resultsEl.replaceChildren();
  statusEl.textContent = "Reading Studio counter elements…";
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.url?.startsWith("https://studio.youtube.com/")) {
      statusEl.textContent = "Open YouTube Studio in this tab first.";
      return;
    }
    const result = await chrome.tabs.sendMessage(tab.id, { type: "READ_STUDIO_COUNT" });
    if (!result) throw new Error("No response from Studio. Refresh the Studio tab and try again.");

    if (result.candidates?.length) {
      statusEl.textContent = "Counter element found. Check that the value matches Studio.";
      for (const candidate of result.candidates) {
        const item = document.createElement("div");
        item.className = "item";
        const source = document.createElement("div");
        source.className = "small";
        source.textContent = candidate.source;
        const num = document.createElement("div");
        num.className = "num";
        num.textContent = candidate.formattedCount;
        const raw = document.createElement("div");
        raw.className = "small";
        raw.textContent = "Raw digits: " + candidate.exactCount;
        item.append(source, num, raw);
        resultsEl.append(item);
      }
    } else {
      statusEl.textContent = "Count not detected. See diagnostics below; this version also checks the actual yta-smooth-counter element without assuming its parent tag.";
    }

    const heading = document.createElement("h3");
    heading.textContent = "Counter diagnostics";
    heading.style.fontSize = "13px";
    resultsEl.append(heading);
    const summary = document.createElement("div");
    summary.className = "item small";
    summary.textContent = "yta-smooth-counter elements found: " + result.smoothCounterElements;
    resultsEl.append(summary);

    for (const diagnostic of (result.diagnostics || [])) {
      const item = document.createElement("div");
      item.className = "item";
      const info = document.createElement("div");
      info.className = "small";
      info.textContent = "Visible: " + diagnostic.rootVisible + " · Counter found: " + diagnostic.counterFound + " · Cells: " + diagnostic.cellsFound + " · Visible cells: " + diagnostic.visibleCells;
      const values = document.createElement("div");
      values.textContent = "Cell values: " + (diagnostic.values.join(" | ") || "none");
      item.append(info, values);
      resultsEl.append(item);
    }
  } catch (error) {
    statusEl.textContent = error.message + " If the extension was just updated, reload it and refresh Studio.";
  }
});