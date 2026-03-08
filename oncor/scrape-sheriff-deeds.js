const { chromium } = require('playwright');

async function scrapeMaricopa(recordingNumber) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
  });
  const page = await context.newPage();
  
  try {
    const url = `https://recorder.maricopa.gov/recording/document-preview.html?recordingNumber=${recordingNumber}&suffix=&pages=1`;
    console.log(`Fetching: ${url}`);
    
    await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
    
    // Wait for content to load
    await page.waitForTimeout(3000);
    
    // Scroll down to trigger lazy loading
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(2000);
    
    // Look for document details table or text
    const pageText = await page.evaluate(() => document.body.innerText);
    
    // Extract key information
    const lines = pageText.split('\n').filter(l => l.trim());
    
    // Look for defendant, address, sale amount patterns
    let defendant = '';
    let address = '';
    let amount = '';
    
    for (const line of lines) {
      if (line.includes('Grantor') || line.includes('GRANTOR')) {
        defendant = line;
      }
      if (line.includes('Property') || line.match(/\d+\s+[A-Z]/)) {
        address = line;
      }
      if (line.includes('$') || line.includes('Amount')) {
        amount = line;
      }
    }
    
    console.log('\n--- Page Text (first 3000 chars) ---');
    console.log(pageText.substring(0, 3000));
    console.log('\n--- Extracted ---');
    console.log('Defendant:', defendant);
    console.log('Address:', address);
    console.log('Amount:', amount);
    
    // Take full page screenshot
    await page.screenshot({ path: `/tmp/maricopa-${recordingNumber}.png`, fullPage: true });
    console.log(`\nScreenshot saved to /tmp/maricopa-${recordingNumber}.png`);
    
    return { defendant, address, amount, pageText };
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await browser.close();
  }
}

// Test with first recording number
const testNumber = process.argv[2] || '20260019343';
scrapeMaricopa(testNumber);
