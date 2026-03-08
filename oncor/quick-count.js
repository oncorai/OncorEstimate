const { chromium } = require('playwright-extra');
const stealth = require('puppeteer-extra-plugin-stealth')();

chromium.use(stealth);

async function main() {
  const browser = await chromium.launch({
    headless: true,
    args: ['--disable-blink-features=AutomationControlled', '--no-sandbox']
  });
  
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    viewport: { width: 1920, height: 1080 }
  });
  
  const page = await context.newPage();
  
  // Check Certificates of Sale
  console.log('=== Certificates of Sale (CE) ===');
  await page.goto('https://recorder.maricopa.gov/recording/document-search-results.html?documentTypeSelector=code&documentCode=CE&beginDate=2025-11-01&endDate=2026-03-08', 
    { waitUntil: 'networkidle', timeout: 60000 });
  
  let info = await page.evaluate(() => document.body.innerText.match(/Showing \d+ - \d+ of (\d+)/)?.[0] || 'Not found');
  console.log(info);
  
  let count = await page.evaluate(() => document.querySelectorAll('[data-recordingnumber]').length);
  console.log(`First page has ${count} records`);
  
  // Check Deeds
  console.log('\n=== Deeds (DE) ===');
  await page.goto('https://recorder.maricopa.gov/recording/document-search-results.html?documentTypeSelector=code&documentCode=DE&beginDate=2025-11-01&endDate=2026-03-08', 
    { waitUntil: 'networkidle', timeout: 60000 });
  
  info = await page.evaluate(() => document.body.innerText.match(/Showing \d+ - \d+ of (\d+)/)?.[0] || 'Not found');
  console.log(info);
  
  count = await page.evaluate(() => document.querySelectorAll('[data-recordingnumber]').length);
  console.log(`First page has ${count} records`);
  
  await browser.close();
  console.log('\nDone!');
}

main().catch(console.error);
