const { chromium } = require('playwright-extra');
const stealth = require('puppeteer-extra-plugin-stealth')();
const fs = require('fs');

chromium.use(stealth);

const CONFIG = {
  outputDir: '/home/ubuntu/clawd/oncor/scraped',
  searches: [
    { name: 'Certificate of Sale', code: 'CE', baseUrl: 'https://recorder.maricopa.gov/recording/document-search-results.html?documentTypeSelector=code&documentCode=CE&beginDate=2025-11-01&endDate=2026-03-08' },
    { name: 'Deeds', code: 'DE', baseUrl: 'https://recorder.maricopa.gov/recording/document-search-results.html?documentTypeSelector=code&documentCode=DE&beginDate=2025-11-01&endDate=2026-03-08' }
  ]
};

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function getAllRecordingNumbers(page, searchConfig) {
  console.log(`\n========== ${searchConfig.name} ==========`);
  
  const allRecordings = [];
  let currentPage = 1;
  let hasMore = true;
  
  while (hasMore && currentPage <= 100) {
    // Pagination via clicking or URL param
    let url = searchConfig.baseUrl;
    if (currentPage > 1) {
      url += `&page=${currentPage}`;
    }
    
    console.log(`Page ${currentPage}`);
    await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
    await sleep(4000);
    
    // Check Cloudflare
    const title = await page.title();
    if (title.includes('Just a moment')) {
      console.log('Cloudflare detected, waiting...');
      await sleep(12000);
    }
    
    // Extract recording numbers
    const recordings = await page.evaluate(() => {
      const nums = [];
      document.querySelectorAll('[data-recordingnumber]').forEach(el => {
        const num = el.getAttribute('data-recordingnumber');
        if (num && /^\d{11}$/.test(num)) {
          nums.push(num);
        }
      });
      return nums;
    });
    
    console.log(`  Found ${recordings.length} recordings`);
    
    if (recordings.length === 0) {
      hasMore = false;
    } else {
      allRecordings.push(...recordings);
      
      // Check pagination - look for page numbers
      const maxPage = await page.evaluate(() => {
        const pageLinks = document.querySelectorAll('.pagination a, .page-link');
        let max = 1;
        pageLinks.forEach(a => {
          const num = parseInt(a.innerText);
          if (!isNaN(num) && num > max) max = num;
        });
        return max;
      });
      
      if (currentPage >= maxPage) {
        hasMore = false;
      } else {
        currentPage++;
        await sleep(2000);
      }
    }
  }
  
  console.log(`Total recordings for ${searchConfig.name}: ${allRecordings.length}`);
  return allRecordings;
}

async function checkIfSheriffDocument(page, recordingNumber) {
  const url = `https://recorder.maricopa.gov/recording/document-preview.html?recordingNumber=${recordingNumber}&suffix=&pages=1`;
  
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(4000);
    
    const title = await page.title();
    if (title.includes('Just a moment')) {
      await sleep(10000);
    }
    
    await page.evaluate(() => window.scrollTo(0, 500));
    await sleep(2000);
    
    const pageText = await page.evaluate(() => document.body.innerText);
    const isSheriff = pageText.toLowerCase().includes('sheriff');
    
    if (isSheriff) {
      console.log(`  ✓ SHERIFF: ${recordingNumber}`);
      await page.screenshot({ 
        path: `${CONFIG.outputDir}/sheriff-${recordingNumber}.png`, 
        fullPage: true 
      });
      return { recordingNumber, isSheriff: true, text: pageText.substring(0, 8000) };
    }
    return { recordingNumber, isSheriff: false };
  } catch (err) {
    console.log(`  ✗ Error: ${recordingNumber}`);
    return { recordingNumber, isSheriff: false, error: err.message };
  }
}

async function main() {
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
  
  // Step 1: Get all recording numbers
  const allRecordings = {};
  for (const search of CONFIG.searches) {
    allRecordings[search.code] = await getAllRecordingNumbers(page, search);
    await sleep(3000);
  }
  
  fs.writeFileSync(`${CONFIG.outputDir}/all-recordings.json`, JSON.stringify(allRecordings, null, 2));
  
  const allNums = [...new Set([...allRecordings.CE || [], ...allRecordings.DE || []])];
  console.log(`\nTotal unique recordings to check: ${allNums.length}`);
  
  // Step 2: Check each for Sheriff
  const sheriffDocs = [];
  let checked = 0;
  
  for (const num of allNums) {
    checked++;
    if (checked % 20 === 0) {
      console.log(`Progress: ${checked}/${allNums.length} | Sheriff found: ${sheriffDocs.length}`);
      // Save progress
      fs.writeFileSync(`${CONFIG.outputDir}/sheriff-docs.json`, JSON.stringify(sheriffDocs, null, 2));
    }
    
    const result = await checkIfSheriffDocument(page, num);
    if (result.isSheriff) {
      sheriffDocs.push(result);
    }
    
    await sleep(1500);
  }
  
  fs.writeFileSync(`${CONFIG.outputDir}/sheriff-docs.json`, JSON.stringify(sheriffDocs, null, 2));
  
  console.log(`\n========== COMPLETE ==========`);
  console.log(`Total checked: ${allNums.length}`);
  console.log(`Sheriff documents found: ${sheriffDocs.length}`);
  
  await browser.close();
}

main().catch(console.error);
