const { chromium } = require('playwright');
const fs = require('fs');
const { execSync } = require('child_process');
const path = require('path');

// Config
const CONFIG = {
  searchUrl: 'https://recorder.maricopa.gov/recording/document-search-results.html',
  outputDir: './sheriff-deeds',
  csvFile: './sheriff-deeds.csv',
  stateFile: './sheriff-deeds-state.json',
  maxPages: 100,
  startDate: '2026-01-01',
  endDate: null, // null = today
};

if (!fs.existsSync(CONFIG.outputDir)) {
  fs.mkdirSync(CONFIG.outputDir, { recursive: true });
}

function loadState() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG.stateFile, 'utf8'));
  } catch {
    return { seenRecordings: [], lastRun: null };
  }
}

function saveState(state) {
  state.lastRun = new Date().toISOString();
  fs.writeFileSync(CONFIG.stateFile, JSON.stringify(state, null, 2));
}

// OCR a PDF file and check if it's a sheriff's deed
function checkPdfForSheriffDeed(pdfPath, recordingNumber) {
  const imgPath = path.join(CONFIG.outputDir, `temp-${recordingNumber}`);
  
  try {
    // Convert to image and OCR
    execSync(`pdftoppm "${pdfPath}" "${imgPath}" -png -f 1 -l 1`, { timeout: 30000 });
    const imgFile = `${imgPath}-1.png`;
    
    if (!fs.existsSync(imgFile)) {
      console.log(`  Could not convert PDF`);
      return null;
    }
    
    const ocrText = execSync(`tesseract "${imgFile}" stdout 2>/dev/null`, { timeout: 60000 }).toString();
    fs.unlinkSync(imgFile);
    
    const isSheriffDeed = /sheriff'?s?\s*deed/i.test(ocrText);
    
    if (isSheriffDeed) {
      return extractDeedInfo(ocrText, recordingNumber, pdfPath);
    }
    return null;
  } catch (err) {
    console.log(`  OCR Error: ${err.message}`);
    try { fs.unlinkSync(`${imgPath}-1.png`); } catch {}
    return null;
  }
}

