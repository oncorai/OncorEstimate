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

### Railway
- **Status:** ✅ Active
- **Token:** `065212fd-af35-4428-9652-86d46a280dc0`
- **Workspace:** fb87202a-69bb-4b8f-8656-d6646ad117b1 (oncorai's Projects)
- **Projects:**
  - maricopa-foreclosure-bot (id: 3e686f79-5ec3-420e-a2f1-cc55cac3a20f)

### Telegram Bot (Oncor Alerts)
- **Bot:** @Fcproceeedsbot (t.me/Fcproceeedsbot)
- **Token:** `8796899511:AAGrm6j5pHnlvxqUaWmFpsWP4ClB6RKLk5U`
- **Purpose:** Foreclosure alerts, system notifications
- **JFS Chat ID:** 8398645153

---

Add whatever helps you do your job. This is your cheat sheet.
