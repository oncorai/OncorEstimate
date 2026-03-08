const { chromium } = require('playwright');

async function exploreForm() {
  const browser = await chromium.launch({ 
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'
  });
  
  const page = await context.newPage();
  
  try {
    await page.goto('https://recorder.maricopa.gov/recording/document-search.html', { 
      waitUntil: 'networkidle', 
      timeout: 60000 
    });
    await page.waitForTimeout(5000);
    
    // Screenshot
    await page.screenshot({ path: '/home/ubuntu/clawd/data/search-form.png', fullPage: true });
    console.log('Screenshot saved');
    
    // Get form structure
    const formInfo = await page.evaluate(() => {
      const info = {
        inputs: [],
        selects: [],
        buttons: [],
        radios: [],
        labels: []
      };
      
      document.querySelectorAll('input').forEach(el => {
        info.inputs.push({
          type: el.type,
          name: el.name,
          id: el.id,
          value: el.value,
          placeholder: el.placeholder
        });
      });
      
      document.querySelectorAll('select').forEach(el => {
        const options = [];
        el.querySelectorAll('option').forEach(opt => {
          options.push({ value: opt.value, text: opt.textContent.trim() });
        });
        info.selects.push({
          name: el.name,
          id: el.id,
          options: options.slice(0, 20) // First 20 options
        });
      });
      
      document.querySelectorAll('button, input[type="submit"]').forEach(el => {
        info.buttons.push({
          type: el.type,
          text: el.textContent || el.value,
          id: el.id
        });
      });
      
      document.querySelectorAll('label').forEach(el => {
        info.labels.push(el.textContent.trim().substring(0, 50));
      });
      
      return info;
    });
    
    console.log('\n=== FORM STRUCTURE ===\n');
    console.log('INPUTS:', JSON.stringify(formInfo.inputs, null, 2));
    console.log('\nSELECTS:', JSON.stringify(formInfo.selects, null, 2));
    console.log('\nBUTTONS:', JSON.stringify(formInfo.buttons, null, 2));
    console.log('\nLABELS:', formInfo.labels);
    
  } finally {
    await browser.close();
  }
}

exploreForm();
