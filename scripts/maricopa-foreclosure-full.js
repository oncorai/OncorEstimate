#!/usr/bin/env node
/**
 * Maricopa County Foreclosure Scraper
 * 
 * 1. Gets all DE (deeds) and CE (certificates) from recorder
 * 2. Checks each PDF preview for sheriff foreclosure keywords
 * 3. Saves matches
 */

const { chromium } = require('playwright');
const fs = require('fs');

const BEGIN_DATE = process.argv[2] || '2025-11-01';
const END_DATE = process.argv[3] || '2026-03-08';
const OUTPUT_FILE = '/home/ubuntu/clawd/data/maricopa-sheriff-foreclosures.json';
const PROGRESS_FILE = '/home/ubuntu/clawd/data/foreclosure-progress.json';

async function getAllDocNumbers(page, docCode, beginDate, endDate) {
  const url = `https://recorder.maricopa.gov/recording/document-search-results.html?documentTypeSelector=code&documentCode=${docCode}&beginDate=${beginDate}&endDate=${endDate}`;
  
  console.log(`\nSearching ${docCode}...`);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForTimeout(8000);
  
  const bodyText = await page.textContent('body');
  const match = bodyText.match(/of (\d+) results/);
  const total = match ? parseInt(match[1]) : 0;
  console.log(`Total ${docCode}: ${total}`);
  
  let allDocs = [];
  let seenIds = new Set();
  let pageNum = 1;
  let consecutiveEmpty = 0;
  
  while (consecutiveEmpty < 3 && pageNum <= 30) {
    await page.waitForTimeout(2000);
    
    const rows = await page.$$eval('tbody tr', trs => {
      return trs.map(tr => {
        const cells = tr.querySelectorAll('td');
        const num = cells[0]?.innerText?.trim();
        const date = cells[1]?.innerText?.trim();
        if (num && /^\d+$/.test(num)) return { num, date };
        return null;
      }).filter(Boolean);
    });
    
    let newCount = 0;
    for (const r of rows) {
      if (!seenIds.has(r.num)) {
        seenIds.add(r.num);
        allDocs.push({ ...r, docCode });
        newCount++;
      }
    }
    
    process.stdout.write(`  Page ${pageNum}: +${newCount} (${allDocs.length}/${total})\r`);
    
    if (newCount === 0) consecutiveEmpty++;
    else consecutiveEmpty = 0;
    
    if (allDocs.length >= total) break;
    
    const clicked = await page.evaluate(() => {
      const next = Array.from(document.querySelectorAll('a')).find(a => a.textContent.includes('Next'));
      if (next) { next.click(); return true; }
      return false;
    });
    if (!clicked) break;
    
    await page.waitForTimeout(3000);
    pageNum++;
  }
  
  console.log(`\n  Got ${allDocs.length} ${docCode} documents`);
  return allDocs;
}

async function checkDocForSheriff(page, docNum) {
  const url = `https://recorder.maricopa.gov/recording/document-preview.html?recordingNumber=${docNum}&suffix=&pages=7`;
  
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(5000);
    
    // Wait for document to render
    try {
      await page.waitForSelector('#documentSearchPreviewModule', { timeout: 10000 });
      await page.waitForTimeout(2000);
    } catch (e) {}
    
    // Get all visible text
    const pageText = await page.evaluate(() => {
      return document.body.innerText.toLowerCase();
    });
    
    // Check for sheriff keywords
    const isSheriff = 
      pageText.includes('sheriff') ||
      pageText.includes('foreclosure') ||
      pageText.includes('sheriff\'s deed') ||
      pageText.includes('sheriffs deed') ||
      pageText.includes('certificate of sale');
    
    // If text-based check isn't conclusive, take screenshot for manual review
    if (isSheriff) {
      return { match: true, method: 'text' };
    }
    
    return { match: false };
    
  } catch (err) {
    return { match: false, error: err.message.substring(0, 50) };
  }
}

async function main() {
  console.log('=== Maricopa Foreclosure Scraper ===');
  console.log(`Date range: ${BEGIN_DATE} to ${END_DATE}\n`);
  
  const browser = await chromium.launch({ 
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    viewport: { width: 1280, height: 1024 }
  });
  
  const page = await context.newPage();
  
  // Load progress if exists
  let progress = { checked: [], matches: [] };
  if (fs.existsSync(PROGRESS_FILE)) {
    progress = JSON.parse(fs.readFileSync(PROGRESS_FILE));
    console.log(`Resuming: ${progress.checked.length} already checked, ${progress.matches.length} matches`);
  }
  const checkedSet = new Set(progress.checked);
  
  try {
    // Step 1: Get all document numbers
    console.log('=== Step 1: Getting document numbers ===');
    
    const deDocs = await getAllDocNumbers(page, 'DE', BEGIN_DATE, END_DATE);
    const ceDocs = await getAllDocNumbers(page, 'CE', BEGIN_DATE, END_DATE);
    
    const allDocs = [...deDocs, ...ceDocs];
    console.log(`\nTotal documents to check: ${allDocs.length}`);
    
    // Filter out already checked
    const toCheck = allDocs.filter(d => !checkedSet.has(d.num));
    console.log(`New documents to check: ${toCheck.length}\n`);
    
    // Step 2: Check each document
    console.log('=== Step 2: Checking documents for sheriff foreclosures ===\n');
    
    let matchCount = progress.matches.length;
    
    for (let i = 0; i < toCheck.length; i++) {
      const doc = toCheck[i];
      process.stdout.write(`[${i+1}/${toCheck.length}] ${doc.num} (${doc.date})... `);
      
      const result = await checkDocForSheriff(page, doc.num);
      
      if (result.error) {
        console.log(`error: ${result.error}`);
      } else if (result.match) {
        console.log('✓ SHERIFF FORECLOSURE');
        progress.matches.push({
          recordingNumber: doc.num,
          recordingDate: doc.date,
          docCode: doc.docCode,
          previewUrl: `https://recorder.maricopa.gov/recording/document-preview.html?recordingNumber=${doc.num}&suffix=&pages=7`
        });
        matchCount++;
      } else {
        console.log('skip');
      }
      
      progress.checked.push(doc.num);
      
      // Save progress every 10 docs
      if (i % 10 === 0) {
        fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
      }
      
      // Delay to avoid rate limiting
      await page.waitForTimeout(1500);
    }
    
    // Final save
    fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
    
    // Save matches
    const output = {
      scrapedAt: new Date().toISOString(),
      dateRange: { begin: BEGIN_DATE, end: END_DATE },
      totalChecked: progress.checked.length,
      matches: progress.matches
    };
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));
    
    console.log(`\n${'='.repeat(50)}`);
    console.log(`COMPLETE: ${matchCount} sheriff foreclosures found`);
    console.log(`${'='.repeat(50)}\n`);
    
    if (progress.matches.length > 0) {
      console.log('Sheriff Foreclosures:');
      progress.matches.forEach((m, i) => {
        console.log(`${i+1}. ${m.recordingNumber} | ${m.recordingDate} | ${m.docCode}`);
      });
    }
    
    console.log(`\nResults saved to: ${OUTPUT_FILE}`);
    
  } catch (error) {
    console.error('\nError:', error.message);
    fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
  } finally {
    await browser.close();
  }
}

main().catch(console.error);
