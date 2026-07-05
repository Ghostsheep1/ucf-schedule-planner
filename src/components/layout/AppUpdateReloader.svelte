<script lang="ts">
	import { updated } from '$app/stores';
	import { onDestroy } from 'svelte';

	const unsubscribe = updated.subscribe((hasUpdate) => {
		if (!hasUpdate || typeof window === 'undefined') return;
		window.location.reload();
	});

	onDestroy(unsubscribe);
</script>
