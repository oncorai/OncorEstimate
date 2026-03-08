const { chromium } = require('playwright');
const fs = require('fs');

const DOC_LIST = JSON.parse(fs.readFileSync('/home/ubuntu/clawd/data/maricopa-ce-results.json'));
const RESULTS_FILE = '/home/ubuntu/clawd/data/foreclosure-matches.json';

async function checkDocument(page, docNum, docDate, retries = 2) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const url = `https://recorder.maricopa.gov/recording/document-preview.html?recordingNumber=${docNum}&suffix=&pages=1`;
      
      // Navigate with shorter timeout, we'll retry if needed
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await page.waitForTimeout(6000); // Wait for document to render
      
      // Get page text
      const pageContent = await page.evaluate(() => {
        return document.body.innerText.toLowerCase();
      });
      
      // Check for sheriff foreclosure keywords
      const isSheriffForeclosure = 
        pageContent.includes('sheriff') && 
        (pageContent.includes('certificate of sale') || 
         pageContent.includes('foreclosure') ||
         pageContent.includes('sale on foreclosure'));
      
      const isSheriffDeed = pageContent.includes("sheriff's deed") || 
                            pageContent.includes("sheriffs deed");
      
      if (isSheriffForeclosure) {
        return { match: true, type: 'sheriff_certificate_of_sale' };
      } else if (isSheriffDeed) {
        return { match: true, type: 'sheriffs_deed' };
      } else {
        return { match: false, type: null };
      }
      
    } catch (err) {
      if (attempt < retries) {
        console.log(`retry ${attempt + 1}...`);
        await page.waitForTimeout(3000);
      } else {
        return { match: false, type: null, error: err.message.substring(0, 30) };
      }
    }
  }
}

async function main() {
  const browser = await chromium.launch({ 
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 1200 }
  });
  
  const page = await context.newPage();
  
  // Load existing progress
  let matches = [];
  let processed = new Set();
  
  if (fs.existsSync(RESULTS_FILE)) {
    const existing = JSON.parse(fs.readFileSync(RESULTS_FILE));
    matches = existing.matches || [];
    processed = new Set(existing.processed || []);
    console.log(`Resuming: ${processed.size} already done, ${matches.length} matches found`);
  }
  
  console.log(`Processing ${DOC_LIST.length} documents...`);
  console.log(`Looking for: Sheriff's certificate of sale on foreclosure & Sheriff's deed\n`);
  
  let successCount = 0;
  let errorCount = 0;
  
  for (let i = 0; i < DOC_LIST.length; i++) {
    const doc = DOC_LIST[i];
    const docNum = doc['RECORDING NUMBER'];
    const docDate = doc['RECORDING DATE'];
    
    // Skip if already processed
    if (processed.has(docNum)) {
      continue;
    }
    
    process.stdout.write(`[${i+1}/${DOC_LIST.length}] ${docNum} (${docDate})... `);
    
    const result = await checkDocument(page, docNum, docDate);
    
    if (result.error) {
      console.log(`error: ${result.error}`);
      errorCount++;
    } else if (result.match) {
      console.log(`✓ MATCH (${result.type})`);
      matches.push({
        recordingNumber: docNum,
        recordingDate: docDate,
        type: result.type,
        previewUrl: `https://recorder.maricopa.gov/recording/document-preview.html?recordingNumber=${docNum}&suffix=&pages=1`
      });
      successCount++;
    } else {
      console.log('skip');
      successCount++;
    }
    
    processed.add(docNum);
    
    // Save progress every 5 docs
    if (processed.size % 5 === 0) {
      fs.writeFileSync(RESULTS_FILE, JSON.stringify({ 
        matches, 
        processed: Array.from(processed), 
        total: DOC_LIST.length,
        successCount,
        errorCount
      }, null, 2));
    }
    
    // Delay between requests to avoid rate limiting
    await page.waitForTimeout(2000);
  }
  
  // Final save
  fs.writeFileSync(RESULTS_FILE, JSON.stringify({ 
    matches, 
    processed: Array.from(processed), 
    total: DOC_LIST.length,
    successCount,
    errorCount,
    complete: true
  }, null, 2));
  
  console.log(`\n${'='.repeat(50)}`);
  console.log(`COMPLETE: ${matches.length} foreclosure documents found`);
  console.log(`Processed: ${successCount} success, ${errorCount} errors`);
  console.log(`${'='.repeat(50)}\n`);
  
  matches.forEach((m, i) => {
    console.log(`${i+1}. ${m.recordingNumber} | ${m.recordingDate} | ${m.type}`);
  });
  
  console.log(`\nResults saved to: ${RESULTS_FILE}`);
  
  await browser.close();
}

main().catch(console.error);
