const { chromium } = require('playwright');

async function testPreview() {
  const browser = await chromium.launch({ 
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'
  });
  
  const page = await context.newPage();
  
  try {
    const previewUrl = 'https://recorder.maricopa.gov/recording/document-preview.html?recordingNumber=20250650235&suffix=&pages=7';
    
    console.log('Testing preview URL:', previewUrl);
    await page.goto(previewUrl, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(5000);
    
    // Get content from the preview module
    const previewContent = await page.evaluate(() => {
      const module = document.querySelector('#documentSearchPreviewModule');
      if (!module) return { error: 'Module not found' };
      
      const result = {
        text: module.textContent,
        images: [],
        innerHTML: module.innerHTML.substring(0, 5000)
      };
      
      module.querySelectorAll('img').forEach(img => {
        result.images.push({
          src: img.src?.substring(0, 100),
          alt: img.alt
        });
      });
      
      return result;
    });
    
    console.log('\nPreview module content:');
    console.log(previewContent.text);
    
    console.log('\nImages in preview:');
    previewContent.images.forEach((img, i) => {
      console.log(`${i+1}. ${img.src}`);
    });
    
    // The document is rendered as images, so text extraction won't work
    // Need to check the API or find another way
    console.log('\n--- Checking API ---');
    
    // Try to find document title/metadata
    const metadata = await page.evaluate(() => {
      // Look for any visible text that might be the document title
      const headings = document.querySelectorAll('h1, h2, h3, h4, h5');
      const titles = Array.from(headings).map(h => h.textContent.trim());
      
      // Look for any text containers
      const texts = [];
      document.querySelectorAll('p, div, span').forEach(el => {
        const t = el.textContent.trim();
        if (t.length > 20 && t.length < 200 && !t.includes('\n')) {
          texts.push(t);
        }
      });
      
      return { titles, texts: texts.slice(0, 20) };
    });
    
    console.log('Headings:', metadata.titles);
    console.log('Texts:', metadata.texts);
    
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await browser.close();
  }
}

testPreview();
