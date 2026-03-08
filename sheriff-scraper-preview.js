const { chromium } = require('playwright');
const fs = require('fs');
const { execSync } = require('child_process');
const path = require('path');

// Config
const CONFIG = {
  searchUrl: 'https://recorder.maricopa.gov/recording/document-search-results.html',
  previewUrl: 'https://recorder.maricopa.gov/recording/document-preview.html',
  outputDir: './sheriff-deeds',
  csvFile: './sheriff-deeds.csv',
  stateFile: './sheriff-deeds-state.json',
  maxPages: 50,
  startDate: '2026-01-01',
  endDate: null,
};

if (!fs.existsSync(CONFIG.outputDir)) {
  fs.mkdirSync(CONFIG.outputDir, { recursive: true });
}

function loadState() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG.stateFile, 'utf8'));
  } catch {
    return { seenRecordings: [], sheriffDeeds: [], lastRun: null };
  }
}

function saveState(state) {
  state.lastRun = new Date().toISOString();
  fs.writeFileSync(CONFIG.stateFile, JSON.stringify(state, null, 2));
}

function ocrImage(imgPath) {
  try {
    return execSync(`tesseract "${imgPath}" stdout 2>/dev/null`, { timeout: 60000 }).toString();
  } catch {
    return '';
  }
}

