# TOOLS.md - Local Notes

Skills define *how* tools work. This file is for *your* specifics — the stuff that's unique to your setup.

## What Goes Here

Things like:
- Camera names and locations
- SSH hosts and aliases  
- Preferred voices for TTS
- Speaker/room names
- Device nicknames
- Anything environment-specific

## Examples

```markdown
### Cameras
- living-room → Main area, 180° wide angle
- front-door → Entrance, motion-triggered

### SSH
- home-server → 192.168.1.100, user: admin

### TTS
- Preferred voice: "Nova" (warm, slightly British)
- Default speaker: Kitchen HomePod
```

## Why Separate?

Skills are shared. Your setup is yours. Keeping them apart means you can update skills without losing your notes, and share skills without leaking your infrastructure.

---

### Oncor - Plan Storage
- **Google Drive Folder:** https://drive.google.com/drive/folders/1FPgI-nfMJN3TaO6LTrDL-mZcb-5sN7S2?usp=sharing
- All project plans go here moving forward
- Current files:
  - 2026 0130 - Camelback IFC - STRUCTURE.pdf
  - Koch-Haut Complete set.pdf
  - Koch-Haut bid.pdf (in /old subfolder)

---

### Maricopa County Foreclosure Search
**Search by document CODE (not title!):**
- **CE** (Certificate): `https://recorder.maricopa.gov/recording/document-search-results.html?documentTypeSelector=code&documentCode=CE&beginDate=YYYY-MM-DD&endDate=YYYY-MM-DD`
- **DE** (Deed): `https://recorder.maricopa.gov/recording/document-search-results.html?documentTypeSelector=code&documentCode=DE&beginDate=YYYY-MM-DD&endDate=YYYY-MM-DD`

**Workflow:**
1. Get doc numbers from CE and DE searches
2. Get PDFs via preview URL
3. Parse PDFs to identify sheriff foreclosures

---

### GitHub (oncorai)
- **Account:** oncorai
- **Auth:** `~/.config/gh/hosts.yml` (PAT stored)
- **Repos:**
  - https://github.com/oncorai/OncorEstimate (estimating app)
  - https://github.com/oncorai/maricopa-foreclosure-bot (foreclosure scraper)

### Supabase (oncor-foreclosures)
- **Project URL:** https://jiailsusjabqythgokcb.supabase.co
- **Project Ref:** jiailsusjabqythgokcb
- **Tables:** documents, scrape_log
- **Dashboard:** https://supabase.com/dashboard/project/jiailsusjabqythgokcb

### Railway
- **Status:** ✅ Active
- **Token:** `065212fd-af35-4428-9652-86d46a280dc0`
- **Workspace:** fb87202a-69bb-4b8f-8656-d6646ad117b1 (oncorai's Projects)
- **Projects:**
  - foreclosure-bot (id: 46ab8674-6d0b-44a0-8781-47a5788221b1)
  - Services: scraper-final (5eeff28d-0cc6-425e-ad64-f6c563b8fd6e), flaresolverr (DELETE - no longer needed)

### Telegram Bot (Oncor Alerts)
- **Bot:** @Fcproceeedsbot (t.me/Fcproceeedsbot)
- **Token:** `8796899511:AAGrm6j5pHnlvxqUaWmFpsWP4ClB6RKLk5U`
- **Purpose:** Foreclosure alerts, system notifications
- **JFS Chat ID:** 8398645153

---

### Lob (Physical Mail)
- **API Key (live):** `live_8430390f2f450c5df3e091cfdf9cbd2fe40`
- **API Base:** `https://api.lob.com/v1`
- **Auth:** Basic auth with API key as username, empty password
- **Free credit:** $50 (covers ~35 letters)
- **Use:** Send physical letters to surplus proceeds defendants

Add whatever helps you do your job. This is your cheat sheet.

### Twilio (Oncor Outreach)
- **Account SID:** AC64a4c99ae637d7d0817c6b7cbce812f0
- **Auth Token:** 7f2322eea0c07a2dfba181f7826bbfda
- **Phone Number:** +19282676489 (928-267-6489)
- **SMS:** ✅ enabled
- **Voice:** ✅ enabled
- **JFS Cell:** +18325355189
