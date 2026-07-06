<!-- 
This file is part of Jupiterp. For terms of use, please see the file
called LICENSE at the top level of the Jupiterp source tree (online at
https://github.com/atcupps/Jupiterp/LICENSE).
Copyright (C) 2026 Andrew Cupps
-->
<script lang="ts">
	import type { ClassMeeting } from '@jupiterp/jupiterp';
	import { formatClassDayTime, formatLocation } from '../../../lib/course-planner/Formatting';
	import { isUcfBuilding, ucfBuildingUrl } from '$lib/ucf/buildings';

	export let meeting: ClassMeeting;
	export let locationHover: boolean;
	export let removeHoverSection: () => void;
	export let condensed: boolean = false;

	function handleLinkClick(event: MouseEvent) {
		// Prevent the event from propagating to the button
		event.stopPropagation();
	}

</script>

<div class="flex w-full flex-row text-xs font-medium 2xl:text-base">
	{#if typeof meeting === 'string'}
		{meeting}
	{:else}
		<!-- Classtime -->
		<span class:grow={!condensed}>
			{formatClassDayTime(meeting.classtime)}
		</span>

		<!-- Location -->
		<span class:grow={!condensed} class:text-right={!condensed}>
			{#if condensed}&nbsp;in
			{/if}
			{#if !isUcfBuilding(meeting.location.building)}
				<span class="pr-0.5">
					{formatLocation(meeting.location)}
				</span>
			{:else}
				<a
					href={ucfBuildingUrl(meeting.location.building)}
					class="rounded-md p-0.5 text-orange underline
                        transition hover:bg-hoverLight hover:dark:bg-hoverDark"
					on:mouseenter={() => {
						locationHover = true;
						removeHoverSection();
					}}
					on:mouseleave={() => {
						locationHover = false;
						removeHoverSection();
					}}
					on:click={handleLinkClick}
					target="_blank"
					title="View UCF building page"
				>
					{formatLocation(meeting.location)}
				</a>
			{/if}
		</span>
	{/if}
</div>
