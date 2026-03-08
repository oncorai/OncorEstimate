#!/usr/bin/env node
/**
 * Sheriff Deed Monitor - Daily cron job
 * Checks Maricopa County for new sheriff deeds and alerts via Telegram
 */

const { chromium } = require('playwright');
const fs = require('fs');
const { execSync } = require('child_process');
const path = require('path');

const CONFIG = {
  previewUrl: 'https://recorder.maricopa.gov/recording/document-preview.html',
  searchUrl: 'https://recorder.maricopa.gov/recording/document-search-results.html',
  outputDir: './sheriff-deeds',
  csvFile: './sheriff-deeds-2026.csv',
  stateFile: './sheriff-deeds-state.json',
  daysBack: 7, // Check last 7 days
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

function extractInfo(ocrText, recordingNumber) {
  const info = {
    recordingNumber,
    dateFiled: new Date().toISOString().split('T')[0],
    address: '',
    caseNumber: '',
  };
  
  // Extract case number
  const caseMatch = ocrText.match(/CV\d{4}-\d+/i);
  if (caseMatch) info.caseNumber = caseMatch[0];
  
  // Try to extract address (look for common patterns)
  const addressPatterns = [
    /(\d+\s+[NSEW]\.?\s+\w+(?:\s+\w+)*(?:\s+(?:St|Street|Ave|Avenue|Rd|Road|Dr|Drive|Blvd|Boulevard|Ln|Lane|Way|Ct|Court|Pl|Place)\.?))/i,
    /(\d+\s+\w+(?:\s+\w+)*(?:\s+(?:St|Street|Ave|Avenue|Rd|Road|Dr|Drive|Blvd|Boulevard|Ln|Lane|Way|Ct|Court|Pl|Place)\.?),?\s*(?:Phoenix|Mesa|Tempe|Scottsdale|Chandler|Gilbert|Glendale|Peoria|Surprise|Avondale|Goodyear|Buckeye|Casa Grande|Maricopa|Queen Creek|Apache Junction|Fountain Hills|Paradise Valley|Litchfield Park|El Mirage|Tolleson|Youngtown|Guadalupe))/i,
  ];
  
  for (const pattern of addressPatterns) {
    const match = ocrText.match(pattern);
    if (match) {
      info.address = match[1].trim();
      break;
    }
  }
  
  return info;
}

function appendToCSV(deed) {
  const row = [
    deed.dateFiled,
    `${CONFIG.previewUrl}?recordingNumber=${deed.recordingNumber}&suffix=&pages=1`,
    deed.address,
    deed.caseNumber,
  ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(',');
  
  fs.appendFileSync(CONFIG.csvFile, '\n' + row);
}

async function monitor() {
  console.log('🔍 Sheriff Deed Monitor Starting...');
  console.log(`Time: ${new Date().toISOString()}`);
  
  const state = loadState();
  
  // Calculate date range (last N days)
  const endDate = new Date().toISOString().split('T')[0];
  const startDate = new Date(Date.now() - CONFIG.daysBack * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  
  console.log(`Checking: ${startDate} to ${endDate}\n`);
  
  const browser = await chromium.launch({ 
    headless: true,
    args: ['--disable-blink-features=AutomationControlled']
  });
  
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
  });
  
  const page = await context.newPage();
  page.setDefaultTimeout(30000);
  
  const newDeeds = [];
  
  try {
    // Search for recent deeds
    const searchParams = new URLSearchParams({
      lastNames: '',
      firstNames: '',
      middleNameIs: '',
      documentTypeSelector: 'code',
      documentCode: 'DE',
      beginDate: startDate,
      endDate: endDate,
    });
    
    const fullUrl = `${CONFIG.searchUrl}?${searchParams}`;
    console.log('Loading search results...');
    await page.goto(fullUrl, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(3000);
    
    // Collect recording numbers from first few pages
    const recordings = [];
    let pageNum = 1;
    const maxPages = 5;
    
    while (pageNum <= maxPages) {
      const pageRecordings = await page.evaluate(() => {
        const nums = [];
        document.querySelectorAll('table tbody tr td:first-child').forEach(cell => {
          const text = cell.textContent?.trim();
          if (text && /^\d{10,}$/.test(text)) nums.push(text);
        });
        return nums;
      });
      
      recordings.push(...pageRecordings);
      console.log(`Page ${pageNum}: ${pageRecordings.length} records`);
      
      const nextLink = page.locator(`a:text-is("${pageNum + 1}")`).first();
      if (await nextLink.count() > 0 && pageNum < maxPages) {
        await nextLink.click();
        await page.waitForTimeout(2000);
        pageNum++;
      } else {
        break;
      }
    }
    
    // Filter to only new recordings
    const newRecordings = [...new Set(recordings)].filter(r => !state.seenRecordings.includes(r));
    console.log(`\nNew records to check: ${newRecordings.length}\n`);
    
    if (newRecordings.length === 0) {
      console.log('✅ No new recordings to check');
      await browser.close();
      saveState(state);
      return [];
    }
    
    // Check each new recording
    for (let i = 0; i < newRecordings.length; i++) {
      const recordingNumber = newRecordings[i];
      process.stdout.write(`[${i + 1}/${newRecordings.length}] ${recordingNumber}... `);
      
      try {
        const previewUrl = `${CONFIG.previewUrl}?recordingNumber=${recordingNumber}&suffix=&pages=1`;
        await page.goto(previewUrl, { waitUntil: 'networkidle', timeout: 20000 });
        await page.waitForTimeout(1500);
        
        const screenshotPath = path.join(CONFIG.outputDir, `temp-${recordingNumber}.png`);
        const docElement = await page.$('canvas, img[src*="recdoc"], .document-image, #documentImage, .page-image');
        
        if (docElement) {
          await docElement.screenshot({ path: screenshotPath });
        } else {
          await page.screenshot({ path: screenshotPath });
        }
        
        const ocrText = ocrImage(screenshotPath);
        
        if (/sheriff'?s?\s*deed/i.test(ocrText)) {
          console.log('✓ SHERIFF DEED!');
          const info = extractInfo(ocrText, recordingNumber);
          newDeeds.push(info);
          state.sheriffDeeds.push(recordingNumber);
          appendToCSV(info);
          fs.renameSync(screenshotPath, path.join(CONFIG.outputDir, `${recordingNumber}.png`));
        } else {
          console.log('not sheriff');
          try { fs.unlinkSync(screenshotPath); } catch {}
        }
        
      } catch (err) {
        console.log(`error: ${err.message.substring(0, 40)}`);
      }
      
      state.seenRecordings.push(recordingNumber);
    }
    
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await browser.close();
    saveState(state);
  }
  
  // Output results for cron to pick up
  if (newDeeds.length > 0) {
    console.log(`\n🎯 FOUND ${newDeeds.length} NEW SHERIFF DEED(S)!`);
    newDeeds.forEach(d => {
      console.log(`  - ${d.recordingNumber}: ${d.caseNumber || 'N/A'}`);
      console.log(`    ${CONFIG.previewUrl}?recordingNumber=${d.recordingNumber}&suffix=&pages=1`);
    });
    
    // Output JSON for Clawdbot to parse
    console.log('\n---SHERIFF_DEEDS_JSON---');
    console.log(JSON.stringify(newDeeds));
    console.log('---END_JSON---');
  } else {
    console.log('\n✅ No new sheriff deeds found');
  }
  
  return newDeeds;
}

monitor().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
