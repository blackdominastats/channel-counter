import { chromium } from "playwright-core";

const token = process.env.BROWSERLESS_TOKEN;
const profile = process.env.BROWSERLESS_PROFILE || "youtube-studio";
const channelId = process.env.TEST_CHANNEL_ID || "";

if (!token) {
  console.error("Missing BROWSERLESS_TOKEN environment variable.");
  process.exit(1);
}
if (!/^UC[a-zA-Z0-9_-]{22}$/.test(channelId)) {
  console.error("Set TEST_CHANNEL_ID to one channel's 24-character UC... channel ID.");
  process.exit(1);
}

const endpoint = new URL("wss://production-sfo.browserless.io/chromium/playwright");
endpoint.searchParams.set("token", token);
endpoint.searchParams.set("profile", profile);

let browser;
try {
  console.log("Connecting to hosted browser...");
  browser = await chromium.connectOverCDP(endpoint.toString());
  const context = browser.contexts()[0];
  const page = await context.newPage();

  console.log("Opening YouTube Studio...");
  await page.goto(`https://studio.youtube.com/channel/${channelId}`, {
    waitUntil: "domcontentloaded",
    timeout: 60000
  });
  await page.waitForTimeout(8000);

  const currentUrl = page.url();
  const title = await page.title();
  console.log("Page title:", title);
  console.log("Current page:", currentUrl);

  if (/accounts\.google\.com|ServiceLogin/i.test(currentUrl)) {
    console.log("RESULT: SIGN_IN_REQUIRED — the saved browser profile is not signed in.");
    process.exitCode = 2;
  } else {
    const count = await page.locator("yta-smooth-counter .counter-value").allTextContents()
      .then(parts => parts.join("").replace(/[^0-9]/g, ""));
    if (count && /^\d+$/.test(count)) {
      console.log("RESULT: COUNTER_FOUND");
      console.log("Visible subscriber count:", count);
    } else {
      console.log("RESULT: STUDIO_OPENED_BUT_COUNTER_NOT_FOUND");
      console.log("The profile reached Studio, but this page did not expose the expected counter selector.");
    }
  }
} catch (error) {
  console.error("TEST_FAILED:", error?.message || error);
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
}
