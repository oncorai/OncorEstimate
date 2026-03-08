const { chromium } = require('playwright');
const fs = require('fs');
const { execSync } = require('child_process');
const path = require('path');

const CONFIG = {
  searchUrl: 'https://recorder.maricopa.gov/recording/document-search-results.html',
  previewUrl: 'https://recorder.maricopa.gov/recording/document-preview.html',
  outputDir: './sheriff-deeds',
  csvFile: './sheriff-deeds-2025.csv',
  proxy: {
    server: 'socks5://us8892.nordvpn.com:1080',
    username: 'aMzUUihqpig6s21dWPsiE8ne',
    password: 'tV4343hsV4yBf5t22dQ65dEf'
  }
};

if (!fs.existsSync(CONFIG.outputDir)) fs.mkdirSync(CONFIG.outputDir, { recursive: true });

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

// Records to check: Nov-Dec 2025 + missed 2026
const recordsToCheck = [
  // 2026 missed (91 records)
  "20260090702","20260090848","20260091069","20260092593","20260093235","20260093355",
  "20260093733","20260094044","20260095690","20260096227","20260096270","20260096909",
  "20260097079","20260097131","20260097326","20260098908","20260099905","20260100185",
  "20260100960","20260101947","20260102485","20260102488","20260102951","20260104580",
  "20260104747","20260104943","20260105344","20260105625","20260105935","20260106524",
  "20260107131","20260107189","20260107606","20260107909","20260108263","20260108267",
  "20260108513","20260108522","20260108578","20260108760","20260109409","20260109410",
  "20260109411","20260110067","20260110546","20260110665","20260110731","20260110735",
  "20260110843","20260111313","20260111314","20260111992","20260112741","20260112747",
  "20260113461","20260115877","20260116715","20260116763","20260116778","20260116861",
  "20260118880","20260119221","20260119390","20260120054","20260121553","20260121554",
  "20260121555","20260121855","20260122773","20260122888","20260123114","20260124411",
  "20260125033","20260125117","20260125331","20260126129","20260127155","20260127468",
  "20260127820","20260128262","20260129072","20260129147","20260129249","20260129267",
  "20260129700","20260130007","20260131806","20260131874","20260132013","20260132290",
  "20260132967"
];

async function scrape() {
  console.log('🔍 Sheriff Deed Scraper (via NordVPN) Starting...');
  console.log(`Records to check: ${recordsToCheck.length}\n`);
  
  const browser = await chromium.launch({ 
    headless: true,
    proxy: CONFIG.proxy
  });
  
  const context = await browser.newContext({ 
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
  });
  
  const page = await context.newPage();
  page.setDefaultTimeout(60000);
  
  const sheriffDeeds = [];
  
  // Test connection first
  console.log('Testing VPN connection...');
  try {
    await page.goto('https://api.ipify.org', { timeout: 30000 });
    const ip = await page.textContent('body');
    console.log(`✓ Connected via IP: ${ip}\n`);
  } catch (err) {
    console.log(`✗ VPN connection failed: ${err.message}\n`);
    await browser.close();
    return [];
  }
  
  for (let i = 0; i < recordsToCheck.length; i++) {
    const recordingNumber = recordsToCheck[i];
    process.stdout.write(`[${i + 1}/${recordsToCheck.length}] ${recordingNumber}... `);
    
    try {
      const previewUrl = `${CONFIG.previewUrl}?recordingNumber=${recordingNumber}&suffix=&pages=1`;
      await page.goto(previewUrl, { waitUntil: 'networkidle', timeout: 45000 });
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
        appendToCSV(info);
        fs.renameSync(screenshotPath, path.join(CONFIG.outputDir, `${recordingNumber}.png`));
      } else {
        console.log('not sheriff');
        try { fs.unlinkSync(screenshotPath); } catch {}
      }
    } catch (err) {
      console.log(`error: ${err.message.substring(0, 50)}`);
    }
  }
  
  await browser.close();
  
  if (sheriffDeeds.length > 0) {
    console.log(`\n🎯 Found ${sheriffDeeds.length} Sheriff Deed(s)!`);
    sheriffDeeds.forEach(d => console.log(`   - ${d.recordingNumber}: ${d.caseNumber || 'N/A'}`));
  } else {
    console.log('\n✅ No additional Sheriff Deeds found');
  }
  
  return sheriffDeeds;
}

scrape().catch(err => { console.error('Fatal:', err); process.exit(1); });
