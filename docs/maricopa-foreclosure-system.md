# Maricopa County Foreclosure Scraping System

## Overview
Automated system to find Sheriff foreclosure documents from Maricopa County Recorder.

## Data Sources

### 1. Document Search URLs
Search by **document CODE** (not title):

**Certificates (CE):**
```
https://recorder.maricopa.gov/recording/document-search-results.html?documentTypeSelector=code&documentCode=CE&beginDate=YYYY-MM-DD&endDate=YYYY-MM-DD
```

**Deeds (DE):**
```
https://recorder.maricopa.gov/recording/document-search-results.html?documentTypeSelector=code&documentCode=DE&beginDate=YYYY-MM-DD&endDate=YYYY-MM-DD
```

### 2. Document Preview URL
To view/screenshot any document:
```
https://recorder.maricopa.gov/recording/document-preview.html?recordingNumber=DOCNUMBER&suffix=&pages=7
```

## Workflow

### Step 1: Get All Document Numbers
1. Query CE search URL with date range
2. Query DE search URL with date range  
3. Paginate through all results (20 per page)
4. Collect: Recording Number, Date Filed, Doc Code

**Expected counts (Nov 2025 - Mar 2026):**
- CE: ~271 documents
- DE: ~558 documents
- Total: ~829 documents

### Step 2: Check Each Document for Sheriff Foreclosure
For each document number:
1. Load the preview URL
2. The document is rendered as an **image** (not text)
3. Use **vision AI** to read the document
4. Look for: "SHERIFF'S DEED" or "SHERIFF'S CERTIFICATE OF SALE"
5. If match → save to results

### Step 3: Output
Save matches as JSON/CSV with:
- Recording Number
- Date Filed  
- Document Type (DE or CE)
- Preview URL

## Key Technical Notes

1. **Documents are images** - Text extraction won't work. Must use vision/OCR.

2. **Pagination** - Results come 20 per page. Must click "Next" to get all.

3. **Cloudflare** - Site has bot protection. Use realistic user-agent and delays.

4. **Rate limiting** - Add 1-2 second delays between requests.

## Sheriff Foreclosure Indicators

In the document, look for:
- "SHERIFF'S DEED" in header
- "SHERIFF'S CERTIFICATE OF SALE" 
- "In The Superior Court of the State of Arizona"
- "IN AND FOR THE COUNTY OF MARICOPA"
- Case numbers like "CV20XX-XXXXXX"

## Sample Code Structure

```javascript
// 1. Get all doc numbers
async function getAllDocNumbers(docCode, beginDate, endDate) {
  const url = `https://recorder.maricopa.gov/recording/document-search-results.html?documentTypeSelector=code&documentCode=${docCode}&beginDate=${beginDate}&endDate=${endDate}`;
  // Paginate and collect all recording numbers
  // Return array of {num, date, code}
}

// 2. Check each document
async function checkDocument(docNum) {
  const previewUrl = `https://recorder.maricopa.gov/recording/document-preview.html?recordingNumber=${docNum}&suffix=&pages=7`;
  // Screenshot the page
  // Use vision AI to check if sheriff foreclosure
  // Return true/false
}

// 3. Main flow
const ceDocs = await getAllDocNumbers('CE', '2025-11-01', '2026-03-08');
const deDocs = await getAllDocNumbers('DE', '2025-11-01', '2026-03-08');
const allDocs = [...ceDocs, ...deDocs];

const matches = [];
for (const doc of allDocs) {
  if (await checkDocument(doc.num)) {
    matches.push(doc);
  }
}
```

## Daily Automation

For daily runs:
1. Set date range to last 7 days (overlap for safety)
2. Check only new document numbers (track what's been checked)
3. Alert when new sheriff foreclosures found

## Files

- `/home/ubuntu/clawd/data/all-de-ce-docs.csv` - All doc numbers with preview URLs
- `/home/ubuntu/clawd/data/sheriff-matches.json` - Confirmed sheriff foreclosures
- `/home/ubuntu/clawd/scripts/maricopa-foreclosure-full.js` - Full scraper script

## Date Format
URLs use: `YYYY-MM-DD` (e.g., `2025-11-01`)