function extractDeedInfo(text, recordingNumber, pdfPath) {
  const info = {
    recordingNumber,
    pdfPath,
    foundDate: new Date().toISOString().split('T')[0],
  };
  
  const caseMatch = text.match(/CV\d{4}-\d+/i);
  if (caseMatch) info.caseNumber = caseMatch[0];
  
  const plaintiffMatch = text.match(/([A-Z][A-Z\s&,.']+(?:ASSOCIATION|LLC|INC|BANK|CORP)[A-Z\s,.]*),?\s*(?:an?\s*)?(?:Arizona|plaintiff)/i);
  if (plaintiffMatch) info.plaintiff = plaintiffMatch[1].trim();
  
  const defMatch = text.match(/vs\.?\s*\n?\s*([A-Z][A-Z\s,.']+)/i);
  if (defMatch) info.defendant = defMatch[1].trim().split('\n')[0];
  
  info.ocrExcerpt = text.substring(0, 500).replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
  
  return info;
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
  console.log('🔍 Sheriff Deed Scraper v2 Starting...');
  
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
  console.log(`URL: ${fullUrl}\n`);
  
  const browser = await chromium.launch({ 
    headless: false,
    args: ['--disable-blink-features=AutomationControlled']
  });
  
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    acceptDownloads: true
  });
  
  const page = await context.newPage();
  page.setDefaultTimeout(60000);
  
  const sheriffDeeds = [];
  let totalProcessed = 0;
  
  try {
    console.log('📄 Loading search results...');
    await page.goto(fullUrl, { waitUntil: 'networkidle', timeout: 90000 });
    await page.waitForTimeout(5000);
    
    // Get all result rows
    let hasMore = true;
    let pageNum = 1;
    
    while (hasMore && pageNum <= CONFIG.maxPages) {
      console.log(`\n📄 Processing page ${pageNum}...`);
      
      // Wait for table to load
      await page.waitForTimeout(2000);
      
      // Get recording numbers from current page
      const rowData = await page.evaluate(() => {
        const rows = [];
        document.querySelectorAll('table tbody tr').forEach(row => {
          const cells = row.querySelectorAll('td');
          if (cells.length > 0) {
            const recordingNum = cells[0]?.textContent?.trim();
            // Check if first cell has a clickable link
            const link = cells[0]?.querySelector('a');
            if (recordingNum && /^\d+$/.test(recordingNum)) {
              rows.push({
                recordingNumber: recordingNum,
                hasLink: !!link
              });
            }
          }
        });
        return rows;
      });
      
      console.log(`   Found ${rowData.length} records on this page`);
      
      // Process each row
      for (let i = 0; i < rowData.length; i++) {
        const { recordingNumber } = rowData[i];
        
        if (state.seenRecordings.includes(recordingNumber)) {
          console.log(`[${totalProcessed + 1}] ${recordingNumber} - already processed, skipping`);
          totalProcessed++;
          continue;
        }
        
        console.log(`[${totalProcessed + 1}] ${recordingNumber} - checking...`);
        
        try {
          // Click on the recording number to open detail page
          const recordingLink = page.locator(`table tbody tr td:first-child a:text-is("${recordingNumber}")`).first();
          
          if (await recordingLink.count() > 0) {
            // Open in new tab
            const [newPage] = await Promise.all([
              context.waitForEvent('page'),
              recordingLink.click({ modifiers: ['Control'] })
            ]).catch(() => [null]);
            
            if (newPage) {
              await newPage.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
              await newPage.waitForTimeout(3000);
              
              // Look for PDF link or viewer
              const pdfUrl = await newPage.evaluate(() => {
                // Try various selectors for PDF
                const pdfLink = document.querySelector('a[href*=".pdf"], a[href*="pdf"], iframe[src*="pdf"], embed[src*="pdf"]');
                if (pdfLink) {
                  return pdfLink.href || pdfLink.src;
                }
                // Check for viewer
                const viewer = document.querySelector('[src*="pdf"], [data-pdf]');
                if (viewer) {
                  return viewer.src || viewer.getAttribute('data-pdf');
                }
                return null;
              });
              
              if (pdfUrl) {
                console.log(`   PDF found: ${pdfUrl.substring(0, 60)}...`);
                
                // Download the PDF
                const pdfPath = path.join(CONFIG.outputDir, `${recordingNumber}.pdf`);
                
                try {
                  // Try to download via the page
                  const response = await newPage.goto(pdfUrl, { timeout: 30000 });
                  if (response) {
                    const buffer = await response.body();
                    fs.writeFileSync(pdfPath, buffer);
                    
                    // Check if it's a sheriff deed
                    const result = checkPdfForSheriffDeed(pdfPath, recordingNumber);
                    if (result) {
                      console.log(`   ✓ SHERIFF'S DEED FOUND!`);
                      sheriffDeeds.push(result);
                    } else {
                      console.log(`   Not a sheriff deed`);
                      fs.unlinkSync(pdfPath);
                    }
                  }
                } catch (dlErr) {
                  console.log(`   Download error: ${dlErr.message}`);
                }
              } else {
                // No PDF link, check for embedded viewer or other methods
                console.log(`   No direct PDF link found, checking page content...`);
                
                // Take screenshot to see what's there (for debugging)
                // await newPage.screenshot({ path: `${CONFIG.outputDir}/debug-${recordingNumber}.png` });
              }
              
              await newPage.close();
            } else {
              // Fallback: click normally and navigate back
              await recordingLink.click();
              await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
              await page.waitForTimeout(2000);
              
              // Check for PDF on this page
              const pdfUrl = await page.evaluate(() => {
                const pdfLink = document.querySelector('a[href*=".pdf"], iframe[src*="pdf"]');
                return pdfLink ? (pdfLink.href || pdfLink.src) : null;
              });
              
              if (pdfUrl) {
                console.log(`   PDF: ${pdfUrl.substring(0, 60)}...`);
              }
              
              // Go back to results
              await page.goBack();
              await page.waitForTimeout(3000);
            }
          }
        } catch (err) {
          console.log(`   Error: ${err.message}`);
        }
        
        state.seenRecordings.push(recordingNumber);
        totalProcessed++;
        
        // Small delay
        await page.waitForTimeout(500);
      }
      
      // Try to go to next page
      const nextLink = page.locator(`a:text-is("${pageNum + 1}")`).first();
      if (await nextLink.count() > 0) {
        await nextLink.click();
        await page.waitForTimeout(3000);
        pageNum++;
      } else {
        hasMore = false;
      }
    }
    
  } catch (err) {
    console.error('Error:', err.message);
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
  
  console.log(`\n✅ Done! Processed ${totalProcessed} records.`);
  return sheriffDeeds;
}

scrape().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
