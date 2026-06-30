# Knight Planner

Knight Planner is a UCF schedule planning app built by Henrique Silva Ribeiro.

It is inspired by the workflow of Jupiterp, but customized for UCF with live UCF catalog data, myUCF class sections, RateMyProfessors ratings, UCF branding, and a SvelteKit/Vercel deployment.

## Version

Current working version: `1.0.0`

This project is still being actively polished before the full public release.

## Features

- Live UCF Kuali catalog search
- Live myUCF class sections, meeting times, rooms, seats, enrollment, and waitlist details
- RateMyProfessors ratings
- Course planner calendar
- Schedule generator with constraints
- Multiple schedules per term
- Custom events
- Department-aware search
- Gen Ed filters when UCF catalog attributes are available
- Light and dark mode
- Local browser storage for schedules

## Development

```bash
npm install
npm run dev
```

Open `http://127.0.0.1:5173/`.

## Checks

```bash
npm run check
npm run build
VERCEL=1 npm run build
```

## Deploy

The app is configured for SvelteKit on Vercel using `@sveltejs/adapter-vercel`.

## Contact

Report issues to `hsribeiro1@gmail.com`.
