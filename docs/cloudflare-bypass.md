# CloudFlare Bypass Techniques

Reference for bypassing CloudFlare protection on web scraping targets.

## Detection Methods CloudFlare Uses
- Browser fingerprinting (WebGL, Canvas, Fonts)
- Navigator.webdriver flag
- Timing analysis
- IP reputation
- TLS fingerprinting
- JavaScript challenges (Turnstile CAPTCHA)

## Bypass Techniques (Ranked by Effectiveness)

### 1. FlareSolverr (Self-hosted)
**Best for: Full automation**
```bash
docker run -p 8191:8191 ghcr.io/flaresolverr/flaresolverr:latest
```
- Handles JS challenges automatically
- Returns cookies + HTML after solving
- Can be sidecar service on Railway

### 2. Puppeteer + Stealth Plugin
**Best for: Simple challenges**
```javascript
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
puppeteer.use(StealthPlugin());
```
- Patches fingerprinting signals
- Works for basic CloudFlare
- May timeout on Turnstile CAPTCHA

### 3. undetected-chromedriver (Python)
```python
import undetected_chromedriver as uc
driver = uc.Chrome()
```
- Python equivalent of stealth Puppeteer
- Good success rate

### 4. Residential Proxies
- Route through real home IPs
- CloudFlare trusts these more
- Services: Bright Data, Oxylabs, SmartProxy

### 5. Request Header Mimicking
```javascript
headers: {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)...',
  'Accept': 'text/html,application/xhtml+xml...',
  'Accept-Language': 'en-US,en;q=0.9',
  'Accept-Encoding': 'gzip, deflate, br',
  'Connection': 'keep-alive',
  'Upgrade-Insecure-Requests': '1',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none',
  'Sec-Fetch-User': '?1'
}
```

## Railway Deployment Pattern
```
┌─────────────────────────────────────────┐
│              Railway Project             │
├─────────────────────────────────────────┤
│  ┌─────────────┐    ┌────────────────┐  │
│  │   Scraper   │───▶│  FlareSolverr  │  │
│  │  (Node.js)  │    │   (Docker)     │  │
│  └─────────────┘    └────────────────┘  │
│         │                               │
│         ▼                               │
│   Internal Network                      │
│   flaresolverr.railway.internal:8191    │
└─────────────────────────────────────────┘
```

## Retry Strategy
```javascript
async function fetchWithRetry(url, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const result = await solveCloudFlare(url);
      if (result) return result;
    } catch (e) {
      console.log(`Attempt ${i + 1} failed, retrying...`);
      await sleep(Math.pow(2, i) * 1000); // Exponential backoff
    }
  }
  return null;
}
```

## Lessons Learned

### Maricopa County Recorder (2026-03-08)
- Site uses CloudFlare with Turnstile
- Basic Puppeteer gets 403
- Stealth plugin helps but times out on challenge
- FlareSolverr sidecar works
- DE documents work, CE documents need retries
- PDF links on different page structure

---

*Updated: 2026-03-08 by Zeus*