function checkForSheriffDeed(ocrText, recordingNumber) {
  const isSheriffDeed = /sheriff'?s?\s*deed/i.test(ocrText);
  
  if (isSheriffDeed) {
    const info = {
      recordingNumber,
      foundDate: new Date().toISOString().split('T')[0],
    };
    
    const caseMatch = ocrText.match(/CV\d{4}-\d+/i);
    if (caseMatch) info.caseNumber = caseMatch[0];
    
    const plaintiffMatch = ocrText.match(/([A-Z][A-Z\s&,.']+(?:ASSOCIATION|LLC|INC|BANK|CORP)[A-Z\s,.]*),?\s*(?:an?\s*)?(?:Arizona|plaintiff)/i);
    if (plaintiffMatch) info.plaintiff = plaintiffMatch[1].trim();
    
    const defMatch = ocrText.match(/vs\.?\s*\n?\s*([A-Z][A-Z\s,.']+)/i);
    if (defMatch) info.defendant = defMatch[1].trim().split('\n')[0];
    
    info.ocrExcerpt = ocrText.substring(0, 500).replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
    
    return info;
  }
  return null;
}

function updateCSV(newDeeds) {
  const headers = ['Recording Number', 'Case Number', 'Plaintiff', 'Defendant', 'Found Date', 'Preview URL'];
  
  let existingData = [];
  if (fs.existsSync(CONFIG.csvFile)) {
    const content = fs.readFileSync(CONFIG.csvFile, 'utf8');
    const lines = content.trim().split('\n');
    if (lines.length > 1) existingData = lines.slice(1);
  }
  
  const newRows = newDeeds.map(d => [
    d.recordingNumber || '',
    d.caseNumber || '',
    d.plaintiff || '',
    d.defendant || '',
    d.foundDate || '',
    `${CONFIG.previewUrl}?recordingNumber=${d.recordingNumber}&suffix=&pages=1`,
  ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','));
  
  fs.writeFileSync(CONFIG.csvFile, [headers.join(','), ...existingData, ...newRows].join('\n'));
}

async function scrape() {
  console.log('🔍 Sheriff Deed Scraper (Preview Mode) Starting...');
  
  const state = loadState();
  const endDate = CONFIG.endDate || new Date().toISOString().split('T')[0];
  
  console.log(`Date range: ${CONFIG.startDate} to ${endDate}\n`);
  
  const browser = await chromium.launch({ 
    headless: false,
    args: ['--disable-blink-features=AutomationControlled']
  });
  
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
  });
  
  const page = await context.newPage();
  page.setDefaultTimeout(60000);
  
  const sheriffDeeds = [];
  let totalProcessed = 0;
  
  try {
    // Load search results
    const searchParams = new URLSearchParams({
      lastNames: '',
      firstNames: '',
      middleNameIs: '',
      documentTypeSelector: 'code',
      documentCode: 'DE',
      beginDate: CONFIG.startDate,
      endDate: endDate,
    });
    
    const fullUrl = `${CONFIG.searchUrl}?${searchParams}`;
    console.log('📄 Loading search results...');
    await page.goto(fullUrl, { waitUntil: 'networkidle', timeout: 90000 });
    await page.waitForTimeout(5000);
    
    // Collect recording numbers from all pages
    const allRecordings = [];
    let pageNum = 1;
    let hasMore = true;
    
    while (hasMore && pageNum <= CONFIG.maxPages) {
      console.log(`📄 Page ${pageNum}...`);
      await page.waitForTimeout(2000);
      
      const recordings = await page.evaluate(() => {
        const nums = [];
        document.querySelectorAll('table tbody tr td:first-child').forEach(cell => {
          const text = cell.textContent?.trim();
          if (text && /^\d{10,}$/.test(text)) {
            nums.push(text);
          }
        });
        return nums;
      });
      
      console.log(`   Found ${recordings.length} records`);
      allRecordings.push(...recordings);
      
      const nextLink = page.locator(`a:text-is("${pageNum + 1}")`).first();
      if (await nextLink.count() > 0) {
        await nextLink.click();
        await page.waitForTimeout(3000);
        pageNum++;
      } else {
        hasMore = false;
      }
    }
    
    // Filter already seen
    const uniqueRecordings = [...new Set(allRecordings)];
    const newRecordings = uniqueRecordings.filter(r => !state.seenRecordings.includes(r));
    
    console.log(`\n📊 Total: ${uniqueRecordings.length}, New: ${newRecordings.length}\n`);
    
    if (newRecordings.length === 0) {
      console.log('✅ No new recordings');
      await browser.close();
      saveState(state);
      return [];
    }
    
    // Process each recording via preview page
    console.log('🔎 Checking documents...\n');
    
    for (let i = 0; i < newRecordings.length; i++) {
      const recordingNumber = newRecordings[i];
      
      process.stdout.write(`[${i + 1}/${newRecordings.length}] ${recordingNumber}... `);
      
      try {
        // Go to preview page
        const previewUrl = `${CONFIG.previewUrl}?recordingNumber=${recordingNumber}&suffix=&pages=1`;
        await page.goto(previewUrl, { waitUntil: 'networkidle', timeout: 30000 });
        await page.waitForTimeout(2000);
        
        // Take screenshot of the document (first page)
        const screenshotPath = path.join(CONFIG.outputDir, `temp-${recordingNumber}.png`);
        
        // Try to find the document image/canvas
        const docElement = await page.$('canvas, img[src*="recdoc"], .document-image, #documentImage, .page-image');
        
        if (docElement) {
          await docElement.screenshot({ path: screenshotPath });
        } else {
          // Fallback: screenshot the main content area
          const mainArea = await page.$('.document-container, .preview-container, main, #content') || page;
          await mainArea.screenshot({ path: screenshotPath });
        }
        
        // OCR the screenshot
        const ocrText = ocrImage(screenshotPath);
        
        // Check for sheriff deed
        const result = checkForSheriffDeed(ocrText, recordingNumber);
        
        if (result) {
          console.log('✓ SHERIFF DEED!');
          sheriffDeeds.push(result);
          state.sheriffDeeds.push(recordingNumber);
          // Keep screenshot for sheriff deeds
          fs.renameSync(screenshotPath, path.join(CONFIG.outputDir, `${recordingNumber}.png`));
        } else {
          console.log('not sheriff');
          try { fs.unlinkSync(screenshotPath); } catch {}
        }
        
      } catch (err) {
        console.log(`error: ${err.message.substring(0, 50)}`);
      }
      
      state.seenRecordings.push(recordingNumber);
      totalProcessed++;
      
      // Save state every 10 records
      if (totalProcessed % 10 === 0) {
        saveState(state);
      }
    }
    
  } catch (err) {
    console.error('\nError:', err.message);
  } finally {
    await browser.close();
    saveState(state);
  }
  
  if (sheriffDeeds.length > 0) {
    updateCSV(sheriffDeeds);
    console.log(`\n🎯 Found ${sheriffDeeds.length} Sheriff Deed(s)!`);
    sheriffDeeds.forEach(d => {
      console.log(`   - ${d.recordingNumber}: ${d.caseNumber || 'N/A'}`);
    });
  } else {
    console.log('\n📭 No Sheriff Deeds found');
  }
  
  console.log(`\n✅ Done! Processed ${totalProcessed} records.`);
  return sheriffDeeds;
}

scrape().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
