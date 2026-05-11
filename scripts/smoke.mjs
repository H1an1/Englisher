import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";

const baseUrl = process.env.SMOKE_URL ?? "http://127.0.0.1:3000";
const consoleErrors = [];

await mkdir("artifacts", { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });

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
  await page.getByText("https://x.com/example/status/123").waitFor();

  await page
    .getByPlaceholder("Type what you hear")
    .fill("When you shadow a speaker you borrow their rhythm before you borrow their words");
  await page.getByRole("button", { name: "Check dictation" }).click();
  await page.getByText("Dictation diff").waitFor();

  await page.getByRole("tab", { name: "Shadowing" }).click();
  await page
    .getByPlaceholder("Type your spoken version")
    .fill("When you follow a speaker you borrow the rhythm before words");
  await page.getByRole("button", { name: "Compare shadowing" }).click();
  await page.getByText("Shadowing diff").waitFor();

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
