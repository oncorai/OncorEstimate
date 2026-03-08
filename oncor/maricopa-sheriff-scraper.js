const { chromium } = require('playwright-extra');
const stealth = require('puppeteer-extra-plugin-stealth')();
const fs = require('fs');

chromium.use(stealth);

const CONFIG = {
  outputDir: '/home/ubuntu/clawd/oncor/scraped',
  dateRange: { begin: '2025-11-01', end: '2026-03-08' },
  searches: [
    {
      name: 'Certificate of Sale',
      code: 'CE',
      targetText: 'sheriff',
      url: 'https://recorder.maricopa.gov/recording/document-search-results.html?lastNames=&firstNames=&middleNameIs=&documentTypeSelector=code&documentCode=CE'
    },
    {
      name: 'Sheriffs Deed',
      code: 'DE', 
      targetText: 'sheriff',
      url: 'https://recorder.maricopa.gov/recording/document-search-results.html?lastNames=&firstNames=&middleNameIs=&documentTypeSelector=code&documentCode=DE'
    }
  ]
};

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function getAllRecordingNumbers(page, search) {
  const allNums = [];
  let pageNum = 1;
  const baseUrl = `${search.url}&beginDate=${CONFIG.dateRange.begin}&endDate=${CONFIG.dateRange.end}`;
  
  console.log(`\n========== ${search.name} ==========`);
  
  while (pageNum <= 100) {
    const url = pageNum === 1 ? baseUrl : `${baseUrl}&page=${pageNum}`;
    console.log(`Page ${pageNum}...`);
    
    await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
    await sleep(3000);
    
    const nums = await page.evaluate(() => {
      const results = [];
      document.querySelectorAll('[data-recordingnumber]').forEach(el => {
        results.push(el.getAttribute('data-recordingnumber'));
      });
      return results;
    });
    
    if (nums.length === 0) break;
    
    allNums.push(...nums);
    console.log(`  Found ${nums.length} (total: ${allNums.length})`);
    
    if (nums.length < 20) break;
    pageNum++;
    await sleep(1500);
  }
  
  return [...new Set(allNums)];
}

async function checkDocument(page, recordingNumber) {
  const url = `https://recorder.maricopa.gov/recording/document-preview.html?recordingNumber=${recordingNumber}&suffix=&pages=1`;
  
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(4000);
    await page.evaluate(() => window.scrollTo(0, 500));
    await sleep(2000);
    
    const pageText = await page.evaluate(() => document.body.innerText.toLowerCase());
    
    if (pageText.includes('sheriff')) {
      console.log(`  ✓ SHERIFF: ${recordingNumber}`);
      await page.screenshot({ 
        path: `${CONFIG.outputDir}/sheriff-${recordingNumber}.png`, 
        fullPage: true 
      });
      return { recordingNumber, match: true, text: pageText.substring(0, 6000) };
    }
    return { recordingNumber, match: false };
  } catch (err) {
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
    const recordings = await getAllRecordingNumbers(page, search);
    console.log(`Total for ${search.name}: ${recordings.length}`);
    
    // Save recording numbers
    fs.writeFileSync(`${CONFIG.outputDir}/recordings-${search.code}.json`, JSON.stringify(recordings, null, 2));
    
    console.log(`\nChecking ${recordings.length} documents...`);
    let checked = 0;
    
    for (const num of recordings) {
      checked++;
      if (checked % 20 === 0) {
        console.log(`Progress: ${checked}/${recordings.length} | Matches: ${allMatches.length}`);
        fs.writeFileSync(`${CONFIG.outputDir}/sheriff-matches.json`, JSON.stringify(allMatches, null, 2));
      }
      
      const result = await checkDocument(page, num);
      if (result.match) {
        result.searchType = search.name;
        allMatches.push(result);
      }
      
      await sleep(1500);
    }
  }
  
  fs.writeFileSync(`${CONFIG.outputDir}/sheriff-matches.json`, JSON.stringify(allMatches, null, 2));
  
  console.log(`\n========== COMPLETE ==========`);
  console.log(`Total matches: ${allMatches.length}`);
  
  await browser.close();
}

main().catch(console.error);
