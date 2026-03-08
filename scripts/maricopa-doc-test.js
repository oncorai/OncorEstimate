const { chromium } = require('playwright');

async function testDocAccess() {
  const browser = await chromium.launch({ 
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'
  });
  
  const page = await context.newPage();
  
  try {
    // First, navigate to search results and get a document link properly
    const searchUrl = 'https://recorder.maricopa.gov/recording/document-search-results.html?lastNames=&firstNames=&middleNameIs=&documentTypeSelector=title&documentTitle=certificate%20of%20sale%20of%20property&beginDate=2025-11-01&endDate=2026-03-08';
    
    console.log('Going to search results...');
    await page.goto(searchUrl, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(3000);
    
    // Get the first document link
    const firstLink = await page.evaluate(() => {
      const table = document.querySelector('table');
      if (!table) return null;
      const firstRow = table.querySelector('tbody tr');
      if (!firstRow) return null;
      const link = firstRow.querySelector('a');
      return link ? { href: link.href, text: link.textContent, onclick: link.getAttribute('onclick') } : null;
    });
    
    console.log('First document link:', firstLink);
    
    if (firstLink && firstLink.href) {
      console.log('\nClicking first document...');
      await page.click('table tbody tr:first-child a');
      await page.waitForTimeout(5000);
      await page.waitForLoadState('networkidle');
      
      // Get current URL
      console.log('Current URL:', page.url());
      
      // Screenshot
      await page.screenshot({ path: '/home/ubuntu/clawd/data/doc-view.png', fullPage: true });
      
      // Get page content
      const content = await page.textContent('body');
      console.log('\nPage content (first 2000 chars):');
      console.log(content.substring(0, 2000));
      
      // Check for PDF embed
      const pdfFrame = await page.$('iframe, embed, object');
      if (pdfFrame) {
        console.log('\nFound PDF embed');
      }
    }
    
  } catch (err) {
    console.error('Error:', err.message);
    await page.screenshot({ path: '/home/ubuntu/clawd/data/doc-error.png', fullPage: true });
  } finally {
    await browser.close();
  }
}

testDocAccess();
