#!/usr/bin/env node
/**
 * Maricopa County Foreclosure Engine
 * 
 * Standalone system to find sheriff foreclosures.
 * Run daily via cron - handles everything automatically.
 * 
 * Usage: node foreclosure-engine.js [beginDate] [endDate]
 * Example: node foreclosure-engine.js 2025-11-01 2026-03-08
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

// ============ CONFIGURATION ============
const CONFIG = {
  // Date range (can be overridden via command line)
  beginDate: process.argv[2] || getDefaultBeginDate(),
  endDate: process.argv[3] || getDefaultEndDate(),
  
  // Output files
  dataDir: '/home/ubuntu/clawd/data/foreclosures',
  
  // Delays (milliseconds)
  pageLoadDelay: 6000,
  betweenPagesDelay: 3000,
  betweenDocsDelay: 2000,
  
  // Vision API (set your key here or use env var)
  anthropicApiKey: process.env.ANTHROPIC_API_KEY || null,
  visionModel: 'claude-sonnet-4-20250514',
  
  // Search URLs
  searchUrlTemplate: 'https://recorder.maricopa.gov/recording/document-search-results.html?documentTypeSelector=code&documentCode={CODE}&beginDate={BEGIN}&endDate={END}',
  previewUrlTemplate: 'https://recorder.maricopa.gov/recording/document-preview.html?recordingNumber={NUM}&suffix=&pages=7'
};

function getDefaultBeginDate() {
  const d = new Date();
  d.setDate(d.getDate() - 90); // Last 90 days
  return d.toISOString().split('T')[0];
}

function getDefaultEndDate() {
  return new Date().toISOString().split('T')[0];
}

// ============ ENSURE DATA DIR EXISTS ============
if (!fs.existsSync(CONFIG.dataDir)) {
  fs.mkdirSync(CONFIG.dataDir, { recursive: true });
}

// ============ LOGGING ============
function log(msg) {
  const ts = new Date().toISOString();
  console.log(`[${ts}] ${msg}`);
}

// ============ STEP 1: GET ALL DOCUMENT NUMBERS ============
async function getAllDocNumbers(page, docCode) {
  const url = CONFIG.searchUrlTemplate
    .replace('{CODE}', docCode)
    .replace('{BEGIN}', CONFIG.beginDate)
    .replace('{END}', CONFIG.endDate);
  
  log(`Fetching ${docCode} documents...`);
  log(`URL: ${url}`);
  
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForTimeout(CONFIG.pageLoadDelay);
  
  // Get total count
  const bodyText = await page.textContent('body');
  const match = bodyText.match(/of (\d+) results/);
  const expectedTotal = match ? parseInt(match[1]) : 0;
  log(`Expected ${docCode} count: ${expectedTotal}`);
  
  let allDocs = [];
  let seenIds = new Set();
  let pageNum = 1;
  let consecutiveEmpty = 0;
  
  while (consecutiveEmpty < 3 && pageNum <= 50) {
    await page.waitForTimeout(CONFIG.betweenPagesDelay);
    
    // Extract rows from table
    const rows = await page.$$eval('tbody tr', trs => {
      return trs.map(tr => {
        const cells = tr.querySelectorAll('td');
        const recordingNum = cells[0]?.innerText?.trim();
        const recordingDate = cells[1]?.innerText?.trim();
        if (recordingNum && /^\d+$/.test(recordingNum)) {
          return { recordingNum, recordingDate };
        }
        return null;
      }).filter(Boolean);
    });
    
    // Add new docs
    let newCount = 0;
    for (const row of rows) {
      if (!seenIds.has(row.recordingNum)) {
        seenIds.add(row.recordingNum);
        allDocs.push({
          recordingNum: row.recordingNum,
          recordingDate: row.recordingDate,
          docCode: docCode
        });
        newCount++;
      }
    }
    
    log(`  Page ${pageNum}: +${newCount} (total: ${allDocs.length}/${expectedTotal})`);
    
    if (newCount === 0) {
      consecutiveEmpty++;
    } else {
      consecutiveEmpty = 0;
    }
    
    // Check if we have all
    if (allDocs.length >= expectedTotal) {
      break;
    }
    
    // Click Next
    const clicked = await page.evaluate(() => {
      const nextLink = Array.from(document.querySelectorAll('a'))
        .find(a => a.textContent.includes('Next'));
      if (nextLink) {
        nextLink.click();
        return true;
      }
      return false;
    });
    
    if (!clicked) {
      log(`  No more pages`);
      break;
    }
    
    pageNum++;
  }
  
  log(`Collected ${allDocs.length} ${docCode} documents`);
  return allDocs;
}

// ============ STEP 2: CHECK DOCUMENT WITH VISION ============
async function checkDocumentWithVision(page, doc, screenshotDir) {
  const previewUrl = CONFIG.previewUrlTemplate.replace('{NUM}', doc.recordingNum);
  
  try {
    await page.goto(previewUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(CONFIG.pageLoadDelay);
    
    // Take screenshot
    const screenshotPath = path.join(screenshotDir, `${doc.recordingNum}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: false });
    
    // If no API key, save for manual review
    if (!CONFIG.anthropicApiKey) {
      return { needsManualReview: true, screenshotPath };
    }
    
    // Call vision API
    const imageBase64 = fs.readFileSync(screenshotPath).toString('base64');
    const isSheriff = await callVisionAPI(imageBase64);
    
    // Delete screenshot if not a match (save space)
    if (!isSheriff) {
      fs.unlinkSync(screenshotPath);
    }
    
    return { isSheriff, screenshotPath: isSheriff ? screenshotPath : null };
    
  } catch (err) {
    return { error: err.message };
  }
}

async function callVisionAPI(imageBase64) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': CONFIG.anthropicApiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: CONFIG.visionModel,
      max_tokens: 50,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: 'image/png', data: imageBase64 }
          },
          {
            type: 'text',
            text: 'Is this a SHERIFF\'S DEED or SHERIFF\'S CERTIFICATE OF SALE document? Answer only YES or NO.'
          }
        ]
      }]
    })
  });
  
  const data = await response.json();
  const answer = data.content?.[0]?.text?.toUpperCase() || '';
  return answer.includes('YES');
}

// ============ STEP 3: MAIN ENGINE ============
async function runEngine() {
  log('='.repeat(60));
  log('MARICOPA FORECLOSURE ENGINE');
  log('='.repeat(60));
  log(`Date range: ${CONFIG.beginDate} to ${CONFIG.endDate}`);
  log(`Data directory: ${CONFIG.dataDir}`);
  log(`Vision API: ${CONFIG.anthropicApiKey ? 'Configured' : 'NOT SET - will save for manual review'}`);
  log('');
  
  // Create run directory
  const runId = new Date().toISOString().replace(/[:.]/g, '-');
  const runDir = path.join(CONFIG.dataDir, runId);
  const screenshotDir = path.join(runDir, 'screenshots');
  fs.mkdirSync(screenshotDir, { recursive: true });
  
  // Progress file (for resume capability)
  const progressFile = path.join(runDir, 'progress.json');
  let progress = {
    startedAt: new Date().toISOString(),
    config: CONFIG,
    checked: [],
    matches: [],
    errors: []
  };
  
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 1024 }
  });
  
  const page = await context.newPage();
  
  try {
    // STEP 1: Get all document numbers
    log('STEP 1: Collecting document numbers');
    log('-'.repeat(40));
    
    const ceDocs = await getAllDocNumbers(page, 'CE');
    const deDocs = await getAllDocNumbers(page, 'DE');
    const allDocs = [...ceDocs, ...deDocs];
    
    log('');
    log(`Total documents to check: ${allDocs.length}`);
    log(`  CE (Certificates): ${ceDocs.length}`);
    log(`  DE (Deeds): ${deDocs.length}`);
    
    // Save document list
    const docListFile = path.join(runDir, 'all-documents.json');
    fs.writeFileSync(docListFile, JSON.stringify(allDocs, null, 2));
    log(`Saved document list to: ${docListFile}`);
    
    // STEP 2: Check each document
    log('');
    log('STEP 2: Checking documents for sheriff foreclosures');
    log('-'.repeat(40));
    
    for (let i = 0; i < allDocs.length; i++) {
      const doc = allDocs[i];
      const pct = ((i + 1) / allDocs.length * 100).toFixed(1);
      
      process.stdout.write(`[${i + 1}/${allDocs.length}] (${pct}%) ${doc.recordingNum}... `);
      
      const result = await checkDocumentWithVision(page, doc, screenshotDir);
      
      if (result.error) {
        console.log(`ERROR: ${result.error.substring(0, 40)}`);
        progress.errors.push({ ...doc, error: result.error });
      } else if (result.needsManualReview) {
        console.log('saved for review');
        progress.matches.push({ ...doc, needsReview: true, screenshotPath: result.screenshotPath });
      } else if (result.isSheriff) {
        console.log('✓ SHERIFF FORECLOSURE');
        progress.matches.push({
          ...doc,
          previewUrl: CONFIG.previewUrlTemplate.replace('{NUM}', doc.recordingNum),
          screenshotPath: result.screenshotPath
        });
      } else {
        console.log('skip');
      }
      
      progress.checked.push(doc.recordingNum);
      
      // Save progress every 10 docs
      if ((i + 1) % 10 === 0) {
        fs.writeFileSync(progressFile, JSON.stringify(progress, null, 2));
      }
      
      await page.waitForTimeout(CONFIG.betweenDocsDelay);
    }
    
    // STEP 3: Final output
    progress.completedAt = new Date().toISOString();
    fs.writeFileSync(progressFile, JSON.stringify(progress, null, 2));
    
    // Save matches as CSV
    const csvFile = path.join(runDir, 'sheriff-foreclosures.csv');
    let csv = 'Recording Number,Recording Date,Doc Code,Preview URL\n';
    progress.matches.forEach(m => {
      const url = CONFIG.previewUrlTemplate.replace('{NUM}', m.recordingNum);
      csv += `${m.recordingNum},${m.recordingDate},${m.docCode},${url}\n`;
    });
    fs.writeFileSync(csvFile, csv);
    
    // Summary
    log('');
    log('='.repeat(60));
    log('COMPLETE');
    log('='.repeat(60));
    log(`Total checked: ${progress.checked.length}`);
    log(`Sheriff foreclosures found: ${progress.matches.length}`);
    log(`Errors: ${progress.errors.length}`);
    log('');
    log(`Results saved to: ${runDir}`);
    log(`  - all-documents.json (${allDocs.length} docs)`);
    log(`  - sheriff-foreclosures.csv (${progress.matches.length} matches)`);
    log(`  - progress.json (full details)`);
    
    if (progress.matches.length > 0) {
      log('');
      log('Sheriff Foreclosures:');
      progress.matches.forEach((m, i) => {
        log(`  ${i + 1}. ${m.recordingNum} | ${m.recordingDate} | ${m.docCode}`);
      });
    }
    
  } catch (error) {
    log(`FATAL ERROR: ${error.message}`);
    progress.fatalError = error.message;
    fs.writeFileSync(progressFile, JSON.stringify(progress, null, 2));
  } finally {
    await browser.close();
  }
  
  return progress;
}

// ============ RUN ============
runEngine().then(progress => {
  process.exit(progress.fatalError ? 1 : 0);
}).catch(err => {
  console.error('Unhandled error:', err);
  process.exit(1);
});
