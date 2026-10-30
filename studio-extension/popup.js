const statusEl = document.getElementById("status");
const resultsEl = document.getElementById("results");
document.getElementById("scan").addEventListener("click", async () => {
  resultsEl.replaceChildren();
  statusEl.textContent = "Reading YouTube Studio's subscriber counter…";
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.url?.startsWith("https://studio.youtube.com/")) {
      statusEl.textContent = "Open YouTube Studio in this tab first.";
      return;
    }
    const result = await chrome.tabs.sendMessage(tab.id, { type: "READ_STUDIO_COUNT" });
    if (!result) throw new Error("No response from the Studio page. Reload the Studio tab and try again.");

    if (!result.candidate) {
      statusEl.textContent = "Count not detected. The dedicated Studio subscriber counter was not found or its digits were not readable.";
      return;
    }

    statusEl.textContent = "Counter detected. Compare this value with the number currently shown in Studio.";
    const item = document.createElement("div");
    item.className = "item";
    const source = document.createElement("div");
    source.className = "small";
    source.textContent = result.candidate.source;
    const num = document.createElement("div");
    num.className = "num";
    num.textContent = result.candidate.formattedCount;
    const detail = document.createElement("div");
    detail.className = "small";
    detail.textContent = "Raw digits: " + result.candidate.exactCount;
    item.append(source, num, detail);
    resultsEl.append(item);
  } catch (error) {
    statusEl.textContent = error.message + " If you just installed the extension, reload the Studio tab.";
  }
});