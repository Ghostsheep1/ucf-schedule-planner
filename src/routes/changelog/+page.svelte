<script lang="ts">
	import ChangelogItem from '../../components/changelog/ChangelogItem.svelte';
</script>

<div class="custom-scrollbar fixed bottom-0 top-12 overflow-y-auto px-4 py-2">
	<ChangelogItem title="Knight Planner 1.0" version="v1.0.0" date="July 4, 2026">
		Rebuilt the project around UCF course planning with a SvelteKit app structure, overlapping
		class display, course info panel, schedule generator foundation, navigation, local schedule
		storage, UCF catalog data, myUCF class sections, and RateMyProfessors data.
	</ChangelogItem>

	<ChangelogItem title="Indexed UCF Sources" version="v1.0.0" date="July 4, 2026">
		Added UCF Kuali catalog search, myUCF section meeting parsing, live seat and waitlist parsing,
		UCF department lookup, UCF map links, and professor search by @name.
	</ChangelogItem>
</div>
