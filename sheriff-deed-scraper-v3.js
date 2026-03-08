const { chromium } = require('playwright');
const fs = require('fs');
const { execSync } = require('child_process');
const path = require('path');

// Config
const CONFIG = {
  searchUrl: 'https://recorder.maricopa.gov/recording/document-search-results.html',
  previewUrl: 'https://recorder.maricopa.gov/recording/document-preview.html',
  legacyPdfUrl: 'https://legacy.recorder.maricopa.gov/UnOfficialDocs/pdf/',
  outputDir: './sheriff-deeds',
  csvFile: './sheriff-deeds.csv',
  stateFile: './sheriff-deeds-state.json',
  maxPages: 100,
  startDate: '2025-01-01',  // Changed to 2025 for more data
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

function ocrAndCheck(pdfPath, recordingNumber) {
  const imgPath = path.join(CONFIG.outputDir, `temp-${recordingNumber}`);
  
  try {
    execSync(`pdftoppm "${pdfPath}" "${imgPath}" -png -f 1 -l 1`, { timeout: 30000 });
    const imgFile = `${imgPath}-1.png`;
    
    if (!fs.existsSync(imgFile)) {
      return null;
    }
    
    const ocrText = execSync(`tesseract "${imgFile}" stdout 2>/dev/null`, { timeout: 60000 }).toString();
    fs.unlinkSync(imgFile);
    
    const isSheriffDeed = /sheriff'?s?\s*deed/i.test(ocrText);
    
    if (isSheriffDeed) {
      const info = {
        recordingNumber,
        pdfPath,
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
  } catch (err) {
    console.log(`  OCR error: ${err.message}`);
    try { fs.unlinkSync(`${imgPath}-1.png`); } catch {}
    return null;
  }
}

function updateCSV(newDeeds) {
  const headers = ['Recording Number', 'Case Number', 'Plaintiff', 'Defendant', 'PDF Path', 'Found Date'];
  
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
    d.pdfPath || '',
    d.foundDate || '',
  ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','));
  
  fs.writeFileSync(CONFIG.csvFile, [headers.join(','), ...existingData, ...newRows].join('\n'));
}

async function scrape() {
  console.log('🔍 Sheriff Deed Scraper v3 (Browser Mode) Starting...');
  
  const state = loadState();
  const endDate = CONFIG.endDate || new Date().toISOString().split('T')[0];
  
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
  console.log(`Date range: ${CONFIG.startDate} to ${endDate}`);
  console.log(`URL: ${fullUrl}\n`);
  
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
  let totalNew = 0;
  
  try {
    console.log('📄 Loading search results...');
    await page.goto(fullUrl, { waitUntil: 'networkidle', timeout: 90000 });
    await page.waitForTimeout(5000);
    
    // Collect all recording numbers from all pages first
    const allRecordings = [];
    let pageNum = 1;
    let hasMore = true;
    
    while (hasMore && pageNum <= CONFIG.maxPages) {
      console.log(`📄 Collecting from page ${pageNum}...`);
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
      
      console.log(`   Found ${recordings.length} recording numbers`);
      allRecordings.push(...recordings);
      
      // Try next page
      const nextLink = page.locator(`a:text-is("${pageNum + 1}")`).first();
      if (await nextLink.count() > 0) {
        await nextLink.click();
        await page.waitForTimeout(3000);
        pageNum++;
      } else {
        hasMore = false;
      }
    }
    
    // Dedupe and filter already seen
    const uniqueRecordings = [...new Set(allRecordings)];
    const newRecordings = uniqueRecordings.filter(r => !state.seenRecordings.includes(r));
    
    console.log(`\n📊 Total: ${uniqueRecordings.length}, New: ${newRecordings.length}\n`);
    
    if (newRecordings.length === 0) {
      console.log('✅ No new recordings to process');
      await browser.close();
      saveState(state);
      return [];
    }
    
    // Process each new recording
    console.log('🔎 Checking documents for Sheriff Deeds...\n');
    
    for (let i = 0; i < newRecordings.length; i++) {
      const recordingNumber = newRecordings[i];
      totalNew++;
      
      process.stdout.write(`[${i + 1}/${newRecordings.length}] ${recordingNumber}... `);
      
      const pdfPath = path.join(CONFIG.outputDir, `${recordingNumber}.pdf`);
      let gotPdf = false;
      
      // First try legacy URL (faster if available)
      try {
        execSync(`curl -sL "${CONFIG.legacyPdfUrl}${recordingNumber}.pdf" -o "${pdfPath}" -H "User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36" -H "Referer: https://recorder.maricopa.gov/"`, { timeout: 30000 });
        
        const fileInfo = execSync(`file "${pdfPath}"`).toString();
        if (fileInfo.includes('PDF')) {
          gotPdf = true;
        }
      } catch {}
      
      // If legacy failed, use browser preview
      if (!gotPdf) {
        try {
          const previewUrl = `${CONFIG.previewUrl}?recordingNumber=${recordingNumber}&suffix=&pages=1`;
          await page.goto(previewUrl, { waitUntil: 'networkidle', timeout: 30000 });
          await page.waitForTimeout(3000);
          
          // Try to find and download the PDF/image
          // Look for PDF embed or image
          const pdfSrc = await page.evaluate(() => {
            const embed = document.querySelector('embed[src*="pdf"], iframe[src*="pdf"], object[data*="pdf"]');
            if (embed) return embed.src || embed.data;
            
            const img = document.querySelector('img[src*="recdoc"], img[src*="recording"]');
            if (img) return img.src;
            
            return null;
          });
          
          if (pdfSrc) {
            // Download via page context
            const response = await page.goto(pdfSrc, { timeout: 30000 });
            if (response) {
              const buffer = await response.body();
              fs.writeFileSync(pdfPath, buffer);
              gotPdf = true;
            }
          }
        } catch (err) {
          console.log(`browser error: ${err.message}`);
        }
      }
      
      if (!gotPdf || !fs.existsSync(pdfPath)) {
        console.log('skip (no PDF)');
        state.seenRecordings.push(recordingNumber);
        continue;
      }
      
      // OCR and check
      const result = ocrAndCheck(pdfPath, recordingNumber);
      
      if (result) {
        console.log('✓ SHERIFF DEED!');
        sheriffDeeds.push(result);
        state.sheriffDeeds.push(recordingNumber);
      } else {
        console.log('not sheriff');
        // Delete non-sheriff PDFs to save space
        try { fs.unlinkSync(pdfPath); } catch {}
      }
      
      state.seenRecordings.push(recordingNumber);
      totalProcessed++;
      
      // Save state periodically
      if (totalProcessed % 20 === 0) {
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
    sheriffDeeds.forEach(d => console.log(`   - ${d.recordingNumber}: ${d.caseNumber || 'N/A'}`));
  } else {
    console.log('\n📭 No Sheriff Deeds found');
  }
  
  console.log(`\n✅ Done! Processed ${totalProcessed} new records.`);
  return sheriffDeeds;
}

scrape().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
