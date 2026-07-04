<script lang="ts">
	import ChangelogItem from '../../components/changelog/ChangelogItem.svelte';
</script>

<div class="custom-scrollbar fixed bottom-0 top-12 overflow-y-auto px-4 py-2">
	<ChangelogItem title="Knight Planner Fork" version="v1.0.0" date="July 4, 2026">
		Rebuilt the project as a UCF-focused fork of Jupiterp's SvelteKit app structure. The planner
		now keeps Jupiterp's schedule layout, overlapping class display, course info panel, schedule
		generator foundation, navigation, and local schedule model while using UCF catalog, myUCF class
		sections, and RateMyProfessors data.
	</ChangelogItem>

	<ChangelogItem title="Live UCF Sources" version="v1.0.0" date="July 4, 2026">
		Added UCF Kuali catalog search, myUCF section meeting parsing, live seat and waitlist parsing,
		UCF department lookup, UCF map links, and professor search by @name.
	</ChangelogItem>
</div>
