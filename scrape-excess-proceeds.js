const { chromium } = require('playwright');
const XLSX = require('xlsx');
const fs = require('fs');

async function scrapeExcessProceeds() {
  console.log('Starting Maricopa County Excess Proceeds scraper...');
  
  const browser = await chromium.launch({ 
    headless: true,
    args: [
      '--no-sandbox', 
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled'
    ]
  });
  
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1920, height: 1080 }
  });
  
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
  });
  
  const page = await context.newPage();
  page.setDefaultTimeout(60000);
  
  const allRecords = [];
  
  try {
    console.log('Loading page...');
    await page.goto('https://treasurer.maricopa.gov/ExcessProceeds/', { 
      waitUntil: 'networkidle',
      timeout: 60000 
    });
    
    console.log('Page loaded, waiting for Blazor to initialize...');
    await page.waitForTimeout(5000);
    
    // Take screenshot
    await page.screenshot({ path: '/home/ubuntu/clawd/ep-loaded.png', fullPage: true });
    
    // Get all text on page to understand structure
    const pageText = await page.evaluate(() => document.body.innerText);
    console.log('Page text preview:', pageText.substring(0, 1000));
    
    // Look for any form elements that might have appeared
    const allElements = await page.evaluate(() => {
      const elements = [];
      document.querySelectorAll('input, button, select, textarea, [role="textbox"], [contenteditable="true"]').forEach(el => {
        elements.push({
          tag: el.tagName,
          type: el.type || '',
          id: el.id || '',
          class: el.className || '',
          name: el.name || '',
          placeholder: el.placeholder || '',
          text: el.textContent?.trim().substring(0, 50) || ''
        });
      });
      return elements;
    });
    console.log('Interactive elements:', JSON.stringify(allElements, null, 2));
    
    // Look for Telerik/Kendo UI components (they use these)
    const telerikInputs = await page.$$('.k-input, .k-textbox, [class*="telerik"], [class*="kendo"]');
    console.log('Telerik inputs found:', telerikInputs.length);
    
    // Try clicking on search icon
    const searchIcon = await page.$('.search-icon, [class*="search"]');
    if (searchIcon) {
      console.log('Found search icon, clicking...');
      await searchIcon.click();
      await page.waitForTimeout(2000);
      await page.screenshot({ path: '/home/ubuntu/clawd/ep-after-search-click.png', fullPage: true });
    }
    
    // Save full HTML for analysis
    const html = await page.content();
    fs.writeFileSync('/home/ubuntu/clawd/ep-full.html', html);
    console.log('Full HTML saved to ep-full.html');
    
    // Look for any data tables
    const tables = await page.$$('table');
    console.log('Tables found:', tables.length);
    
    // Check for grid/data components
    const grids = await page.$$('.k-grid, [class*="grid"], [class*="Grid"]');
    console.log('Grid elements found:', grids.length);
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await browser.close();
  }
  
  return allRecords;
}

scrapeExcessProceeds().then(records => {
  console.log('Done. Records found:', records.length);
}).catch(err => {
  console.error('Fatal error:', err);
});
