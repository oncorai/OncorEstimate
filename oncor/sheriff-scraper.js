const { chromium } = require('playwright-extra');
const stealth = require('puppeteer-extra-plugin-stealth')();
const fs = require('fs');

chromium.use(stealth);

const CONFIG = {
  outputDir: '/home/ubuntu/clawd/oncor/scraped',
  searches: [
    { 
      name: 'Certificate of Sale of Property',
      searchTerm: 'certificate of sale of property',
      targetTitle: 'sheriff\'s certificate of sale',
      url: 'https://recorder.maricopa.gov/recording/document-search-results.html?documentTypeSelector=description&documentDescription=certificate+of+sale+of+property&beginDate=2025-11-01&endDate=2026-03-08'
    },
    { 
      name: 'Sheriffs Deed',
      searchTerm: 'sheriffs deed', 
      targetTitle: 'sheriff\'s deed',
      url: 'https://recorder.maricopa.gov/recording/document-search-results.html?documentTypeSelector=description&documentDescription=sheriffs+deed&beginDate=2025-11-01&endDate=2026-03-08'
    }
  ]
};

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function getAllRecordingNumbers(page, search) {
  console.log(`\n========== ${search.name} ==========`);
  const allNums = [];
  let pageNum = 1;
  
  while (pageNum <= 50) { // Safety limit
    const url = pageNum === 1 ? search.url : `${search.url}&page=${pageNum}`;
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
    
    // Check if there's more pages
    const hasNext = await page.evaluate(() => {
      const btns = document.querySelectorAll('.pagination a, button');
      return Array.from(btns).some(b => b.innerText.includes('>') || b.innerText.includes('Next'));
    });
    
    if (!hasNext || nums.length < 20) break;
    pageNum++;
    await sleep(1500);
  }
  
  return [...new Set(allNums)]; // Dedupe
}

async function checkDocument(page, recordingNumber, targetTitle) {
  const url = `https://recorder.maricopa.gov/recording/document-preview.html?recordingNumber=${recordingNumber}&suffix=&pages=1`;
  
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(4000);
    
    // Scroll to load doc
    await page.evaluate(() => window.scrollTo(0, 500));
    await sleep(2000);
    
    const pageText = await page.evaluate(() => document.body.innerText.toLowerCase());
    
    if (pageText.includes(targetTitle.toLowerCase())) {
      console.log(`  ✓ MATCH: ${recordingNumber}`);
      
      // Save screenshot
      await page.screenshot({ 
        path: `${CONFIG.outputDir}/match-${recordingNumber}.png`, 
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
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    viewport: { width: 1920, height: 1080 }
  });
  
  const page = await context.newPage();
  const allMatches = [];
  
  for (const search of CONFIG.searches) {
    // Step 1: Get all recording numbers
    const recordings = await getAllRecordingNumbers(page, search);
    console.log(`Total recordings for ${search.name}: ${recordings.length}`);
    
    // Step 2: Check each document
    let checked = 0;
    for (const num of recordings) {
      checked++;
      if (checked % 10 === 0) {
        console.log(`Progress: ${checked}/${recordings.length}`);
      }
      
      const result = await checkDocument(page, num, search.targetTitle);
      if (result.match) {
        result.searchType = search.name;
        allMatches.push(result);
        
        // Save progress
        fs.writeFileSync(`${CONFIG.outputDir}/matches.json`, JSON.stringify(allMatches, null, 2));
      }
      
      await sleep(1500);
    }
  }
  
  // Final save
  fs.writeFileSync(`${CONFIG.outputDir}/matches.json`, JSON.stringify(allMatches, null, 2));
  
  console.log(`\n========== COMPLETE ==========`);
  console.log(`Total matches: ${allMatches.length}`);
  
  await browser.close();
}

main().catch(console.error);
