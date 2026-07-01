# Knight Planner

Knight Planner is a UCF schedule planning app built by Henrique Silva Ribeiro for students who want a faster way to compare real classes before registering.

The experience is inspired by Jupiterp's clean course-planning workflow, but the implementation is customized for UCF: UCF catalog data, myUCF class sections, RateMyProfessors ratings, Knight branding, UCF colors, and a SvelteKit/Vercel deployment.

## Version

Current working version: `1.0.0`

This is the active pre-release line. Keep the version at `1.0.0` until the full public release is declared.

## Features

- Live UCF Kuali catalog search
- Live myUCF class sections, meeting times, rooms, seats, enrollment, and waitlist details
- RateMyProfessors ratings
- Course planner with multiple saved schedules per term
- Schedule generator with time, day, open-seat, gap, and credit constraints
- Multiple schedules per term
- Custom events
- Department-aware search from UCF subjects
- Course-code normalization for inputs like `COP 3502 C`
- Professor filtering with `@professor` after a course or department search
- Gen Ed filters when UCF catalog attributes are available
- Light and dark mode
- Calendar export using `.ics`
- Local browser storage for schedules

## Data Sources

Knight Planner uses public web data from:

- UCF Kuali catalog for course titles, descriptions, credits, and catalog links
- myUCF class search for live sections, meeting patterns, instructors, rooms, seats, enrollment, and waitlists
- RateMyProfessors for public professor rating summaries

Because all three data sources can change or be temporarily unavailable, students should verify final enrollment choices in official UCF systems before registering.

## Search Tips

- Type a department like `COP` or `PHY` to see live courses in that department.
- Type a full course code like `COP3502C`, `COP 3502 C`, or `cop3502c`.
- Add a professor filter after a department or course, such as `PHY @stolbov`.
- Hide unwanted course variants with the `x` button on each course card.

## Calendar Export

The export button creates an `.ics` calendar file with weekly recurring class meetings for the selected term. It includes course code, section number, meeting location, instructor, and custom events.

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

Vercel settings should use:

- Framework preset: SvelteKit
- Build command: `npm run build`
- Output directory: managed by SvelteKit/Vercel adapter
- Root directory: the repository root containing `package.json`

## Privacy

Version `1.0.0` does not use accounts. Saved schedules and theme preferences live in browser local storage. Searching courses sends requests to UCF sources, and professor rating lookups may request public RateMyProfessors data. Knight Planner does not sell or broker planner data.

## Disclaimer

Knight Planner is not affiliated with, endorsed by, sponsored by, or operated by the University of Central Florida. It is a planning aid, not an official registration system.

## Contact

Report issues to `hsribeiro1@gmail.com`.
