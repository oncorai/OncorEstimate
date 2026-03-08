# Maricopa Foreclosure Engine

Standalone system to find sheriff foreclosures from Maricopa County Recorder.

## Quick Start

```bash
# Install dependencies
npm install playwright
npx playwright install chromium

# Run with default dates (last 90 days)
node foreclosure-engine.js

# Run with specific dates
node foreclosure-engine.js 2025-11-01 2026-03-08
```

## Configuration

Edit the CONFIG section in `foreclosure-engine.js`:

```javascript
const CONFIG = {
  // For vision AI (optional - without it, saves screenshots for manual review)
  anthropicApiKey: process.env.ANTHROPIC_API_KEY || 'your-key-here',
  
  // Output location
  dataDir: '/home/ubuntu/clawd/data/foreclosures',
  
  // Delays (increase if getting blocked)
  pageLoadDelay: 6000,
  betweenPagesDelay: 3000,
  betweenDocsDelay: 2000,
};
```

## Output

Each run creates a timestamped folder:
```
/data/foreclosures/2026-03-08T15-00-00-000Z/
  ├── all-documents.json     # All CE + DE docs found
  ├── sheriff-foreclosures.csv   # Matches only
  ├── progress.json          # Full run details
  └── screenshots/           # Document screenshots
```

## Daily Cron

Add to crontab for daily runs:
```bash
# Run at 6 AM daily
0 6 * * * cd /home/ubuntu/clawd/scripts && node foreclosure-engine.js >> /var/log/foreclosure.log 2>&1
```

## How It Works

1. **Search CE (Certificates)**: Gets all certificate documents
2. **Search DE (Deeds)**: Gets all deed documents  
3. **Check Each Doc**: Screenshots preview, uses vision AI to identify sheriff foreclosures
4. **Output**: Saves matches to CSV

## URLs Used

**Search (CE):**
```
https://recorder.maricopa.gov/recording/document-search-results.html?documentTypeSelector=code&documentCode=CE&beginDate=YYYY-MM-DD&endDate=YYYY-MM-DD
```

**Search (DE):**
```
https://recorder.maricopa.gov/recording/document-search-results.html?documentTypeSelector=code&documentCode=DE&beginDate=YYYY-MM-DD&endDate=YYYY-MM-DD
```

**Preview:**
```
https://recorder.maricopa.gov/recording/document-preview.html?recordingNumber=DOCNUM&suffix=&pages=7
```

## Without Vision API

If you don't set an API key, the engine will:
1. Take screenshots of all documents
2. Save them to the screenshots folder
3. Mark them for manual review

You can then review the screenshots yourself to identify sheriff foreclosures.
