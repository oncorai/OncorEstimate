const { chromium } = require('playwright');
const fs = require('fs');

async function captureDoc(docNum) {
  const browser = await chromium.launch({ 
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 1200 }
  });
  
  const page = await context.newPage();
  
  try {
    const url = `https://recorder.maricopa.gov/recording/document-preview.html?recordingNumber=${docNum}&suffix=&pages=1`;
    console.log(`Loading ${url}`);
    
    await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(8000);
    
    // Scroll to the document preview area
    await page.evaluate(() => {
      const preview = document.querySelector('.card-body, .document-preview-container, #documentSearchPreviewModule');
      if (preview) preview.scrollIntoView();
    });
    await page.waitForTimeout(1000);
    
    // Screenshot the full viewport which should include the document
    const imgPath = `/home/ubuntu/clawd/data/doc-samples/${docNum}-full.png`;
    await page.screenshot({ path: imgPath, fullPage: false });
    console.log(`Saved: ${imgPath}`);
    
    // Also get just the document card/preview area
    const cardPath = `/home/ubuntu/clawd/data/doc-samples/${docNum}-card.png`;
    const card = await page.$('.card-body, .document-preview-container');
    if (card) {
      await card.screenshot({ path: cardPath });
      console.log(`Saved card: ${cardPath}`);
    }
    
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await browser.close();
  }
}

const docNum = process.argv[2] || '20250634164';
captureDoc(docNum);
