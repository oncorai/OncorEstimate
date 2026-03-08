const { chromium } = require('playwright');
const fs = require('fs');

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

async function scrapeForeclosures() {
  const browser = await chromium.launch({ 
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'
  });
  
  const page = await context.newPage();
  let allResults = [];
  
  try {
    for (const search of SEARCHES) {
      console.log(`\n=== Searching: ${search.urlTitle} ===`);
      
      // Build search URL
      const searchUrl = `https://recorder.maricopa.gov/recording/document-search-results.html?lastNames=&firstNames=&middleNameIs=&documentTypeSelector=title&documentTitle=${encodeURIComponent(search.urlTitle)}&beginDate=${BEGIN_DATE}&endDate=${END_DATE}`;
      
      await page.goto(searchUrl, { waitUntil: 'networkidle', timeout: 60000 });
      await page.waitForTimeout(3000);
      
      // Handle Cloudflare if needed
      let content = await page.content();
      if (content.includes('Just a moment')) {
        console.log('Waiting for Cloudflare...');
        await page.waitForTimeout(10000);
      }
      
      // Get total results
      const bodyText = await page.textContent('body');
      const totalMatch = bodyText.match(/of (\d+) results/);
      const totalExpected = totalMatch ? parseInt(totalMatch[1]) : 0;
      console.log(`Found ${totalExpected} results`);
      
      if (totalExpected === 0) continue;
      
      // Scrape all document numbers
      let seenIds = new Set();
      let pageNum = 1;
      let hasMore = true;
      let searchResults = [];
      let noNewCount = 0;
      
      while (hasMore) {
        console.log(`  Page ${pageNum}...`);
        
        const pageResults = await page.evaluate(() => {
          const rows = [];
          const table = document.querySelector('table');
          if (!table) return rows;
          
          table.querySelectorAll('tbody tr').forEach(tr => {
            const cells = tr.querySelectorAll('td');
            if (cells.length >= 3) {
              const recordingNum = cells[0]?.innerText?.trim();
              const recordingDate = cells[1]?.innerText?.trim();
              const docCode = cells[2]?.innerText?.trim();
              if (recordingNum && /^\d+$/.test(recordingNum)) {
                rows.push({ recordingNum, recordingDate, docCode });
              }
            }
          });
          return rows;
        });
        
        const prevCount = searchResults.length;
        for (const r of pageResults) {
          if (!seenIds.has(r.recordingNum)) {
            seenIds.add(r.recordingNum);
            searchResults.push(r);
          }
        }
        const newThisPage = searchResults.length - prevCount;
        console.log(`    Total: ${searchResults.length} (+${newThisPage})`);
        
        if (newThisPage === 0) {
          noNewCount++;
          if (noNewCount >= 3) {
            console.log('  No new results, stopping pagination');
            hasMore = false;
          }
        } else {
          noNewCount = 0;
        }
        
        if (searchResults.length >= totalExpected) {
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
        
        if (pageNum > 100) hasMore = false;
      }
      
      console.log(`\nGot ${searchResults.length} document numbers`);
      console.log(`Checking each for: "${search.keepTitle}"\n`);
      
      // Check each document using preview URL
      let matchCount = 0;
      for (let i = 0; i < searchResults.length; i++) {
        const result = searchResults[i];
        process.stdout.write(`[${i+1}/${searchResults.length}] ${result.recordingNum}... `);
        
        try {
          // Use the preview URL format
          const previewUrl = `https://recorder.maricopa.gov/recording/document-preview.html?recordingNumber=${result.recordingNum}&suffix=&pages=10`;
          
          await page.goto(previewUrl, { waitUntil: 'networkidle', timeout: 45000 });
          await page.waitForTimeout(2000);
          
          // Handle Cloudflare
          const pageContent = await page.content();
          if (pageContent.includes('Just a moment')) {
            await page.waitForTimeout(8000);
          }
          
          // Get visible text
          const docText = await page.textContent('body');
          const docLower = docText.toLowerCase();
          
          if (docLower.includes(search.keepTitle.toLowerCase())) {
            console.log('✓ MATCH');
            allResults.push({
              ...result,
              searchType: search.name,
              matchedTitle: search.keepTitle,
              previewUrl: previewUrl
            });
            matchCount++;
          } else {
            // Try to identify what kind of document it is
            if (docLower.includes('sheriff')) {
              console.log('skip (sheriff but wrong type)');
            } else {
              console.log('skip');
            }
          }
        } catch (err) {
          console.log(`error: ${err.message.substring(0, 50)}`);
        }
        
        await page.waitForTimeout(500);
      }
      
      console.log(`\n=> Matches for "${search.urlTitle}": ${matchCount}`);
    }
    
    console.log(`\n${'='.repeat(50)}`);
    console.log(`TOTAL FORECLOSURE DOCUMENTS: ${allResults.length}`);
    console.log(`${'='.repeat(50)}\n`);
    
    // Save
    const outputFile = '/home/ubuntu/clawd/data/maricopa-foreclosures.json';
    fs.writeFileSync(outputFile, JSON.stringify(allResults, null, 2));
    console.log(`Saved to ${outputFile}`);
    
    // Summary
    console.log('\nMatching documents:');
    allResults.forEach((r, i) => {
      console.log(`${i+1}. ${r.recordingNum} | ${r.recordingDate} | ${r.matchedTitle}`);
    });
    
  } catch (error) {
    console.error('FATAL:', error.message);
    await page.screenshot({ path: '/home/ubuntu/clawd/data/error.png', fullPage: true });
  } finally {
    await browser.close();
  }
  
  return allResults;
}

scrapeForeclosures();
