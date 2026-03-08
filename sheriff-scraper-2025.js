const { chromium } = require('playwright');
const fs = require('fs');
const { execSync } = require('child_process');
const path = require('path');

const CONFIG = {
  searchUrl: 'https://recorder.maricopa.gov/recording/document-search-results.html',
  previewUrl: 'https://recorder.maricopa.gov/recording/document-preview.html',
  outputDir: './sheriff-deeds',
  csvFile: './sheriff-deeds-2025.csv',
  stateFile: './sheriff-deeds-state-2025.json',
  maxPages: 50,
  startDate: '2025-01-01',
  endDate: '2025-12-31',
};

if (!fs.existsSync(CONFIG.outputDir)) fs.mkdirSync(CONFIG.outputDir, { recursive: true });

function loadState() {
  try { return JSON.parse(fs.readFileSync(CONFIG.stateFile, 'utf8')); }
  catch { return { seenRecordings: [], sheriffDeeds: [], lastRun: null }; }
}

function saveState(state) {
  state.lastRun = new Date().toISOString();
  fs.writeFileSync(CONFIG.stateFile, JSON.stringify(state, null, 2));
}

function ocrImage(imgPath) {
  try { return execSync(`tesseract "${imgPath}" stdout 2>/dev/null`, { timeout: 60000 }).toString(); }
  catch { return ''; }
}

function extractInfo(ocrText, recordingNumber) {
  const info = { recordingNumber, dateFiled: '', address: '', caseNumber: '' };
  const caseMatch = ocrText.match(/CV\d{4}-\d+/i);
  if (caseMatch) info.caseNumber = caseMatch[0];
  return info;
}

function appendToCSV(deed) {
  const row = [deed.dateFiled, `${CONFIG.previewUrl}?recordingNumber=${deed.recordingNumber}&suffix=&pages=1`, deed.address, deed.caseNumber]
    .map(v => `"${String(v).replace(/"/g, '""')}"`).join(',');
  
  if (!fs.existsSync(CONFIG.csvFile)) {
    fs.writeFileSync(CONFIG.csvFile, 'DATE FILED,Deed Link,ADDRESS,Case Number\n');
  }
  fs.appendFileSync(CONFIG.csvFile, row + '\n');
}

async function scrape() {
  console.log('🔍 Sheriff Deed Scraper (2025) Starting...');
  console.log(`Date range: ${CONFIG.startDate} to ${CONFIG.endDate}\n`);
  
  const state = loadState();
  const browser = await chromium.launch({ headless: true, args: ['--disable-blink-features=AutomationControlled'] });
  const context = await browser.newContext({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' });
  const page = await context.newPage();
  page.setDefaultTimeout(60000);
  
  const sheriffDeeds = [];
  let totalProcessed = 0;
  
  try {
    const searchParams = new URLSearchParams({
      lastNames: '', firstNames: '', middleNameIs: '',
      documentTypeSelector: 'code', documentCode: 'DE',
      beginDate: CONFIG.startDate, endDate: CONFIG.endDate,
    });
    
    console.log('📄 Loading search results...');
    await page.goto(`${CONFIG.searchUrl}?${searchParams}`, { waitUntil: 'networkidle', timeout: 90000 });
    await page.waitForTimeout(5000);
    
    const allRecordings = [];
    let pageNum = 1;
    
    while (pageNum <= CONFIG.maxPages) {
      console.log(`📄 Page ${pageNum}...`);
      await page.waitForTimeout(2000);
      
      const recordings = await page.evaluate(() => {
        const nums = [];
        document.querySelectorAll('table tbody tr td:first-child').forEach(cell => {
          const text = cell.textContent?.trim();
          if (text && /^\d{10,}$/.test(text)) nums.push(text);
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
      } else break;
    }
    
    const uniqueRecordings = [...new Set(allRecordings)];
    const newRecordings = uniqueRecordings.filter(r => !state.seenRecordings.includes(r));
    
    console.log(`\n📊 Total: ${uniqueRecordings.length}, New: ${newRecordings.length}\n`);
    
    if (newRecordings.length === 0) {
      console.log('✅ No new recordings');
      await browser.close();
      saveState(state);
      return [];
    }
    
    console.log('🔎 Checking documents...\n');
    
    for (let i = 0; i < newRecordings.length; i++) {
      const recordingNumber = newRecordings[i];
      process.stdout.write(`[${i + 1}/${newRecordings.length}] ${recordingNumber}... `);
      
      try {
        const previewUrl = `${CONFIG.previewUrl}?recordingNumber=${recordingNumber}&suffix=&pages=1`;
        await page.goto(previewUrl, { waitUntil: 'networkidle', timeout: 30000 });
        await page.waitForTimeout(2000);
        
        const screenshotPath = path.join(CONFIG.outputDir, `temp-${recordingNumber}.png`);
        const docElement = await page.$('canvas, img[src*="recdoc"], .document-image, #documentImage, .page-image');
        
        if (docElement) await docElement.screenshot({ path: screenshotPath });
        else await page.screenshot({ path: screenshotPath });
        
        const ocrText = ocrImage(screenshotPath);
        
        if (/sheriff'?s?\s*deed/i.test(ocrText)) {
          console.log('✓ SHERIFF DEED!');
          const info = extractInfo(ocrText, recordingNumber);
          sheriffDeeds.push(info);
          state.sheriffDeeds.push(recordingNumber);
          appendToCSV(info);
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
      if (totalProcessed % 10 === 0) saveState(state);
    }
    
  } catch (err) {
    console.error('\nError:', err.message);
  } finally {
    await browser.close();
    saveState(state);
  }
  
  if (sheriffDeeds.length > 0) {
    console.log(`\n🎯 Found ${sheriffDeeds.length} Sheriff Deed(s)!`);
    sheriffDeeds.forEach(d => console.log(`   - ${d.recordingNumber}: ${d.caseNumber || 'N/A'}`));
  } else {
    console.log('\n📭 No Sheriff Deeds found');
  }
  
  console.log(`\n✅ Done! Processed ${totalProcessed} records.`);
  return sheriffDeeds;
}

scrape().catch(err => { console.error('Fatal:', err); process.exit(1); });
