const { chromium } = require('playwright');
const fs = require('fs');

const SAMPLE_DOCS = [
  '20250634164',
  '20250634684', 
  '20250635052',
  '20250635404',
  '20250636053'
];

const IMG_DIR = '/home/ubuntu/clawd/data/doc-samples';

async function main() {
  if (!fs.existsSync(IMG_DIR)) {
    fs.mkdirSync(IMG_DIR, { recursive: true });
  }
  
  const browser = await chromium.launch({ 
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'
  });
  
  const page = await context.newPage();
  
  for (const docNum of SAMPLE_DOCS) {
    console.log(`Capturing ${docNum}...`);
    try {
      const url = `https://recorder.maricopa.gov/recording/document-preview.html?recordingNumber=${docNum}&suffix=&pages=1`;
      await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
      await page.waitForTimeout(5000);
      
      // Screenshot just the document area
      await page.screenshot({ 
        path: `${IMG_DIR}/${docNum}.png`,
        clip: { x: 100, y: 400, width: 700, height: 600 }
      });
      console.log(`  ✓ saved`);
    } catch (err) {
      console.log(`  ✗ ${err.message}`);
    }
  }
  
  await browser.close();
  console.log(`\nSamples saved to ${IMG_DIR}`);
}

main();
