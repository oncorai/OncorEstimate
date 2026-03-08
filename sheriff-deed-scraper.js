const { chromium } = require('playwright');
const fs = require('fs');
const { execSync } = require('child_process');
const path = require('path');

// Config
const CONFIG = {
  searchUrl: 'https://recorder.maricopa.gov/recording/document-search-results.html',
  pdfBaseUrl: 'https://legacy.recorder.maricopa.gov/UnOfficialDocs/pdf/',
  outputDir: './sheriff-deeds',
  csvFile: './sheriff-deeds.csv',
  stateFile: './sheriff-deeds-state.json',
  maxPages: 100, // Max result pages to scrape
  startDate: '2025-01-01',
  endDate: null, // null = today
};

// Ensure output directory exists
if (!fs.existsSync(CONFIG.outputDir)) {
  fs.mkdirSync(CONFIG.outputDir, { recursive: true });
}

// Load state (previously seen recording numbers)
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

// OCR a PDF and check if it's a sheriff's deed
async function checkIfSheriffDeed(recordingNumber) {
  const pdfUrl = `${CONFIG.pdfBaseUrl}${recordingNumber}.pdf`;
  const pdfPath = path.join(CONFIG.outputDir, `${recordingNumber}.pdf`);
  const imgPath = path.join(CONFIG.outputDir, `${recordingNumber}`);
  
  try {
    // Download PDF with proper headers to bypass Cloudflare
    execSync(`curl -sL "${pdfUrl}" -o "${pdfPath}" -H "User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36" -H "Referer: https://recorder.maricopa.gov/"`, { timeout: 30000 });
    
    // Check if valid PDF
    const fileInfo = execSync(`file "${pdfPath}"`).toString();
    if (!fileInfo.includes('PDF')) {
      console.log(`  ${recordingNumber}: Not a valid PDF`);
      fs.unlinkSync(pdfPath);
      return null;
    }
    
    // Convert to image and OCR
    execSync(`pdftoppm "${pdfPath}" "${imgPath}" -png -f 1 -l 1`, { timeout: 30000 });
    const imgFile = `${imgPath}-1.png`;
    
    if (!fs.existsSync(imgFile)) {
      console.log(`  ${recordingNumber}: Could not convert PDF`);
      fs.unlinkSync(pdfPath);
      return null;
    }
    
    const ocrText = execSync(`tesseract "${imgFile}" stdout 2>/dev/null`, { timeout: 60000 }).toString();
    
    // Clean up image
    fs.unlinkSync(imgFile);
    
    // Check for sheriff's deed (case insensitive, handle OCR variations)
    const isSherifffDeed = /sheriff'?s?\s*deed/i.test(ocrText);
    
    if (isSherifffDeed) {
      console.log(`  ✓ ${recordingNumber}: SHERIFF'S DEED FOUND`);
      
      // Extract additional info from OCR text
      const info = extractDeedInfo(ocrText, recordingNumber);
      
      // Keep the PDF
      return info;
    } else {
      // Not a sheriff deed, delete PDF
      fs.unlinkSync(pdfPath);
      return null;
    }
  } catch (err) {
    console.log(`  ${recordingNumber}: Error - ${err.message}`);
    // Clean up on error
    try { fs.unlinkSync(pdfPath); } catch {}
    try { fs.unlinkSync(`${imgPath}-1.png`); } catch {}
    return null;
  }
}

