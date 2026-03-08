const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
  console.log('Launching...');
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
  });
  const page = await context.newPage();
  page.setDefaultTimeout(60000);
  
  const allRecords = [];
  
  console.log('Loading results page...');
  await page.goto('https://recorder.maricopa.gov/recording/document-search-results.html?lastNames=&firstNames=&middleNameIs=&documentTypeSelector=code&documentCode=DE&beginDate=2026-01-01&endDate=2026-03-07', { 
    waitUntil: 'networkidle',
    timeout: 90000 
  });
  
  await page.waitForTimeout(8000);
  
  // Get total pages from pagination
  const totalPages = await page.evaluate(() => {
    const pageLinks = document.querySelectorAll('.pagination a, .page-link, nav a');
    let max = 1;
    pageLinks.forEach(a => {
      const num = parseInt(a.textContent);
      if (!isNaN(num) && num > max) max = num;
    });
    return max;
  });
  console.log('Total pages:', totalPages);
  
  // Function to extract records from current page
  async function extractRecords() {
    return await page.evaluate(() => {
      const records = [];
      const rows = document.querySelectorAll('table tbody tr, .result-row');
      rows.forEach(row => {
        const cells = row.querySelectorAll('td');
        if (cells.length >= 3) {
          records.push({
            recordingNumber: cells[0]?.textContent?.trim() || '',
            recordingDate: cells[1]?.textContent?.trim() || '',
            documentCode: cells[2]?.textContent?.trim() || '',
            docketBook: cells[3]?.textContent?.trim() || '',
            pageMap: cells[4]?.textContent?.trim() || ''
          });
        }
      });
      return records;
    });
  }
  
  // Extract from first page
  let records = await extractRecords();
  console.log('Page 1:', records.length, 'records');
  allRecords.push(...records);
  
  // Go through remaining pages
  for (let pageNum = 2; pageNum <= Math.min(totalPages, 20); pageNum++) {
    console.log('Loading page', pageNum, '...');
    
    // Click the page number
    const pageLink = page.locator(`a:text-is("${pageNum}")`).first();
    if (await pageLink.count() > 0) {
      await pageLink.click();
      await page.waitForTimeout(5000);
      
      records = await extractRecords();
      console.log('Page', pageNum, ':', records.length, 'records');
      allRecords.push(...records);
    } else {
      console.log('Could not find page link for page', pageNum);
      break;
    }
  }
  
  console.log('\nTotal records collected:', allRecords.length);
  
  // Save to JSON
  fs.writeFileSync('deeds-2026.json', JSON.stringify(allRecords, null, 2));
  console.log('Saved to deeds-2026.json');
  
  // Save to CSV
  const csv = ['Recording Number,Recording Date,Document Code,Docket/Book,Page/Map'];
  allRecords.forEach(r => {
    csv.push(`${r.recordingNumber},${r.recordingDate},${r.documentCode},${r.docketBook},${r.pageMap}`);
  });
  fs.writeFileSync('deeds-2026.csv', csv.join('\n'));
  console.log('Saved to deeds-2026.csv');
  
  await browser.close();
  console.log('Done!');
})().catch(e => console.error('Error:', e.message));
