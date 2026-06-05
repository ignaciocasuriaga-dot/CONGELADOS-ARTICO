import { chromium } from 'playwright-extra';
import stealth from 'puppeteer-extra-plugin-stealth';

chromium.use(stealth());

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

export async function launchBrowser({ headless = true } = {}) {
  const browser = await chromium.launch({
    headless,
    args: [
      '--disable-blink-features=AutomationControlled',
      '--disable-features=IsolateOrigins,site-per-process',
      '--no-sandbox',
    ],
  });

  const context = await browser.newContext({
    userAgent: UA,
    locale: 'es-UY',
    timezoneId: 'America/Montevideo',
    viewport: { width: 1366, height: 768 },
    extraHTTPHeaders: {
      'Accept-Language': 'es-UY,es;q=0.9,en;q=0.8',
      'sec-ch-ua': '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
      'sec-ch-ua-platform': '"Windows"',
      'sec-ch-ua-mobile': '?0',
    },
  });

  return { browser, context };
}

export function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

export function randomDelay(min = 1500, max = 4000) {
  const ms = Math.floor(Math.random() * (max - min) + min);
  return sleep(ms);
}
