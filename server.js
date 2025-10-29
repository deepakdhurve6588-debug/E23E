import express from "express";
import fs from "fs";
import puppeteer from "puppeteer-core";
import chromium from "@sparticuz/chromium";

const PORT = process.env.PORT || 3000;
const app = express();

// Ping route for Render
app.get("/", (req, res) => res.send("✅ FB E2EE Bot running..."));

// Read configs
const cookies = JSON.parse(fs.readFileSync("./cookie.json", "utf-8"));
const threadIds = fs.readFileSync("./tid.txt", "utf-8").split("\n").filter(Boolean);
const messages = fs.readFileSync("./msg.txt", "utf-8").split("\n").filter(Boolean);
const delay = parseInt(fs.readFileSync("./delay.txt", "utf-8").trim()) || 10_000;

async function startBrowser() {
  const browser = await puppeteer.launch({
    args: chromium.args,
    defaultViewport: chromium.defaultViewport,
    executablePath: await chromium.executablePath(),
    headless: chromium.headless
  });
  return browser;
}

async function startBot() {
  let browser = await startBrowser();
  let page = await browser.newPage();

  await page.setCookie(...cookies);
  console.log("🍪 Cookies loaded, opening Messenger...");

  for (;;) {
    for (const tid of threadIds) {
      try {
        console.log(`💬 Opening thread ${tid}`);
        await page.goto(`https://www.facebook.com/messages/t/${tid}`, { waitUntil: "networkidle2", timeout: 60000 });
        await page.waitForSelector('[aria-label="Message"]', { timeout: 60000 });
        const input = await page.$('[aria-label="Message"]');

        for (const msg of messages) {
          await input.type(msg);
          await input.press("Enter");
          console.log(`✅ Sent: ${msg}`);
          await page.waitForTimeout(delay);
        }
      } catch (err) {
        console.warn(`⚠️ Navigation error: ${err.message}`);
        try {
          page = await browser.newPage();
        } catch {
          console.log("🧩 Restarting browser...");
          await browser.close().catch(() => {});
          browser = await startBrowser();
          page = await browser.newPage();
          await page.setCookie(...cookies);
        }
      }
    }
  }
}

startBot();
app.listen(PORT, () => console.log(`🌐 Server running on ${PORT}`));
