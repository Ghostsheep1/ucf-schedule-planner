# Knight Planner

Knight Planner is a UCF-focused course schedule planner built for searching real UCF catalog and
section data, comparing instructors and class times, saving schedules locally, exporting calendars,
and generating possible schedules from course constraints.

## Features

- Course Planner with saved local schedules, duplicate schedules, schedule renaming, sharing, and
  calendar export
- Schedule Generator that builds possible schedules from selected courses, required/optional
  courses, pinned sections, pinned professors, open-section filtering, time windows, days off,
  minimum gaps, and minimum credits
- Real UCF course catalog data, departments, prerequisites, descriptions, credits, and section
  listings
- Real section meeting times, buildings, rooms, online/async sections, weekend meetings, seats, and
  waitlists from myUCF public class search data
- RateMyProfessors ratings when a confident UCF professor match exists
- Professor search using `@name`, plus course-code and department search
- Light and dark mode, responsive layout, overlapping schedule blocks, async/online column support,
  UCF map links, and startup cache revalidation

## Data Sources

- UCF Kuali catalog for course, department, catalog requirement, credit, and prerequisite data
- myUCF public class search pages for sections, meeting times, seats, and waitlist counts
- RateMyProfessors for professor ratings when a confident match exists

Knight Planner builds a full local JSON index from these sources and serves search from that index
for speed. The index is designed to refresh nightly through GitHub Actions, and the deployed app
revalidates the index on startup so users receive fresh data without manually clearing browser cache.

Knight Planner is not an official University of Central Florida service. Always verify registration,
availability, prerequisites, and enrollment details in official UCF systems before registering.

## Nightly Index

The index builder is:

```bash
npm run build:index
```

The GitHub Actions workflow in `.github/workflows/build-ucf-index.yml` refreshes the index every
night, commits the updated `static/data/ucf-section-index.json`, and lets Vercel redeploy the latest
data.

## Development

```bash
npm install
npm run dev
```

Useful checks:

```bash
npm run check
npm test
npm run build
```

Before release, also test the deployed Vercel site in a fresh browser session and confirm course
search, professor search, section display, schedule generation, export, theme switching, and startup
index refresh all work.

## Project Notes

- Version: `1.0.0`
- Built by Henrique Silva Ribeiro
- Report issues: `hsribeiro1@gmail.com`
- Repository: `https://github.com/Ghostsheep1/ucf-schedule-planner`

## License

See `LICENSE` for license terms and attribution notices.
