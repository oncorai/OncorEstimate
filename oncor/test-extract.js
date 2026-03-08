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
  
  const url = 'https://recorder.maricopa.gov/recording/document-search-results.html?documentTypeSelector=code&documentCode=DE&beginDate=2025-11-01&endDate=2026-03-08';
  
  console.log('Loading:', url);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await new Promise(r => setTimeout(r, 5000));
  
  // Debug: Get all table HTML
  const tableHTML = await page.evaluate(() => {
    const table = document.querySelector('table');
    return table ? table.outerHTML.substring(0, 3000) : 'NO TABLE FOUND';
  });
  console.log('\nTable HTML:\n', tableHTML);
  
  // Try different selectors
  const recordings = await page.evaluate(() => {
    const results = [];
    
    // Method 1: All links in table
    const links = document.querySelectorAll('table a');
    links.forEach(a => {
      const href = a.href;
      const text = a.innerText?.trim();
      if (text && /^\d{11}$/.test(text)) {
        results.push({ method: 'links', text, href });
      }
    });
    
    // Method 2: All cells
    const cells = document.querySelectorAll('table td');
    cells.forEach(td => {
      const text = td.innerText?.trim();
      if (text && /^\d{11}$/.test(text)) {
        results.push({ method: 'cells', text });
      }
    });
    
    return results;
  });
  
  console.log('\nRecordings found:', recordings.length);
  console.log(recordings.slice(0, 5));
  
  await browser.close();
}

main().catch(console.error);
