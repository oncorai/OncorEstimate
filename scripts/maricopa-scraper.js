const { chromium } = require('playwright');
const fs = require('fs');

async function scrapeMaricopa(url, outputFile = 'maricopa-results.json') {
  const browser = await chromium.launch({ 
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'
  });
  
  const page = await context.newPage();
  let allResults = [];
  let seenIds = new Set();
  
  try {
    console.log('Navigating to:', url);
    await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(3000);
    
    // Check for Cloudflare
    const content = await page.content();
    if (content.includes('Just a moment')) {
      console.log('Waiting for Cloudflare...');
      await page.waitForTimeout(10000);
    }
    
    // Get total count
    const totalText = await page.textContent('body');
    const totalMatch = totalText.match(/of (\d+) results/);
    const totalExpected = totalMatch ? parseInt(totalMatch[1]) : 'unknown';
    console.log(`Total expected results: ${totalExpected}`);
    
    let pageNum = 1;
    let hasMore = true;
    
    while (hasMore) {
      console.log(`Page ${pageNum}...`);
      
      // Get all data from current page
      const pageResults = await page.evaluate(() => {
        const rows = [];
        const table = document.querySelector('table');
        if (!table) return rows;
        
        // Get headers
        const headers = [];
        table.querySelectorAll('thead th, tr:first-child th').forEach(th => {
          headers.push(th.innerText.trim());
        });
        
        // Get data rows
        const dataRows = table.querySelectorAll('tbody tr');
        dataRows.forEach(tr => {
          const cells = tr.querySelectorAll('td');
          if (cells.length > 0) {
            const row = {};
            cells.forEach((cell, i) => {
              const key = headers[i] || `col${i}`;
              row[key] = cell.innerText.trim();
              
              // Get actual link href
              const link = cell.querySelector('a');
              if (link && link.href && !link.href.endsWith('#')) {
                row[key + '_url'] = link.href;
              }
            });
            rows.push(row);
          }
        });
        return rows;
      });
      
      // Dedupe by recording number
      let newCount = 0;
      for (const r of pageResults) {
        const id = r['RECORDING NUMBER'] || r['col0'];
        if (id && !seenIds.has(id)) {
          seenIds.add(id);
          allResults.push(r);
          newCount++;
        }
      }
      
      console.log(`  Found ${pageResults.length}, new: ${newCount}, total: ${allResults.length}`);
      
      // Stop if we hit expected total
      if (totalExpected !== 'unknown' && allResults.length >= totalExpected) {
        console.log('Reached expected total');
        hasMore = false;
        break;
      }
      
      // Look for Next link/button
      const nextLink = await page.$('a:has-text("Next »"), a:has-text("Next"), a:has-text("›"), .next a, [rel="next"]');
      if (nextLink) {
        const isVisible = await nextLink.isVisible();
        if (isVisible) {
          await nextLink.click();
          await page.waitForTimeout(2000);
          await page.waitForLoadState('networkidle');
          pageNum++;
        } else {
          hasMore = false;
        }
      } else {
        hasMore = false;
      }
      
      // Safety limit
      if (pageNum > 100) {
        console.log('Hit page limit');
        hasMore = false;
      }
    }
    
    console.log(`\nTotal unique records: ${allResults.length}`);
    
    // Save to file
    fs.writeFileSync(outputFile, JSON.stringify(allResults, null, 2));
    console.log(`Saved to ${outputFile}`);
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await browser.close();
  }
  
  return allResults;
}

const url = process.argv[2] || 'https://recorder.maricopa.gov/recording/document-search-results.html?lastNames=&firstNames=&middleNameIs=&documentTypeSelector=code&documentCode=CE&beginDate=2025-11-01&endDate=2026-03-08';
const output = process.argv[3] || '/home/ubuntu/clawd/data/maricopa-ce-results.json';

scrapeMaricopa(url, output);
