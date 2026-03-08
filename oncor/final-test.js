const { chromium } = require('playwright-extra');
const stealth = require('puppeteer-extra-plugin-stealth')();
chromium.use(stealth);

(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  
  console.log('1. Loading search page...');
  await page.goto('https://recorder.maricopa.gov/recording/document-search.html', { 
    waitUntil: 'networkidle', timeout: 60000 
  });
  await new Promise(r => setTimeout(r, 3000));
  
  console.log('2. Scrolling and filling form...');
  await page.evaluate(() => window.scrollTo(0, 1800));
  await new Promise(r => setTimeout(r, 500));
  
  // Type SHERIFFS DEED
  await page.click('input[type="search"]');
  await page.keyboard.type('SHERIFFS DEED');
  await new Promise(r => setTimeout(r, 1500));
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await new Promise(r => setTimeout(r, 500));
  
  // Set date
  await page.evaluate(() => {
    document.getElementById('beginDateInput').value = '2025-11-01';
  });
  await new Promise(r => setTimeout(r, 300));
  
  console.log('3. Taking pre-search screenshot...');
  await page.screenshot({ path: '/tmp/pre-search.png' });
  
  console.log('4. Clicking with page.click using nth selector...');
  // The third SEARCH button should be the one we want
  try {
    await page.click('button:has-text("SEARCH") >> nth=2', { timeout: 5000 });
    console.log('   Clicked via nth selector');
  } catch (e) {
    console.log('   nth selector failed, trying evaluate...');
    await page.evaluate(() => {
      // Find buttons containing SEARCH text
      const allBtns = Array.from(document.querySelectorAll('button'));
      const searchBtns = allBtns.filter(b => b.innerText.includes('SEARCH'));
      console.log('Found', searchBtns.length, 'search buttons');
      // Click the third one (index 2)
      if (searchBtns[2]) {
        searchBtns[2].click();
      }
    });
  }
  
  console.log('5. Waiting for navigation...');
  await page.waitForNavigation({ timeout: 10000 }).catch(() => {
    console.log('   No navigation detected');
  });
  
  await new Promise(r => setTimeout(r, 3000));
  
  console.log('6. Final URL:', await page.url());
  await page.screenshot({ path: '/tmp/post-search.png', fullPage: true });
  
  const info = await page.evaluate(() => {
    const text = document.body.innerText;
    const match = text.match(/Showing \d+ - \d+ of (\d+)/);
    const nums = [];
    document.querySelectorAll('[data-recordingnumber]').forEach(el => {
      nums.push(el.getAttribute('data-recordingnumber'));
    });
    return { showing: match ? match[0] : 'Not found', count: nums.length, firstNums: nums.slice(0, 3) };
  });
  
  console.log('7. Results:', JSON.stringify(info));
  
  await browser.close();
})();
