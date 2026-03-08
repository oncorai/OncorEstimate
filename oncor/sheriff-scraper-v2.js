const { chromium } = require('playwright-extra');
const stealth = require('puppeteer-extra-plugin-stealth')();
const fs = require('fs');

chromium.use(stealth);

const CONFIG = {
  outputDir: '/home/ubuntu/clawd/oncor/scraped',
  searches: [
    { name: 'SHERIFFS DEED', searchTerm: 'sheriffs deed' },
    { name: 'Certificate of Sale', searchTerm: 'certificate of sale of property' }
  ],
  dateRange: { start: '11/01/2025', end: '03/08/2026' }
};

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function searchAndCollect(page, searchTerm) {
  console.log(`\n========== Searching: ${searchTerm} ==========`);
  
  // Go to search page
  await page.goto('https://recorder.maricopa.gov/recording/document-search.html', { 
    waitUntil: 'networkidle', timeout: 60000 
  });
  await sleep(3000);
  
  // Select "Document Title" radio
  await page.click('input[value="title"], label:has-text("Document Title")').catch(() => {});
  await sleep(500);
  
  // Type in document code/title field
  const searchInput = await page.$('input[id*="document"], input[placeholder*="search"]');
  if (searchInput) {
    await searchInput.fill(searchTerm);
  }
  await sleep(500);
  
  // Set date range
  const beginDate = await page.$('input[id*="begin"], input[name*="begin"]');
  const endDate = await page.$('input[id*="end"], input[name*="end"]');
  
  if (beginDate) {
    await beginDate.fill('');
    await beginDate.type(CONFIG.dateRange.start);
  }
  if (endDate) {
    await endDate.fill('');
    await endDate.type(CONFIG.dateRange.end);
  }
  await sleep(500);
  
  // Screenshot before search
  await page.screenshot({ path: `${CONFIG.outputDir}/search-form-${searchTerm.replace(/\s/g, '-')}.png` });
  
  // Click search button
  await page.click('button:has-text("Search"), input[type="submit"]');
  await sleep(5000);
  
  // Wait for results
  await page.waitForSelector('table', { timeout: 30000 }).catch(() => {});
  
  // Screenshot results
  await page.screenshot({ path: `${CONFIG.outputDir}/search-results-${searchTerm.replace(/\s/g, '-')}.png`, fullPage: true });
  
  // Get all recording numbers from all pages
  const allRecordings = [];
  let pageNum = 1;
  
  while (pageNum <= 30) {
    const nums = await page.evaluate(() => {
      const results = [];
      document.querySelectorAll('[data-recordingnumber]').forEach(el => {
        results.push(el.getAttribute('data-recordingnumber'));
      });
      return results;
    });
    
    console.log(`Page ${pageNum}: Found ${nums.length} records`);
    
    if (nums.length === 0) break;
    allRecordings.push(...nums);
    
    // Try to go to next page
    const nextBtn = await page.$('.pagination .next:not(.disabled), button:has-text(">")')
      .catch(() => null);
    
    if (!nextBtn) {
      // Try clicking page number
      const nextPage = await page.$(`a:has-text("${pageNum + 1}")`);
      if (nextPage) {
        await nextPage.click();
        await sleep(3000);
        pageNum++;
      } else {
        break;
      }
    } else {
      await nextBtn.click();
      await sleep(3000);
      pageNum++;
    }
  }
  
  console.log(`Total for "${searchTerm}": ${allRecordings.length}`);
  return [...new Set(allRecordings)];
}

async function checkDocument(page, recordingNumber) {
  const url = `https://recorder.maricopa.gov/recording/document-preview.html?recordingNumber=${recordingNumber}&suffix=&pages=1`;
  
  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
    await sleep(3000);
    
    await page.evaluate(() => window.scrollTo(0, 500));
    await sleep(2000);
    
    const pageText = await page.evaluate(() => document.body.innerText.toLowerCase());
    
    // Check for sheriff-related content
    const hasSheriff = pageText.includes('sheriff');
    const hasForeclosure = pageText.includes('foreclosure');
    
    if (hasSheriff) {
      console.log(`  ✓ SHERIFF: ${recordingNumber}`);
      await page.screenshot({ 
        path: `${CONFIG.outputDir}/sheriff-${recordingNumber}.png`, 
        fullPage: true 
      });
      return { recordingNumber, match: true, hasForeclosure, text: pageText.substring(0, 5000) };
    }
    return { recordingNumber, match: false };
  } catch (err) {
    console.log(`  ✗ Error: ${recordingNumber}`);
    return { recordingNumber, match: false, error: err.message };
  }
}

async function main() {
  fs.mkdirSync(CONFIG.outputDir, { recursive: true });
  
  const browser = await chromium.launch({
    headless: true,
    args: ['--disable-blink-features=AutomationControlled', '--no-sandbox']
  });
  
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    viewport: { width: 1920, height: 1080 }
  });
  
  const page = await context.newPage();
  const allMatches = [];
  
  for (const search of CONFIG.searches) {
    const recordings = await searchAndCollect(page, search.searchTerm);
    
    console.log(`\nChecking ${recordings.length} documents for ${search.name}...`);
    let checked = 0;
    
    for (const num of recordings) {
      checked++;
      if (checked % 20 === 0) {
        console.log(`Progress: ${checked}/${recordings.length}`);
        fs.writeFileSync(`${CONFIG.outputDir}/matches.json`, JSON.stringify(allMatches, null, 2));
      }
      
      const result = await checkDocument(page, num);
      if (result.match) {
        result.searchType = search.name;
        allMatches.push(result);
      }
      
      await sleep(1500);
    }
  }
  
  fs.writeFileSync(`${CONFIG.outputDir}/matches.json`, JSON.stringify(allMatches, null, 2));
  
  console.log(`\n========== COMPLETE ==========`);
  console.log(`Total matches: ${allMatches.length}`);
  
  await browser.close();
}

main().catch(console.error);
