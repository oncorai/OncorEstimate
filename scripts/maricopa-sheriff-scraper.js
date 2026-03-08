const { chromium } = require('playwright');
const fs = require('fs');

// Configuration
const BEGIN_DATE = '2024-01-01';
const END_DATE = '2026-03-08';
const OUTPUT_FILE = '/home/ubuntu/clawd/data/maricopa-foreclosures.json';

async function scrapeForeclosures() {
  console.log('=== Maricopa County Sheriff Foreclosure Scraper ===\n');
  console.log(`Date range: ${BEGIN_DATE} to ${END_DATE}`);
  
  const browser = await chromium.launch({ 
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'
  });
  
  const page = await context.newPage();
  
  try {
    // Search by grantor name "SHERIFF OF MARICOPA COUNTY"
    const searchUrl = `https://recorder.maricopa.gov/recording/document-search-results.html?lastNames=SHERIFF+OF+MARICOPA+COUNTY&documentTypeSelector=all&beginDate=${BEGIN_DATE}&endDate=${END_DATE}`;
    
    console.log('Searching...');
    await page.goto(searchUrl, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(5000);
    
    // Check total results
    const bodyText = await page.textContent('body');
    const totalMatch = bodyText.match(/of (\d+) results/);
    const totalResults = totalMatch ? parseInt(totalMatch[1]) : 0;
    console.log(`Total results: ${totalResults}\n`);
    
    // Collect all results (paginate if needed)
    let allResults = [];
    let seenIds = new Set();
    let pageNum = 1;
    let hasMore = true;
    let noNewCount = 0;
    
    while (hasMore && pageNum <= 50) {
      console.log(`Page ${pageNum}...`);
      
      const pageResults = await page.$$eval('tbody tr', trs => {
        return trs.map(tr => {
          const cells = tr.querySelectorAll('td');
          if (cells.length >= 3) {
            const recordingNum = cells[1]?.innerText?.trim();
            const recordingDate = cells[2]?.innerText?.trim();
            const docCode = cells[3]?.innerText?.trim();
            
            // Only get numeric recording numbers
            if (recordingNum && /^\d+$/.test(recordingNum)) {
              return { 
                grantor: cells[0]?.innerText?.trim(),
                recordingNum, 
                recordingDate, 
                docCode 
              };
            }
          }
          return null;
        }).filter(Boolean);
      });
      
      let newCount = 0;
      for (const r of pageResults) {
        if (!seenIds.has(r.recordingNum)) {
          seenIds.add(r.recordingNum);
          allResults.push(r);
          newCount++;
        }
      }
      
      console.log(`  Found ${newCount} new, total: ${allResults.length}`);
      
      if (newCount === 0) {
        noNewCount++;
        if (noNewCount >= 2) hasMore = false;
      } else {
        noNewCount = 0;
      }
      
      // Check for next page
      if (hasMore && allResults.length < totalResults) {
        const nextLink = await page.$('a:has-text("Next")');
        if (nextLink) {
          const isVisible = await nextLink.isVisible();
          if (isVisible) {
            await nextLink.click();
            await page.waitForTimeout(3000);
            await page.waitForLoadState('networkidle');
            pageNum++;
          } else {
            hasMore = false;
          }
        } else {
          hasMore = false;
        }
      } else {
        hasMore = false;
      }
    }
    
    console.log(`\n=== Results ===`);
    console.log(`Total Sheriff of Maricopa County documents: ${allResults.length}\n`);
    
    // Filter for foreclosure-related document types
    const foreclosureTypes = ['DEED', 'CERTIFICA'];
    const foreclosures = allResults.filter(r => 
      foreclosureTypes.some(t => r.docCode && r.docCode.includes(t))
    );
    
    console.log(`Foreclosure documents (DEED + CERTIFICA): ${foreclosures.length}`);
    console.log('\nBreakdown by type:');
    
    const byCodes = {};
    allResults.forEach(r => {
      const code = r.docCode || 'UNKNOWN';
      byCodes[code] = (byCodes[code] || 0) + 1;
    });
    Object.entries(byCodes).sort((a,b) => b[1] - a[1]).forEach(([code, count]) => {
      console.log(`  ${code}: ${count}`);
    });
    
    // Save results
    const output = {
      scrapedAt: new Date().toISOString(),
      dateRange: { begin: BEGIN_DATE, end: END_DATE },
      totalSheriffDocs: allResults.length,
      foreclosures: foreclosures,
      allDocuments: allResults
    };
    
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));
    console.log(`\nSaved to: ${OUTPUT_FILE}`);
    
    // Print foreclosure list
    if (foreclosures.length > 0) {
      console.log('\n=== Foreclosure Documents ===');
      foreclosures.forEach((r, i) => {
        console.log(`${i+1}. ${r.recordingNum} | ${r.recordingDate} | ${r.docCode}`);
      });
    }
    
    return foreclosures;
    
  } catch (error) {
    console.error('Error:', error.message);
    await page.screenshot({ path: '/home/ubuntu/clawd/data/error-sheriff.png', fullPage: true });
  } finally {
    await browser.close();
  }
}

scrapeForeclosures();
