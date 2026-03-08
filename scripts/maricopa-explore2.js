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
    
    // Screenshot initial state
    await page.screenshot({ path: '/home/ubuntu/clawd/data/form-initial.png', fullPage: true });
    console.log('Initial screenshot saved');
    
    // Click Document Title radio
    await page.click('#documentTypeSelector-2');
    await page.waitForTimeout(2000);
    
    // Screenshot after clicking title radio
    await page.screenshot({ path: '/home/ubuntu/clawd/data/form-title-selected.png', fullPage: true });
    console.log('Title selected screenshot saved');
    
    // Get all form elements in the document type section
    const html = await page.evaluate(() => {
      // Find the section containing document search
      const section = document.querySelector('.card-body') || document.body;
      return section.innerHTML;
    });
    
    // Look for any selects or inputs after clicking title radio
    const formInfo = await page.evaluate(() => {
      const info = {
        allSelects: [],
        allInputs: [],
        visibleElements: []
      };
      
      document.querySelectorAll('select').forEach(el => {
        const rect = el.getBoundingClientRect();
        const options = Array.from(el.options).map(o => o.text.trim()).slice(0, 10);
        info.allSelects.push({
          name: el.name,
          id: el.id,
          visible: rect.height > 0,
          optionCount: el.options.length,
          sampleOptions: options
        });
      });
      
      document.querySelectorAll('input[type="search"], input[type="text"]').forEach(el => {
        const rect = el.getBoundingClientRect();
        info.allInputs.push({
          name: el.name,
          id: el.id,
          placeholder: el.placeholder,
          visible: rect.height > 0
        });
      });
      
      return info;
    });
    
    console.log('\n=== AFTER CLICKING TITLE RADIO ===\n');
    console.log('SELECTS:', JSON.stringify(formInfo.allSelects, null, 2));
    console.log('TEXT INPUTS:', JSON.stringify(formInfo.allInputs, null, 2));
    
    // Try typing in the search input
    const searchInput = await page.$('input[type="search"]');
    if (searchInput) {
      console.log('\nTyping in search input...');
      await searchInput.fill('certificate');
      await page.waitForTimeout(2000);
      await page.screenshot({ path: '/home/ubuntu/clawd/data/form-after-typing.png', fullPage: true });
      
      // Check for autocomplete/dropdown
      const suggestions = await page.evaluate(() => {
        const items = document.querySelectorAll('[role="option"], .autocomplete-item, .dropdown-item, li');
        return Array.from(items).map(i => i.textContent.trim()).filter(t => t.length > 0).slice(0, 20);
      });
      console.log('Suggestions:', suggestions);
    }
    
  } finally {
    await browser.close();
  }
}

exploreForm();
