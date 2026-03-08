const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const SEARCHES = [
  {
    name: 'certificate_of_sale',
    urlTitle: 'certificate of sale of property',
    keepTitle: 'sheriff\'s certificate of sale on foreclosure'
  },
  {
    name: 'sheriffs_deed', 
    urlTitle: 'sheriff\'s deed',
    keepTitle: 'sheriff\'s deed'
  }
];

const BEGIN_DATE = '2025-11-01';
const END_DATE = '2026-03-08';
const IMG_DIR = '/home/ubuntu/clawd/data/doc-images';

async function scrapeDocNumbers(page, search) {
  console.log(`\n=== Scraping: ${search.urlTitle} ===`);
  
  const searchUrl = `https://recorder.maricopa.gov/recording/document-search-results.html?lastNames=&firstNames=&middleNameIs=&documentTypeSelector=title&documentTitle=${encodeURIComponent(search.urlTitle)}&beginDate=${BEGIN_DATE}&endDate=${END_DATE}`;
  
  await page.goto(searchUrl, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(3000);
  
  const bodyText = await page.textContent('body');
  const totalMatch = bodyText.match(/of (\d+) results/);
  const totalExpected = totalMatch ? parseInt(totalMatch[1]) : 0;
  console.log(`Found ${totalExpected} results`);
  
  if (totalExpected === 0) return [];
  
  let seenIds = new Set();
  let pageNum = 1;
  let hasMore = true;
  let results = [];
  let noNewCount = 0;
  
  while (hasMore) {
    const pageResults = await page.evaluate(() => {
      const rows = [];
      document.querySelectorAll('tbody tr').forEach(tr => {
        const cells = tr.querySelectorAll('td');
        if (cells.length >= 3) {
          const recordingNum = cells[0]?.innerText?.trim();
          const recordingDate = cells[1]?.innerText?.trim();
          if (recordingNum && /^\d+$/.test(recordingNum)) {
            rows.push({ recordingNum, recordingDate });
          }
        }
      });
      return rows;
    });
    
    const prevCount = results.length;
    for (const r of pageResults) {
      if (!seenIds.has(r.recordingNum)) {
        seenIds.add(r.recordingNum);
        results.push({ ...r, searchType: search.name, keepTitle: search.keepTitle });
      }
    }
    const newCount = results.length - prevCount;
    console.log(`  Page ${pageNum}: +${newCount} (total: ${results.length})`);
    
    if (newCount === 0) {
      noNewCount++;
      if (noNewCount >= 3) hasMore = false;
    } else {
      noNewCount = 0;
    }
    
    if (results.length >= totalExpected) {
      hasMore = false;
    } else if (hasMore) {
      const nextLink = await page.$('a:has-text("Next")');
      if (nextLink && await nextLink.isVisible()) {
        await nextLink.click();
        await page.waitForTimeout(2000);
        await page.waitForLoadState('networkidle');
        pageNum++;
      } else {
        hasMore = false;
      }
    }
    
    if (pageNum > 50) hasMore = false;
  }
  
  return results;
}

async function captureDocImage(page, recordingNum) {
  const previewUrl = `https://recorder.maricopa.gov/recording/document-preview.html?recordingNumber=${recordingNum}&suffix=&pages=1`;
  
  await page.goto(previewUrl, { waitUntil: 'networkidle', timeout: 45000 });
  await page.waitForTimeout(3000);
  
  // Wait for document to render
  await page.waitForSelector('#documentSearchPreviewModule', { timeout: 10000 });
  await page.waitForTimeout(2000);
  
  // Screenshot the preview area
  const imgPath = path.join(IMG_DIR, `${recordingNum}.png`);
  const preview = await page.$('#documentSearchPreviewModule');
  if (preview) {
    await preview.screenshot({ path: imgPath });
  } else {
    await page.screenshot({ path: imgPath, clip: { x: 0, y: 200, width: 1280, height: 800 } });
  }
  
  return imgPath;
}

async function main() {
  // Create image directory
  if (!fs.existsSync(IMG_DIR)) {
    fs.mkdirSync(IMG_DIR, { recursive: true });
  }
  
  const browser = await chromium.launch({ 
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'
  });
  
  const page = await context.newPage();
  let allDocs = [];
  
  try {
    // Step 1: Scrape all document numbers
    for (const search of SEARCHES) {
      const docs = await scrapeDocNumbers(page, search);
      allDocs = allDocs.concat(docs);
    }
    
    console.log(`\nTotal documents to check: ${allDocs.length}`);
    
    // Save document list
    fs.writeFileSync('/home/ubuntu/clawd/data/maricopa-docs-to-check.json', JSON.stringify(allDocs, null, 2));
    console.log('Saved document list');
    
    // Step 2: Capture first 5 images as samples
    console.log('\nCapturing sample images...');
    const samples = allDocs.slice(0, 5);
    for (let i = 0; i < samples.length; i++) {
      const doc = samples[i];
      console.log(`  [${i+1}/5] ${doc.recordingNum}...`);
      try {
        await captureDocImage(page, doc.recordingNum);
        console.log('    ✓ captured');
      } catch (err) {
        console.log(`    ✗ ${err.message.substring(0, 50)}`);
      }
    }
    
    console.log('\n=== DONE ===');
    console.log(`Documents to check: ${allDocs.length}`);
    console.log(`Sample images saved to: ${IMG_DIR}`);
    console.log('\nNext step: Use vision to check each image for matching title');
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await browser.close();
  }
}

main();
