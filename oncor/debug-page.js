const { chromium } = require('playwright-extra');
const stealth = require('puppeteer-extra-plugin-stealth')();
const fs = require('fs');

chromium.use(stealth);

async function main() {
  const browser = await chromium.launch({
    headless: true,
    args: ['--disable-blink-features=AutomationControlled', '--no-sandbox']
  });
  
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    viewport: { width: 1920, height: 1080 }
  });
  
  const page = await context.newPage();
  
  const url = 'https://recorder.maricopa.gov/recording/document-search-results.html?documentTypeSelector=code&documentCode=DE&beginDate=2025-11-01&endDate=2026-03-08';
  
  console.log('Navigating to:', url);
  await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
  
  const title = await page.title();
  console.log('Title:', title);
  
  if (title.includes('Just a moment')) {
    console.log('Cloudflare - waiting 15s...');
    await new Promise(r => setTimeout(r, 15000));
  }
  
  // Save full HTML
  const html = await page.content();
  fs.writeFileSync('/tmp/page-debug.html', html);
  console.log('Saved HTML to /tmp/page-debug.html');
  
  // Screenshot
  await page.screenshot({ path: '/tmp/page-debug.png', fullPage: true });
  console.log('Saved screenshot to /tmp/page-debug.png');
  
  // Try extraction with networkidle
  const recordings = await page.evaluate(() => {
    const nums = [];
    // Try multiple approaches
    document.querySelectorAll('[data-recordingnumber]').forEach(el => {
      nums.push({ method: 'data-attr', val: el.getAttribute('data-recordingnumber') });
    });
    document.querySelectorAll('.recordingNumberLabel').forEach(el => {
      nums.push({ method: 'class', val: el.innerText });
    });
    document.querySelectorAll('table tbody tr td:first-child').forEach(td => {
      const text = td.innerText?.trim();
      if (/^\d{11}$/.test(text)) {
        nums.push({ method: 'td', val: text });
      }
    });
    return nums;
  });
  
  console.log('Recordings found:', recordings.length);
  console.log(recordings.slice(0, 10));
  
  await browser.close();
}

main().catch(console.error);
