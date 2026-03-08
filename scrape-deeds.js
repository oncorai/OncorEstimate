const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
  console.log('Launching...');
  const browser = await chromium.launch({ 
    headless: false,
    args: ['--no-sandbox']
  });
  
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    viewport: { width: 1920, height: 1080 }
  });
  
  const page = await context.newPage();
  page.setDefaultTimeout(60000);
  
  console.log('Loading search page...');
  await page.goto('https://recorder.maricopa.gov/recording/document-search.html', { 
    waitUntil: 'networkidle',
    timeout: 60000 
  });
  await page.waitForTimeout(8000);
  
  // Set dates using JavaScript
  console.log('Setting dates to 01/01/2026 - 03/07/2026...');
  await page.evaluate(() => {
    const dateInputs = document.querySelectorAll('input[type="date"]');
    if (dateInputs[0]) {
      dateInputs[0].value = '2026-01-01';
      dateInputs[0].dispatchEvent(new Event('change', { bubbles: true }));
    }
    if (dateInputs[1]) {
      dateInputs[1].value = '2026-03-07';
      dateInputs[1].dispatchEvent(new Event('change', { bubbles: true }));
    }
  });
  await page.waitForTimeout(500);
  
  // Click on the Document Code Select2 dropdown (the one with data-select2-id="2")
  console.log('Opening document code dropdown...');
  // The document code select2 is the second one on the page
  const docCodeSelect2 = page.locator('[data-select2-id="2"]');
  await docCodeSelect2.click();
  await page.waitForTimeout(1000);
  
  // Now type in the opened search box - be specific to get the right one
  console.log('Searching for TRUSTEES DEED OF ANY KIND...');
  await page.keyboard.type('TRUSTEES DEED OF ANY');
  await page.waitForTimeout(2000);
  
  // Take screenshot of dropdown
  await page.screenshot({ path: 'recorder-dropdown.png', fullPage: true });
  
  // Look for the option and click it
  const option = page.locator('.select2-results__option:has-text("TRUSTEES DEED")').first();
  if (await option.count() > 0) {
    console.log('Found TRUSTEES DEED option, clicking...');
    await option.click();
  } else {
    // Try clicking by visible text
    const altOption = page.locator('li:has-text("TRUSTEES DEED OF ANY KIND")').first();
    if (await altOption.count() > 0) {
      await altOption.click();
      console.log('Selected TRUSTEES DEED via alternate selector');
    } else {
      console.log('No TRUSTEES DEED found in dropdown');
    }
  }
  
  await page.waitForTimeout(1000);
  await page.screenshot({ path: 'recorder-before-search.png', fullPage: true });
  
  // Click the search button using JavaScript (more reliable)
  console.log('Clicking search button via JavaScript...');
  await page.evaluate(() => {
    // Find all search buttons and click the one in the main form (third one, index 2)
    const buttons = document.querySelectorAll('button');
    for (const btn of buttons) {
      if (btn.textContent.includes('SEARCH') && btn.closest('form')?.querySelector('input[type="date"]')) {
        btn.click();
        return true;
      }
    }
    // Fallback: click third SEARCH button
    const searchBtns = Array.from(document.querySelectorAll('button')).filter(b => b.textContent.includes('SEARCH'));
    if (searchBtns[2]) searchBtns[2].click();
    return false;
  });
  console.log('Search clicked');
  
  console.log('Waiting for results...');
  await page.waitForTimeout(15000);
  
  await page.screenshot({ path: 'recorder-results-final.png', fullPage: true });
  
  // Get page content
  const bodyText = await page.evaluate(() => document.body.innerText);
  console.log('\n=== RESULTS ===\n');
  console.log(bodyText.substring(0, 8000));
  
  // Save HTML
  fs.writeFileSync('recorder-results-final.html', await page.content());
  console.log('\nSaved HTML to recorder-results-final.html');
  
  // Check if there are result rows
  const rows = await page.locator('table tbody tr, .result-row, .search-result').count();
  console.log('\nFound', rows, 'result rows');
  
  await browser.close();
  console.log('\nDone');
})().catch(e => {
  console.error('Error:', e.message);
  process.exit(1);
});
