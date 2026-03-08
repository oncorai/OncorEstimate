const { chromium } = require('playwright-extra');
const stealth = require('puppeteer-extra-plugin-stealth')();
chromium.use(stealth);

(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const context = await browser.newContext({ 
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    viewport: { width: 1920, height: 1080 }
  });
  const page = await context.newPage();
  
  console.log('1. Going to search page...');
  await page.goto('https://recorder.maricopa.gov/recording/document-search.html', { 
    waitUntil: 'networkidle', timeout: 60000 
  });
  await new Promise(r => setTimeout(r, 3000));
  
  // Scroll to the search section
  await page.evaluate(() => window.scrollTo(0, 1800));
  await new Promise(r => setTimeout(r, 500));
  
  console.log('2. Clicking document code search input...');
  await page.click('input[type="search"]');
  await new Promise(r => setTimeout(r, 300));
  
  console.log('3. Typing SHERIFFS DEED...');
  await page.keyboard.type('SHERIFFS DEED');
  await new Promise(r => setTimeout(r, 1500));
  
  await page.screenshot({ path: '/tmp/dropdown.png' });
  
  console.log('4. Selecting from dropdown...');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await new Promise(r => setTimeout(r, 500));
  
  console.log('5. Setting dates...');
  // Date inputs use YYYY-MM-DD format
  await page.evaluate(() => {
    document.getElementById('beginDateInput').value = '2025-11-01';
  });
  await new Promise(r => setTimeout(r, 300));
  
  await page.screenshot({ path: '/tmp/form-filled.png' });
  
  console.log('6. Clicking search...');
  // Simply click the visible SEARCH button
  await page.click('button:has-text("SEARCH"):visible');
  await new Promise(r => setTimeout(r, 7000));
  
  console.log('7. Results...');
  await page.screenshot({ path: '/tmp/results.png', fullPage: true });
  
  const info = await page.evaluate(() => {
    const text = document.body.innerText;
    const match = text.match(/Showing \d+ - \d+ of (\d+)/);
    const nums = [];
    document.querySelectorAll('[data-recordingnumber]').forEach(el => {
      nums.push(el.getAttribute('data-recordingnumber'));
    });
    return { 
      showing: match ? match[0] : 'Not found', 
      count: nums.length, 
      firstNums: nums.slice(0, 5),
      url: window.location.href
    };
  });
  
  console.log('\nResults:', JSON.stringify(info, null, 2));
  
  await browser.close();
})();
