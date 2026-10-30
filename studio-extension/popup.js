const statusEl = document.getElementById("status");
const resultsEl = document.getElementById("results");
document.getElementById("scan").addEventListener("click", async () => {
  resultsEl.replaceChildren();
  statusEl.textContent = "Scanning the active tab…";
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.url?.startsWith("https://studio.youtube.com/")) {
      statusEl.textContent = "Open YouTube Studio in this tab first.";
      return;
    }
    const result = await chrome.tabs.sendMessage(tab.id, { type: "READ_STUDIO_COUNT" });
    if (!result) throw new Error("No response from the Studio page. Reload the Studio tab and try again.");
    const candidates = result.candidates || [];
    statusEl.textContent = candidates.length
      ? "Found possible subscriber-count text. Check which result matches the full Studio count."
      : "No subscriber-related number found yet. Make sure the See Live Count view is fully loaded.";
    for (const candidate of candidates) {
      const item = document.createElement("div");
      item.className = "item";
      const source = document.createElement("div");
      source.className = "small";
      source.textContent = candidate.source;
      const text = document.createElement("div");
      text.textContent = candidate.text;
      const nums = document.createElement("div");
      nums.className = "num";
      nums.textContent = candidate.numbers.join(" · ");
      item.append(source, text, nums);
      resultsEl.append(item);
    }
  } catch (error) {
    statusEl.textContent = error.message + " If you just installed the extension, reload the Studio tab.";
  }
});