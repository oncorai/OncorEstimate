const { chromium } = require('playwright');
const fs = require('fs');

async function testVision() {
  const browser = await chromium.launch({ 
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'
  });
  
  const page = await context.newPage();
  
  try {
    // Test with first search result - certificate of sale of property
    const searchUrl = 'https://recorder.maricopa.gov/recording/document-search-results.html?lastNames=&firstNames=&middleNameIs=&documentTypeSelector=title&documentTitle=certificate%20of%20sale%20of%20property&beginDate=2025-11-01&endDate=2026-03-08';
    
    console.log('Getting first document number...');
    await page.goto(searchUrl, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(3000);
    
    // Get first recording number
    const firstDoc = await page.evaluate(() => {
      const cell = document.querySelector('tbody tr td');
      return cell?.textContent?.trim();
    });
    
    console.log('First document:', firstDoc);
    
    if (!firstDoc) {
      console.log('No document found');
      return;
    }
    
    // Go to preview
    const previewUrl = `https://recorder.maricopa.gov/recording/document-preview.html?recordingNumber=${firstDoc}&suffix=&pages=1`;
    console.log('Going to preview:', previewUrl);
    
    await page.goto(previewUrl, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(8000);
    
    // Wait for document image to load
    await page.waitForSelector('img[src*="publicapi"]', { timeout: 15000 }).catch(() => {});
    
    // Find the document preview area and screenshot just that
    const previewModule = await page.$('#documentSearchPreviewModule');
    if (previewModule) {
      await previewModule.screenshot({ path: '/home/ubuntu/clawd/data/doc-preview-capture.png' });
      console.log('Saved preview screenshot');
    } else {
      await page.screenshot({ path: '/home/ubuntu/clawd/data/doc-preview-capture.png', fullPage: true });
      console.log('Saved full page screenshot');
    }
    
    // Also try to get the actual document image src
    const imgSrc = await page.evaluate(() => {
      const imgs = document.querySelectorAll('img[src*="publicapi"]');
      if (imgs.length > 0) {
        return imgs[0].src;
      }
      return null;
    });
    
    console.log('Document image src:', imgSrc);
    
    // If we found the image, try to download it via the browser
    if (imgSrc) {
      const response = await page.goto(imgSrc, { timeout: 30000 });
      const buffer = await response.body();
      fs.writeFileSync('/home/ubuntu/clawd/data/doc-page1-actual.png', buffer);
      console.log('Saved actual document image');
    }
    
  } catch (err) {
    console.error('Error:', err.message);
    await page.screenshot({ path: '/home/ubuntu/clawd/data/vision-error.png' });
  } finally {
    await browser.close();
  }
}

testVision();
