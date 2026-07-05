<!-- 
This file is part of Jupiterp. For terms of use, please see the file
called LICENSE at the top level of the Jupiterp source tree (online at
https://github.com/atcupps/Jupiterp/LICENSE).
Copyright (C) 2026 Andrew Cupps
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import type { Section } from '@jupiterp/jupiterp';
	import type { Section as UcfSection } from '$lib/ucf/types';

	export let section: Section;

	type SectionsResponse = {
		sections?: UcfSection[];
	};

	const liveSectionCache = new Map<string, Promise<UcfSection[]>>();
	let loadingLiveSeats = section.totalSeats === 0;

	function loadLiveSections(courseCode: string) {
		const key = `${courseCode}:Fall 2026`;
		if (!liveSectionCache.has(key)) {
			liveSectionCache.set(
				key,
				fetch(`/api/ucf/sections?course=${encodeURIComponent(courseCode)}&term=Fall%202026&details=1`)
					.then((response) => (response.ok ? (response.json() as Promise<SectionsResponse>) : null))
					.then((payload) => payload?.sections ?? [])
					.catch(() => [])
			);
		}
		return liveSectionCache.get(key) ?? Promise.resolve([]);
	}

	onMount(async () => {
		if (!section.courseCode || section.sectionCode === 'N/A') return;
		const liveSections = await loadLiveSections(section.courseCode);
		const liveSection = liveSections.find((candidate) => {
			return candidate.sectionNumber === section.sectionCode;
		});
		loadingLiveSeats = false;
		if (!liveSection) return;
		section = {
			...section,
			openSeats: liveSection.seatsAvailable,
			totalSeats: liveSection.seatsTotal,
			waitlist: liveSection.waitlistTotal ?? 0
		};
	});
</script>

{#if section.totalSeats > 0}
	<div class="flex w-full flex-row pb-1 text-xs font-medium 2xl:text-base">
		{section.openSeats} / {section.totalSeats} seats available
		{#if section.waitlist > 0}
			<br />
			Waitlist: {section.waitlist}
		{/if}
		{#if section.holdfile != null}
			<br />
			Holdfile: {section.holdfile}
		{/if}
	</div>
{:else}
	<div class="flex w-full flex-row pb-1 text-xs font-medium 2xl:text-base">
		{loadingLiveSeats ? 'Loading live seats...' : 'Seat count unavailable'}
	</div>
{/if}
