# Flood Risk Tool V4

Flood Risk Tool V4 is a React and Vercel application for generating a homeowner flood-risk assessment, capturing qualified leads, and running follow-up email workflows for Oiriunu.

## What It Does

The app guides a visitor through a multi-step property assessment, generates a flood-risk report, and presents:

- An overall property risk score
- Flood exposure, property vulnerability, and insurance risk breakdowns
- Financial exposure estimates
- DIY flood-protection recommendations
- Professional service recommendations
- Buyer-oriented seller questions and mitigation ranges when relevant
- A follow-up lead capture form for personalized guidance

The backend stores leads in Supabase, can sync qualified records to HubSpot, sends internal and customer emails with Resend, and processes nurture campaigns through a protected cron-style endpoint.

## Tech Stack

- React 19
- Create React App / `react-scripts`
- Vercel serverless functions
- Supabase
- Resend
- HubSpot CRM API
- Google Maps Geocoding API
- Gemini API for report generation

## Project Structure

```text
api/
  _lib/                  Shared serverless helpers
  lead/upsert.js          Main lead upsert, routing, alerts, and HubSpot sync
  nurture/process.js      Protected nurture email processor
  flood-risk-report.js    Gemini-backed flood report generator
  unsubscribe.js          Email unsubscribe endpoint
  legacy/                 Older lead/contact endpoints kept for reference

src/
  components/
    FloodRiskToolV4.js    Main assessment experience
  lib/                    Frontend helpers for risk, leads, and location logic
  styles/                 App-specific styles

public/                   Static CRA assets
```

## Local Setup

Install dependencies:

```bash
npm install
```

Create a local env file:

```bash
cp .env.example .env.local
```

Then fill in the server-side secrets in Vercel and local development as needed.

Start the development server:

```bash
npm start
```

Run tests:

```bash
npm test
```

Build for production:

```bash
npm run build
```

## Environment Variables

See [.env.example](.env.example) for the full list.

Client-side variables must start with `REACT_APP_`. All service keys, tokens, and API secrets must remain server-side only.

## Primary API Routes

- `POST /api/flood-risk-report` generates a structured flood-risk report.
- `POST /api/lead/upsert` creates or updates an assessment lead, classifies it, sends alerts or confirmations, enrolls nurture flows, and optionally syncs HubSpot.
- `GET|POST /api/nurture/process` processes due nurture emails. Requires `NURTURE_PROCESS_SECRET`.
- `GET|POST /api/unsubscribe` unsubscribes a lead from nurture emails.

## Legacy Routes

Older lead and contact routes have been moved into `api/legacy`. Keep them only while confirming that no external site, landing page, or automation still calls them.

## Deployment Notes

The app is designed for Vercel. Configure all server-side environment variables in the Vercel project settings. If using the nurture processor, configure a Vercel Cron Job or external scheduler that calls:

```text
/api/nurture/process?secret=<NURTURE_PROCESS_SECRET>
```

## Maintenance Notes

- Keep scoring and lead-routing logic in `src/lib` or `api/_lib`, not inside UI markup.
- Keep email templates and HubSpot/Supabase integration code out of route handlers where possible.
- Do not commit `.vercel`, `.env.local`, production secrets, or generated build output.
