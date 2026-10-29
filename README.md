# Application Tracker

A fast job application log. Paste a job link, press Enter, done.

## Use

- Paste a job link. Company fills in from the URL (Greenhouse, Lever, Ashby, SmartRecruiters, Workable, Recruitee, Jobvite, Breezy, Workday, BambooHR, Teamtailor, iCIMS, and company career sites). LinkedIn, Indeed, Handshake, Glassdoor, Simplify and GitHub links leave Company blank.
- Enter from any field saves. Date and "Applied" status are set for you.
- Click a status pill to cycle Applied → Interviewing → Offer → Rejected.
- Entries still "Applied" after 14 days show a follow-up flag.

## Data

Entries live in this browser's localStorage. Nothing is sent anywhere.

- **Export JSON / CSV** to back up or move data to another device.
- **Import** merges a JSON or CSV export by entry id. When an entry exists on both sides, the file's version wins. Deleted entries can come back if you import an older file that still has them.
- On iPhone, use the home-screen icon (Share → Add to Home Screen) and stick with it. The home-screen app keeps its own storage separate from Safari tabs, and it isn't subject to Safari's 7-day cleanup of site data.

## Run locally

```bash
npm start
```

Then open http://localhost:4173. The app uses ES modules, so it needs a server; opening `index.html` directly from disk won't work.

## Test

```bash
npm test
```

## Deploy

Static files, no build step. GitHub Pages serving the `main` branch root works as-is.
