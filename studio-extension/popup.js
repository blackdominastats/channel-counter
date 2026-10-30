const statusEl = document.getElementById("status");
const resultsEl = document.getElementById("results");
document.getElementById("scan").addEventListener("click", async () => {
  resultsEl.replaceChildren();
  statusEl.textContent = "Inspecting the live-count section…";
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.url?.startsWith("https://studio.youtube.com/")) {
      statusEl.textContent = "Open YouTube Studio in this tab first.";
      return;
    }
    const result = await chrome.tabs.sendMessage(tab.id, { type: "READ_STUDIO_COUNT" });
    if (!result) throw new Error("No response from the Studio page. Reload the Studio tab and try again.");
    const candidates = result.candidates || [];
    if (candidates.length) {
      statusEl.textContent = "Possible count found in the live section. Verify it against Studio before using it.";
      for (const candidate of candidates) {
        const item = document.createElement("div");
        item.className = "item";
        const source = document.createElement("div");
        source.className = "small";
        source.textContent = candidate.source;
        const num = document.createElement("div");
        num.className = "num";
        num.textContent = candidate.exactCount;
        const detail = document.createElement("div");
        detail.className = "small";
        detail.textContent = candidate.text;
        item.append(source, num, detail);
        resultsEl.append(item);
      }
    } else {
      statusEl.textContent = "Count not detected. No reliable digit elements were found inside the Updating live section.";
    }

    const heading = document.createElement("h3");
    heading.textContent = "Live-section diagnostics";
    heading.style.fontSize = "13px";
    resultsEl.append(heading);
    const diagnostics = result.diagnostics || [];
    if (!diagnostics.length) {
      const empty = document.createElement("div");
      empty.className = "item small";
      empty.textContent = "No visible Updating live element found. Make sure See Live Count is fully loaded.";
      resultsEl.append(empty);
    }
    for (const diagnostic of diagnostics) {
      const item = document.createElement("div");
      item.className = "item";
      const path = document.createElement("div");
      path.className = "small";
      path.textContent = diagnostic.path;
      const detail = document.createElement("div");
      detail.textContent = diagnostic.text;
      const digits = document.createElement("div");
      digits.className = "small";
      digits.textContent = "Separate digit elements: " + (diagnostic.digitLeaves.join(" ") || "none");
      item.append(path, detail, digits);
      resultsEl.append(item);
    }
  } catch (error) {
    statusEl.textContent = error.message + " If you just installed the extension, reload the Studio tab.";
  }
});