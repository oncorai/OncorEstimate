const { chromium } = require('playwright-extra');
const stealth = require('puppeteer-extra-plugin-stealth')();

// Add stealth plugin
chromium.use(stealth);

async function scrapeMaricopa(recordingNumber) {
  const browser = await chromium.launch({ 
    headless: true,
    args: [
      '--disable-blink-features=AutomationControlled',
      '--no-sandbox',
      '--disable-setuid-sandbox'
    ]
  });
  
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    viewport: { width: 1920, height: 1080 }
  });
  
  const page = await context.newPage();
  
  // Add some randomness to look more human
  await page.setExtraHTTPHeaders({
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br'
  });
  
  try {
    const url = `https://recorder.maricopa.gov/recording/document-preview.html?recordingNumber=${recordingNumber}&suffix=&pages=1`;
    console.log(`Fetching: ${url}`);
    
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    
    // Wait and check for cloudflare
    await page.waitForTimeout(8000);
    
    const title = await page.title();
    console.log(`Title: ${title}`);
    
    if (title.includes('Just a moment') || title.includes('security')) {
      console.log('Cloudflare detected, waiting longer...');
      await page.waitForTimeout(15000);
    }
    
    // Scroll
    await page.evaluate(() => window.scrollTo(0, 500));
    await page.waitForTimeout(2000);
    
    // Screenshot
    await page.screenshot({ path: `/tmp/stealth-${recordingNumber}.png`, fullPage: true });
    console.log(`Screenshot saved`);
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await browser.close();
  }
}

const testNumber = process.argv[2] || '20260028137';
scrapeMaricopa(testNumber);
