<script lang="ts">
	import { onMount } from 'svelte';

	let checking = true;

	onMount(() => {
		let finished = false;

		const finish = () => {
			if (finished) return;
			finished = true;
			checking = false;
		};

		const timeout = window.setTimeout(finish, 1500);

		fetch('/data/ucf-section-index.json', { cache: 'no-cache' })
			.then((response) => {
				if (!response.ok) throw new Error('Index revalidation failed');
				return response.body?.cancel();
			})
			.catch(() => {
				// The app can still use any already-cached index; never block startup on this check.
			})
			.finally(() => {
				window.clearTimeout(timeout);
				finish();
			});
	});
</script>

{#if checking}
	<div
		class="fixed inset-0 z-[100] flex items-center justify-center
			bg-bgLight/90 backdrop-blur-sm dark:bg-bgDark/90"
		role="status"
		aria-label="Checking latest course index"
	>
		<div
			class="h-10 w-10 animate-spin rounded-full border-4 border-outlineLight
				border-t-orange dark:border-outlineDark dark:border-t-orange"
		></div>
	</div>
{/if}
