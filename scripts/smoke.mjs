import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";

const baseUrl = process.env.SMOKE_URL ?? "http://127.0.0.1:3000";
const consoleErrors = [];

await mkdir("artifacts", { recursive: true });

const browser = await chromium.launch({
  headless: true,
  args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"]
});
const context = await browser.newContext({
  permissions: ["microphone"],
  viewport: { width: 1440, height: 960 }
});
const page = await context.newPage();

page.on("console", (message) => {
  if (message.type() === "error") {
    consoleErrors.push(message.text());
  }
});
page.on("pageerror", (error) => consoleErrors.push(error.message));

try {
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.getByText("Englisher", { exact: true }).waitFor();

  await page.getByPlaceholder("Paste a YouTube or video link").fill("https://x.com/example/status/123");
  await page.getByRole("button", { name: "Create session" }).click();
  await page.getByText("https://www.youtube.com/watch?v=UF8uR6Z6KLc").waitFor();

  await page
    .getByPlaceholder("Type what you hear")
    .fill("I am honored to be with you today at your commencement from one of the finest universities in the world");
  await page.getByRole("button", { name: "Check dictation" }).click();
  await page.getByText("Dictation diff").waitFor();

  await page.getByRole("tab", { name: "Shadowing" }).click();
  await page
    .getByLabel("Current sentence")
    .getByText("I am honored to be with you today")
    .waitFor();
  await page.getByRole("button", { name: "Record" }).click();
  await page.getByRole("button", { name: "Stop" }).click();
  await page.locator("audio.audio-preview").waitFor();
  await page.getByText("needs ASR").waitFor();

  await page.screenshot({ path: "artifacts/desktop-smoke.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "artifacts/mobile-smoke.png", fullPage: true });

  if (consoleErrors.length > 0) {
    throw new Error(consoleErrors.join("\n"));
  }

  console.log("smoke ok");
} finally {
  await browser.close();
}
