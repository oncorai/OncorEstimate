# MEMORY.md — Zeus's Long-Term Memory

## JFS — The Human
- Name: JFS, based in El Paso TX (Mountain time)
- Works in concrete ($160k/yr), building toward real estate development
- Company: Oncor
- Telegram: @oncorjfs
- Prefers simple, working solutions. Not patient with things that don't work.
- Wants mobile-friendly everything. Simple passwords.

## Oncor Mission
Phase 1: Entitlements — find land, get zoning/permits, flip entitled deals to builders
Phase 2: Build the best deals — vertical integration using concrete background

## Active Projects

### Maricopa Foreclosure Bot (primary focus as of March 2026)
- **Purpose:** Find sheriff foreclosure sales in Maricopa County, extract surplus proceeds opportunities
- **Stack:** Node.js scraper → Maricopa public API → OCR (tesseract) → Supabase → Dashboard
- **Pipeline:** Scrape CE/DE docs → OCR title + case # + amounts → store in Supabase → alert via Telegram
- **Dashboard:** https://oncorai.github.io/oncor-foreclosure-dashboard/ (pw: 123)
- **Railway:** Auto-deploys from GitHub, runs daily at 1 AM UTC (6 PM Arizona)
- **DB column mapping hack:** parcel_number=case#, defendant=court_url, sale_date=CRM status|notes
- **Daily Pima recorder check:** `src/pima-recorder-check.js` — 2captcha + raw HTTP, searches CERTIFICATE SALE + SHERIFF docs, re-checks court dockets
- **Dashboard statuses:** New, No Certificate (amber), Pre-Auction (purple), Researching (blue), Contacted, Filed, Claimed, Dead
- **Color-coded rows:** green border=has proceeds, amber=No Certificate, purple=Pre-Auction
- **Key insight:** Only docs with sheriff foreclosure titles matter (OCR-verified), not all CE/DE docs

### OncorEstimate
- Estimating app at https://github.com/oncorai/OncorEstimate
- Haven't worked on it recently

## Infrastructure
- **GitHub:** oncorai account
- **Railway:** foreclosure-bot project, workspace fb87202a
- **Supabase:** jiailsusjabqythgokcb (oncor-foreclosures)
- **Telegram Bot:** @Fcproceeedsbot for alerts

### AZ Courts Expansion (4 new counties) — Mar 16
- **Scraper built**: `src/az-courts.js` — BotDetect captcha → search AZ Public Access for HOA cases
- **Pinal**: 63 HOA cases found (Goldmine Mountain, Magma Ranch, Sunrise Canyon, Johnson Ranch)
- **Yavapai/Mohave/Coconino**: 0 cases found — sparse HOA activity
- **Missing**: defendant names, addresses, case status, sale amounts — only have case #s + HOA names
- **Recorders**: Pinal AcclaimWeb needs headless browser (Telerik AJAX); Yavapai Tyler search page ID unknown; Mohave/Coconino TBD
- **Column.us**: zero legal notices for these 4 counties
- Deployed as step 5 in daily pipeline, commit `10c725e`

## Dashboard Intel System
- `intel-data.js` embedded in dashboard — 27 cases have intel (18 Maricopa + 9 Pima)
- People tab: Story narrative → Red Flags → People cards (employer, family, leads fields)
- Maricopa court docket parsing: Bootstrap grid divs, `Filing Date/Description/NOTE` pattern
- Maricopa court name search requires reCAPTCHA — can't cross-search defendants

## Cases to Watch
- **CV2024-015621**: Surplus already claimed — DEAD
- **CV2024-025099, CV2023-009635, CV2023-018377, CV2023-052201**: Satisfaction of Judgment — verify surplus

## JFS Wants Daily Post-Cron Summary
- After cron (1 AM UTC), send Telegram summary of new leads/updates — not built yet

## Lessons
- Railway service must be connected to GitHub repo via triggers — otherwise redeploys use cached old image
- Maricopa recorder preview page is unreliable — host PDFs ourselves
- System tesseract is much better than tesseract.js WASM for accuracy
- JFS catches domain errors fast (e.g., "not all CE docs are foreclosures") — trust his instincts
- Don't over-explain, just fix and ship
- AcclaimWeb (Pinal recorder) cannot be scraped via raw HTTP — uses Telerik AJAX grid, needs headless browser
- AZ Public Access court search only returns plaintiff name + case number — no defendant, address, or case details
- **Column.us API** for legal notices: `POST https://us-central1-enotice-production.cloudfunctions.net/api/search/public-notices` — format uses `allFilters` array, `search` keyword, `pageSize/pageNumber`
- Notice of Sale = judgment amount; Certificate of Sale = sale price; Surplus = Sale - Judgment
- Daily Territorial covers most Pima County sheriff notices but not all (33/64 found)
- Sheriff website only keeps current notices (4 at a time), deletes old ones — no archive
- 64/64 Pima cases now have case numbers (all 3 recorder deeds matched Mar 15)
