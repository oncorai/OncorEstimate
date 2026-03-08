const { chromium } = require('playwright');

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

async function scrapeMaricopa(page, recordingNumber) {
  const url = `https://recorder.maricopa.gov/recording/document-preview.html?recordingNumber=${recordingNumber}&suffix=&pages=1`;
  console.log(`\n========== ${recordingNumber} ==========`);
  
  // Use domcontentloaded instead of networkidle (faster, less prone to timeout)
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  
  // Wait for cloudflare to resolve
  await page.waitForTimeout(5000);
  
  // Check title
  const title = await page.title();
  if (title.includes('Just a moment')) {
    console.log('Cloudflare challenge detected, waiting...');
    await page.waitForTimeout(10000);
  }
  
  // Scroll to load document
  await page.evaluate(() => window.scrollTo(0, 500));
  await page.waitForTimeout(2000);
  
  // Take screenshot
  const screenshotPath = `/tmp/deed-${recordingNumber}.png`;
  await page.screenshot({ path: screenshotPath, fullPage: true });
  console.log(`Screenshot: ${screenshotPath}`);
  
  return screenshotPath;
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
  });
  const page = await context.newPage();
  
  const results = [];
  
  for (const num of RECORDING_NUMBERS) {
    try {
      const screenshot = await scrapeMaricopa(page, num);
      results.push({ recordingNumber: num, screenshot, status: 'ok' });
    } catch (err) {
      console.error(`Error on ${num}:`, err.message);
      results.push({ recordingNumber: num, error: err.message, status: 'error' });
    }
    
    // Wait between requests to avoid rate limiting
    console.log('Waiting 5s before next request...');
    await page.waitForTimeout(5000);
  }
  
  await browser.close();
  
  console.log('\n\n========== SUMMARY ==========');
  results.forEach(r => {
    console.log(`${r.recordingNumber}: ${r.status}${r.error ? ' - ' + r.error : ''}`);
  });
}

main();
