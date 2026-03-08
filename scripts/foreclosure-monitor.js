#!/usr/bin/env node
/**
 * Maricopa County Foreclosure Monitor
 * 
 * Runs daily to check for new Sheriff foreclosure documents.
 * Notifies via Telegram when new foreclosures are found.
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const DATA_DIR = '/home/ubuntu/clawd/data';
const HISTORY_FILE = path.join(DATA_DIR, 'foreclosure-history.json');
const RESULTS_FILE = path.join(DATA_DIR, 'maricopa-foreclosures.json');

// Get date range (last 90 days to catch anything missed)
function getDateRange() {
  const end = new Date();
  const begin = new Date();
  begin.setDate(begin.getDate() - 90);
  
  const format = d => {
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const y = d.getFullYear();
    return `${y}-${m}-${dd}`;
  };
  
  return { begin: format(begin), end: format(end) };
}

async function scrapeForeclosures() {
  const { begin, end } = getDateRange();
  console.log(`Scraping foreclosures: ${begin} to ${end}`);
  
  const browser = await chromium.launch({ 
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
  });
  
  const page = await context.newPage();
  let foreclosures = [];
  
  try {
    const searchUrl = `https://recorder.maricopa.gov/recording/document-search-results.html?lastNames=SHERIFF+OF+MARICOPA+COUNTY&documentTypeSelector=all&beginDate=${begin}&endDate=${end}`;
    
    await page.goto(searchUrl, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(5000);
    
    // Paginate through all results
    let allResults = [];
    let seenIds = new Set();
    let hasMore = true;
    let noNewCount = 0;
    
    while (hasMore) {
      const pageResults = await page.$$eval('tbody tr', trs => {
        return trs.map(tr => {
          const cells = tr.querySelectorAll('td');
          if (cells.length >= 4) {
            const recordingNum = cells[1]?.innerText?.trim();
            if (recordingNum && /^\d+$/.test(recordingNum)) {
              return { 
                grantor: cells[0]?.innerText?.trim(),
                recordingNum, 
                recordingDate: cells[2]?.innerText?.trim(), 
                docCode: cells[3]?.innerText?.trim() 
              };
            }
          }
          return null;
        }).filter(Boolean);
      });
      
      let newCount = 0;
      for (const r of pageResults) {
        if (!seenIds.has(r.recordingNum)) {
          seenIds.add(r.recordingNum);
          allResults.push(r);
          newCount++;
        }
      }
      
      if (newCount === 0) {
        noNewCount++;
        if (noNewCount >= 2) hasMore = false;
      } else {
        noNewCount = 0;
      }
      
      if (hasMore) {
        const nextLink = await page.$('a:has-text("Next")');
        if (nextLink && await nextLink.isVisible()) {
          await nextLink.click();
          await page.waitForTimeout(3000);
          await page.waitForLoadState('networkidle');
        } else {
          hasMore = false;
        }
      }
    }
    
    // Filter for DEED and CERTIFICA
    foreclosures = allResults.filter(r => 
      r.docCode && (r.docCode.includes('DEED') || r.docCode.includes('CERTIFICA'))
    );
    
  } catch (error) {
    console.error('Scrape error:', error.message);
  } finally {
    await browser.close();
  }
  
  return foreclosures;
}

async function main() {
  console.log('=== Foreclosure Monitor ===');
  console.log(`Time: ${new Date().toISOString()}\n`);
  
  // Load history
  let history = { seen: [], lastRun: null, newForeclosures: [] };
  if (fs.existsSync(HISTORY_FILE)) {
    history = JSON.parse(fs.readFileSync(HISTORY_FILE));
  }
  const seenSet = new Set(history.seen || []);
  
  // Scrape current foreclosures
  const foreclosures = await scrapeForeclosures();
  console.log(`Found ${foreclosures.length} total foreclosures\n`);
  
  // Find new ones
  const newForeclosures = foreclosures.filter(f => !seenSet.has(f.recordingNum));
  
  if (newForeclosures.length > 0) {
    console.log(`🚨 NEW FORECLOSURES: ${newForeclosures.length}`);
    newForeclosures.forEach(f => {
      console.log(`  ${f.recordingNum} | ${f.recordingDate} | ${f.docCode}`);
      seenSet.add(f.recordingNum);
    });
    
    // Output for notification
    const notifyText = newForeclosures.map(f => 
      `• ${f.recordingNum} (${f.recordingDate}) - ${f.docCode === 'DEED' ? 'Sheriff Deed' : 'Certificate'}`
    ).join('\n');
    
    console.log('\n=== NOTIFY ===');
    console.log(`🏠 ${newForeclosures.length} new Maricopa foreclosure(s):\n${notifyText}`);
    console.log('=== END NOTIFY ===\n');
  } else {
    console.log('No new foreclosures since last check.');
  }
  
  // Update history
  history.seen = Array.from(seenSet);
  history.lastRun = new Date().toISOString();
  history.newForeclosures = newForeclosures;
  history.totalFound = foreclosures.length;
  
  fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2));
  
  // Save full results
  const output = {
    scrapedAt: new Date().toISOString(),
    totalForeclosures: foreclosures.length,
    newForeclosures: newForeclosures.length,
    foreclosures
  };
  fs.writeFileSync(RESULTS_FILE, JSON.stringify(output, null, 2));
  
  console.log('Done.');
  
  // Exit with code indicating new foreclosures
  process.exit(newForeclosures.length > 0 ? 0 : 0);
}

main().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