// Extract info from OCR text
function extractDeedInfo(text, recordingNumber) {
  const info = {
    recordingNumber,
    pdfUrl: `${CONFIG.pdfBaseUrl}${recordingNumber}.pdf`,
    foundDate: new Date().toISOString().split('T')[0],
  };
  
  // Try to extract case number (CV2019-004568 format)
  const caseMatch = text.match(/CV\d{4}-\d+/i);
  if (caseMatch) info.caseNumber = caseMatch[0];
  
  // Try to extract plaintiff
  const plaintiffMatch = text.match(/([A-Z][A-Z\s&,.']+(?:ASSOCIATION|LLC|INC|BANK|CORP)[A-Z\s,.]*),?\s*(?:an?\s*)?(?:Arizona|plaintiff)/i);
  if (plaintiffMatch) info.plaintiff = plaintiffMatch[1].trim();
  
  // Try to extract defendant/property owner
  const defMatch = text.match(/vs\.?\s*\n?\s*([A-Z][A-Z\s,.']+)/i);
  if (defMatch) info.defendant = defMatch[1].trim().split('\n')[0];
  
  // Try to extract property address or description
  const propMatch = text.match(/(?:property|located|address)[:\s]*([^\n]+)/i);
  if (propMatch) info.property = propMatch[1].trim();
  
  // Extract first 500 chars of OCR for reference
  info.ocrExcerpt = text.substring(0, 500).replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
  
  return info;
}

// Main scraper
async function scrape() {
  console.log('🔍 Sheriff Deed Scraper Starting...');
  console.log(`   Date range: ${CONFIG.startDate} to ${CONFIG.endDate || 'today'}`);
  
  const state = loadState();
  const endDate = CONFIG.endDate || new Date().toISOString().split('T')[0];
  
  const searchParams = new URLSearchParams({
    lastNames: '',
    firstNames: '',
    middleNameIs: '',
    documentTypeSelector: 'code',
    documentCode: 'DE', // Deeds
    beginDate: CONFIG.startDate,
    endDate: endDate,
  });
  
  const fullUrl = `${CONFIG.searchUrl}?${searchParams}`;
  console.log(`   URL: ${fullUrl}\n`);
  
  const browser = await chromium.launch({ 
    headless: false, // Need real browser for Cloudflare
    args: ['--disable-blink-features=AutomationControlled']
  });
  
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
  });
  
  const page = await context.newPage();
  page.setDefaultTimeout(60000);
  
  const allRecordingNumbers = [];
  
  try {
    console.log('📄 Loading search results...');
    await page.goto(fullUrl, { waitUntil: 'networkidle', timeout: 90000 });
    await page.waitForTimeout(5000);
    
    // Get total pages
    let totalPages = 1;
    try {
      totalPages = await page.evaluate(() => {
        const pageLinks = document.querySelectorAll('.pagination a, .page-link, [class*="page"] a');
        let max = 1;
        pageLinks.forEach(a => {
          const num = parseInt(a.textContent);
          if (!isNaN(num) && num > max) max = num;
        });
        return max;
      });
    } catch {}
    
    console.log(`   Found ${totalPages} page(s) of results`);
    totalPages = Math.min(totalPages, CONFIG.maxPages);
    
    // Extract recording numbers from all pages
    for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
      console.log(`\n📄 Page ${pageNum}/${totalPages}`);
      
      const recordings = await page.evaluate(() => {
        const nums = [];
        // Try multiple selectors for different table structures
        const cells = document.querySelectorAll('table tbody tr td:first-child, .result-row .recording-number, [data-recording]');
        cells.forEach(cell => {
          const text = cell.textContent?.trim();
          // Recording numbers are typically numeric, 10+ digits
          if (text && /^\d{8,}$/.test(text)) {
            nums.push(text);
          }
        });
        // Also check links
        const links = document.querySelectorAll('a[href*="recording"], a[href*="document"]');
        links.forEach(link => {
          const match = link.href.match(/(\d{10,})/);
          if (match) nums.push(match[1]);
          const text = link.textContent?.trim();
          if (text && /^\d{8,}$/.test(text)) nums.push(text);
        });
        return [...new Set(nums)];
      });
      
      console.log(`   Found ${recordings.length} recording numbers`);
      allRecordingNumbers.push(...recordings);
      
      // Go to next page if not last
      if (pageNum < totalPages) {
        const nextPage = pageNum + 1;
        const nextLink = page.locator(`a:text-is("${nextPage}")`).first();
        if (await nextLink.count() > 0) {
          await nextLink.click();
          await page.waitForTimeout(3000);
        } else {
          console.log('   Could not find next page link, stopping pagination');
          break;
        }
      }
    }
    
  } catch (err) {
    console.error('Error scraping results:', err.message);
  } finally {
    await browser.close();
  }
  
  // Deduplicate
  const uniqueRecordings = [...new Set(allRecordingNumbers)];
  console.log(`\n📊 Total unique recording numbers: ${uniqueRecordings.length}`);
  
  // Filter out already processed
  const newRecordings = uniqueRecordings.filter(r => !state.seenRecordings.includes(r));
  console.log(`   New recordings to process: ${newRecordings.length}`);
  
  if (newRecordings.length === 0) {
    console.log('\n✅ No new recordings to process');
    saveState(state);
    return [];
  }
  
  // Process each recording
  console.log('\n🔎 Checking PDFs for Sheriff Deeds...\n');
  const sheriffDeeds = [];
  
  for (let i = 0; i < newRecordings.length; i++) {
    const recording = newRecordings[i];
    process.stdout.write(`[${i + 1}/${newRecordings.length}] Checking ${recording}...`);
    
    const result = await checkIfSheriffDeed(recording);
    if (result) {
      sheriffDeeds.push(result);
    } else {
      process.stdout.write(' not a sheriff deed\n');
    }
    
    // Mark as seen
    state.seenRecordings.push(recording);
    
    // Small delay to be nice to the server
    await new Promise(r => setTimeout(r, 500));
  }
  
  // Save state
  saveState(state);
  
  // Update CSV
  if (sheriffDeeds.length > 0) {
    updateCSV(sheriffDeeds);
    console.log(`\n🎯 Found ${sheriffDeeds.length} new Sheriff Deed(s)!`);
  } else {
    console.log('\n📭 No new Sheriff Deeds found');
  }
  
  return sheriffDeeds;
}

// Update CSV file
function updateCSV(newDeeds) {
  const headers = ['Recording Number', 'Case Number', 'Plaintiff', 'Defendant', 'Property', 'PDF URL', 'Found Date'];
  
  let existingData = [];
  if (fs.existsSync(CONFIG.csvFile)) {
    const content = fs.readFileSync(CONFIG.csvFile, 'utf8');
    const lines = content.trim().split('\n');
    if (lines.length > 1) {
      existingData = lines.slice(1); // Skip header
    }
  }
  
  const newRows = newDeeds.map(d => [
    d.recordingNumber || '',
    d.caseNumber || '',
    d.plaintiff || '',
    d.defendant || '',
    d.property || '',
    d.pdfUrl || '',
    d.foundDate || '',
  ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','));
  
  const allRows = [headers.join(','), ...existingData, ...newRows];
  fs.writeFileSync(CONFIG.csvFile, allRows.join('\n'));
  console.log(`   Updated ${CONFIG.csvFile}`);
}

// Run
scrape().then(results => {
  if (results.length > 0) {
    console.log('\n📋 New Sheriff Deeds:');
    results.forEach(d => {
      console.log(`   - ${d.recordingNumber}: ${d.caseNumber || 'N/A'}`);
    });
  }
  console.log('\n✅ Done!');
}).catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
