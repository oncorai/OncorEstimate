const { chromium } = require('playwright-extra');
const stealth = require('puppeteer-extra-plugin-stealth')();
const fs = require('fs');

chromium.use(stealth);

const CONFIG = {
  baseUrl: 'https://recorder.maricopa.gov',
  searches: [
    {
      name: 'Sheriff Certificate of Sale',
      code: 'CE',
      url: 'https://recorder.maricopa.gov/recording/document-search-results.html?lastNames=&firstNames=&middleNameIs=&documentTypeSelector=code&documentCode=CE&beginDate=2025-11-01&endDate=2026-03-08'
    },
    {
      name: 'Sheriff Deed', 
      code: 'DE',
      url: 'https://recorder.maricopa.gov/recording/document-search-results.html?lastNames=&firstNames=&middleNameIs=&documentTypeSelector=code&documentCode=DE&beginDate=2025-11-01&endDate=2026-03-08'
    }
  ],
  outputDir: '/home/ubuntu/clawd/oncor/scraped'
};

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function scrapeSearchResults(page, searchConfig) {
  console.log(`\n========== Scraping: ${searchConfig.name} ==========`);
  console.log(`URL: ${searchConfig.url}`);
  
  await page.goto(searchConfig.url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await sleep(5000);
  
  // Check for Cloudflare
  const title = await page.title();
  console.log(`Page title: ${title}`);
  
  if (title.includes('Just a moment') || title.includes('security')) {
    console.log('Cloudflare detected, waiting longer...');
    await sleep(15000);
  }
  
  // Take screenshot of search results
  const screenshotPath = `${CONFIG.outputDir}/search-${searchConfig.code}.png`;
  await page.screenshot({ path: screenshotPath, fullPage: true });
  console.log(`Screenshot saved: ${screenshotPath}`);
  
  // Try to extract table data
  const results = await page.evaluate(() => {
    const rows = [];
    const table = document.querySelector('table');
    if (!table) return rows;
    
    const trs = table.querySelectorAll('tbody tr');
    trs.forEach(tr => {
      const cells = tr.querySelectorAll('td');
      if (cells.length >= 4) {
        const row = {
          recordingNumber: cells[0]?.innerText?.trim(),
          documentType: cells[1]?.innerText?.trim(),
          recordDate: cells[2]?.innerText?.trim(),
          grantorGrantee: cells[3]?.innerText?.trim(),
          link: cells[0]?.querySelector('a')?.href
        };
        rows.push(row);
      }
    });
    return rows;
  });
  
  console.log(`Found ${results.length} results`);
  
  // Filter for Sheriff-related documents
  const sheriffResults = results.filter(r => 
    r.documentType?.toLowerCase().includes('sheriff') ||
    r.grantorGrantee?.toLowerCase().includes('sheriff')
  );
  
  console.log(`Sheriff-related: ${sheriffResults.length}`);
  
  return { all: results, sheriff: sheriffResults };
}

async function scrapeDocument(page, recordingNumber) {
  const url = `https://recorder.maricopa.gov/recording/document-preview.html?recordingNumber=${recordingNumber}&suffix=&pages=1`;
  console.log(`\nScraping document: ${recordingNumber}`);
  
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await sleep(5000);
  
  const title = await page.title();
  if (title.includes('Just a moment')) {
    console.log('Cloudflare detected, waiting...');
    await sleep(10000);
  }
  
  // Scroll to load document
  await page.evaluate(() => window.scrollTo(0, 500));
  await sleep(2000);
  
  // Screenshot
  const screenshotPath = `${CONFIG.outputDir}/doc-${recordingNumber}.png`;
  await page.screenshot({ path: screenshotPath, fullPage: true });
  console.log(`Screenshot: ${screenshotPath}`);
  
  return screenshotPath;
}

async function main() {
  // Create output directory
  if (!fs.existsSync(CONFIG.outputDir)) {
    fs.mkdirSync(CONFIG.outputDir, { recursive: true });
  }
  
  const browser = await chromium.launch({
    headless: true,
    args: ['--disable-blink-features=AutomationControlled', '--no-sandbox']
  });
  
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    viewport: { width: 1920, height: 1080 }
  });
  
  const page = await context.newPage();
  
  const allResults = {};
  
  // Scrape each search type
  for (const search of CONFIG.searches) {
    try {
      const results = await scrapeSearchResults(page, search);
      allResults[search.code] = results;
      await sleep(3000);
    } catch (err) {
      console.error(`Error scraping ${search.name}:`, err.message);
    }
  }
  
  // Save results summary
  const summaryPath = `${CONFIG.outputDir}/search-results.json`;
  fs.writeFileSync(summaryPath, JSON.stringify(allResults, null, 2));
  console.log(`\nResults saved to: ${summaryPath}`);
  
  // Count totals
  let totalSheriff = 0;
  for (const code in allResults) {
    totalSheriff += allResults[code].sheriff?.length || 0;
  }
  
  console.log(`\n========== SUMMARY ==========`);
  console.log(`Total Sheriff documents found: ${totalSheriff}`);
  
  await browser.close();
}

main().catch(console.error);
