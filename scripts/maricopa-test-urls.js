const { chromium } = require('playwright');

async function testUrls() {
  const browser = await chromium.launch({ 
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'
  });
  
  const page = await context.newPage();
  
  // Test URLs with different document title parameters
  const testUrls = [
    // Try searching by document title
    'https://recorder.maricopa.gov/recording/document-search-results.html?documentTypeSelector=title&documentTitle=certificate+of+sale&beginDate=2025-11-01&endDate=2026-03-08',
    'https://recorder.maricopa.gov/recording/document-search-results.html?documentTypeSelector=title&documentTitle=sheriff&beginDate=2025-11-01&endDate=2026-03-08',
    // Try with the actual site's URL pattern
    'https://recorder.maricopa.gov/recording/document-search-results.html?lastNames=&firstNames=&middleNameIs=&documentTypeSelector=title&documentTitle=certificate+of+sale+of+property&beginDate=2025-11-01&endDate=2026-03-08'
  ];
  
  for (const url of testUrls) {
    console.log(`\nTesting: ${url.substring(0, 100)}...`);
    try {
      await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
      await page.waitForTimeout(3000);
      
      const bodyText = await page.textContent('body');
      const totalMatch = bodyText.match(/of (\d+) results/);
      if (totalMatch) {
        console.log(`  ✓ Found ${totalMatch[1]} results!`);
      } else if (bodyText.includes('No results')) {
        console.log('  No results');
      } else {
        console.log('  Content preview:', bodyText.substring(0, 300));
      }
    } catch (err) {
      console.log(`  Error: ${err.message}`);
    }
  }
  
  await browser.close();
}

testUrls();
