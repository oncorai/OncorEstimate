#!/usr/bin/env node
const { chromium } = require('playwright');
const fs = require('fs');
const Anthropic = require('@anthropic-ai/sdk');

const INPUT_FILE = '/home/ubuntu/clawd/data/all-de-ce-docs.csv';
const OUTPUT_FILE = '/home/ubuntu/clawd/data/sheriff-foreclosures-final.json';
const PROGRESS_FILE = '/home/ubuntu/clawd/data/vision-progress.json';

const client = new Anthropic();

async function checkWithVision(imageBase64) {
  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 100,
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: 'image/png', data: imageBase64 }},
        { type: 'text', text: 'Is this a SHERIFF\'S DEED or SHERIFF\'S CERTIFICATE OF SALE document? Reply only YES or NO.' }
      ]
    }]
  });
  return response.content[0].text.toUpperCase().includes('YES');
}

async function main() {
  // Load docs
  const csv = fs.readFileSync(INPUT_FILE, 'utf8');
  const lines = csv.trim().split('\n').slice(1);
  const docs = lines.map(l => {
    const [num, date, code, url] = l.split(',');
    return { num, date, code, url };
  });
  
  // Load progress
  let progress = { checked: [], matches: [] };
  if (fs.existsSync(PROGRESS_FILE)) {
    progress = JSON.parse(fs.readFileSync(PROGRESS_FILE));
  }
  const checkedSet = new Set(progress.checked);
  
  const toCheck = docs.filter(d => !checkedSet.has(d.num));
  console.log(`Total: ${docs.length}, Already checked: ${progress.checked.length}, To check: ${toCheck.length}`);
  console.log(`Matches so far: ${progress.matches.length}\n`);
  
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  
  for (let i = 0; i < toCheck.length; i++) {
    const doc = toCheck[i];
    process.stdout.write(`[${i+1}/${toCheck.length}] ${doc.num}... `);
    
    try {
      await page.goto(doc.url, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.waitForTimeout(6000);
      
      const screenshot = await page.screenshot({ type: 'png' });
      const base64 = screenshot.toString('base64');
      
      const isSheriff = await checkWithVision(base64);
      
      if (isSheriff) {
        console.log('✓ SHERIFF');
        progress.matches.push(doc);
      } else {
        console.log('skip');
      }
    } catch (err) {
      console.log(`error: ${err.message.substring(0, 40)}`);
    }
    
    progress.checked.push(doc.num);
    
    if (i % 5 === 0) {
      fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
    }
    
    await page.waitForTimeout(1000);
  }
  
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(progress.matches, null, 2));
  
  console.log(`\n=== COMPLETE ===`);
  console.log(`Sheriff foreclosures: ${progress.matches.length}`);
  
  await browser.close();
}

main().catch(console.error);
