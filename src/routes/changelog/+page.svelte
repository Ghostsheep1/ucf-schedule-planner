<script lang="ts">
	import ChangelogItem from '../../components/changelog/ChangelogItem.svelte';
</script>

<div class="custom-scrollbar fixed bottom-0 top-12 overflow-y-auto px-4 py-2">
	<ChangelogItem title="Knight Planner 1.0" version="v1.0.0" date="July 5, 2026">
		Initial UCF release. Rebuilt the planner as a SvelteKit app for UCF course planning with real
		UCF catalog data, real myUCF section data, RateMyProfessors ratings, local schedule storage,
		multiple schedules, schedule renaming, duplicate/delete controls, sharing, calendar export,
		light and dark mode, responsive navigation, UCF branding, UCF map links, About, Terms,
		Privacy, Report an Issue, GitHub links, and a full release README.
	</ChangelogItem>

	<ChangelogItem title="Fast Indexed Search" version="v1.0.0" date="July 5, 2026">
		Added a nightly UCF index that pulls catalog courses, departments, Gen Eds, prerequisites,
		descriptions, credits, class sections, meeting times, buildings, rooms, seats, waitlists, and
		professor ratings into a local JSON source. Course search, department search, section display,
		and professor search now read from the index for near-instant results, with startup
		revalidation and automatic app update checks so users receive fresh nightly data without
		manually clearing browser cache.
	</ChangelogItem>

	<ChangelogItem title="Course Planner" version="v1.0.0" date="July 5, 2026">
		Added UCF course-code search, department search, professor search with @name, Gen Ed filters,
		credit filters, open-section filtering, detailed course panels, instructor ratings, real seats
		and waitlists, online/async sections, weekend meetings, overlapping class blocks, class detail
		panels, custom events, UCF-specific building links, and calendar export.
	</ChangelogItem>

	<ChangelogItem title="Schedule Generator" version="v1.0.0" date="July 5, 2026">
		Added a schedule generator for building possible schedules from selected courses. Supports
		required and optional courses, pinned sections, pinned professors, open-section filtering,
		no-class-before and no-class-after constraints, days off, minimum gaps, minimum credits,
		conflict detection, async sections, generated schedule previews, sorting, and applying a
		generated schedule back into the planner.
	</ChangelogItem>
</div>
