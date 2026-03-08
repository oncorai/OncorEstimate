const { chromium } = require('playwright-extra');
const stealth = require('puppeteer-extra-plugin-stealth')();

chromium.use(stealth);

const RECORDING_NUMBERS = [
  '20260019343',
  '20260028137', 
  '20260042884',
  '20260056871',
  '20260056872',
  '20260071439',
  '20260072486',
  '20260093355',
  '20260104580',
  '20260129147'
];

async function main() {
  const browser = await chromium.launch({ 
    headless: true,
    args: ['--disable-blink-features=AutomationControlled', '--no-sandbox']
  });
  
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    viewport: { width: 1920, height: 1080 }
  });
  
  const page = await context.newPage();
  
  for (const num of RECORDING_NUMBERS) {
    console.log(`\n========== ${num} ==========`);
    try {
      const url = `https://recorder.maricopa.gov/recording/document-preview.html?recordingNumber=${num}&suffix=&pages=1`;
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(5000);
      
      const title = await page.title();
      console.log(`Title: ${title}`);
      
      if (title.includes('Just a moment') || title.includes('security')) {
        console.log('Cloudflare detected, waiting...');
        await page.waitForTimeout(10000);
      }
      
      await page.evaluate(() => window.scrollTo(0, 500));
      await page.waitForTimeout(2000);
      
      await page.screenshot({ path: `/tmp/stealth-${num}.png`, fullPage: true });
      console.log(`Screenshot saved`);
      
    } catch (err) {
      console.error(`Error: ${err.message}`);
    }
    
    // Delay between requests
    await page.waitForTimeout(3000);
  }
  
  await browser.close();
  console.log('\n\nDone! All screenshots in /tmp/stealth-*.png');
}

main();
