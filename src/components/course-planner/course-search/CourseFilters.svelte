<!-- 
This file is part of Jupiterp. For terms of use, please see the file
called LICENSE at the top level of the Jupiterp source tree (online at
https://github.com/atcupps/Jupiterp/LICENSE).
Copyright (C) 2026 Andrew Cupps
-->
<script lang="ts">
	import { AdjustmentsHorizontalOutline } from 'flowbite-svelte-icons';
	import { slide } from 'svelte/transition';
	import type { FilterParams } from '../../../types';
	import { CourseSearchFilterStore } from '../../../stores/CoursePlannerStores';

	let appliedFiltersCount = 0;
	let showFiltersMenu = false;
	export let showGenEdMenu = false;
	let onlyOpenSections = false;

	const defaultMinCredits = 0;
	const defaultMaxCredits = 20;
	let minCredits: number = defaultMinCredits;
	let maxCredits: number = defaultMaxCredits;

	$: {
		const params: FilterParams = {
			serverSideFilters: {},
			clientSideFilters: {}
		};
		appliedFiltersCount = 0;

		if (minCredits !== 0) {
			appliedFiltersCount += 1;
			params.clientSideFilters.minCredits = minCredits;
		}
		if (maxCredits !== 20) {
			appliedFiltersCount += 1;
			params.clientSideFilters.maxCredits = maxCredits;
		}
		if (onlyOpenSections) {
			appliedFiltersCount += 1;
			params.clientSideFilters.onlyOpen = onlyOpenSections;
		}

		if (appliedFiltersCount > 0) {
			CourseSearchFilterStore.set({
				...params
			});
		} else {
			CourseSearchFilterStore.set({
				serverSideFilters: {},
				clientSideFilters: {}
			});
		}
	}

	function resetFilters() {
		showGenEdMenu = false;
		minCredits = defaultMinCredits;
		maxCredits = defaultMaxCredits;
		onlyOpenSections = false;
	}
</script>

<div
	class="flex flex-col
            text-secCodesLight dark:text-[#8892a8]"
>
	<!-- Filters button -->
	<div
		class="mt-1 flex flex-row items-center justify-between
                 gap-1 px-1 py-0.5"
	>
		<button
			class="flex grow flex-row
                    items-center rounded-md text-sm
                    hover:text-textLight dark:hover:text-textDark"
			title="Show/hide course search filters"
			on:click={() => {
				showFiltersMenu = !showFiltersMenu;
			}}
		>
			<AdjustmentsHorizontalOutline class="mr-1 h-4 w-4" />
			<!-- format-check exempt 1 -->
			{appliedFiltersCount} filter{appliedFiltersCount === 1 ? '' : 's'} applied
		</button>

		<button
			class="text-right text-sm
                    hover:text-textLight dark:hover:text-textDark"
			on:click={resetFilters}
			title="Clear all filters"
		>
			Clear filters
		</button>
	</div>

	<!-- Filters menu -->
	{#if showFiltersMenu}
		<div class="mx-1 my-1 flex flex-col gap-2 px-2 py-1 text-xs" transition:slide>
			<!-- Credits -->
			<div class="flex flex-row gap-4">
				<!-- Min credits -->
				<div class="flex flex-row items-center text-xs">
					<span class="min-w-16"> Min credits: </span>
					<input
						type="number"
						min="0"
						step="1"
						max="20"
						placeholder="0"
						bind:value={minCredits}
						class="w-12 rounded-md
                                border
                                border-secCodesDark bg-bgLight px-1 py-0 text-sm
                                text-xs focus:outline-none
                                focus:ring dark:border-divBorderDark
                                dark:bg-bgDark"
					/>
				</div>

				<!-- Max credits -->
				<div class="flex flex-row items-center text-xs">
					<span class="min-w-16"> Max credits: </span>
					<input
						type="number"
						min="0"
						max="20"
						step="1"
						placeholder="10"
						bind:value={maxCredits}
						class="w-12 rounded-md
                                border
                                border-secCodesDark bg-bgLight px-1 py-0
                                text-sm text-xs focus:outline-none
                                focus:ring dark:border-divBorderDark
                                dark:bg-bgDark"
					/>
				</div>
			</div>

			<!-- Only open sections -->
			<div class="flex flex-row items-center text-xs">
				<input
					type="checkbox"
					id="only-open-sections"
					class="mr-2 rounded-md border-secCodesDark
                        bg-divBorderLight text-orange
                        hover:cursor-pointer focus:ring-orange
                        dark:border-divBorderDark
                        dark:bg-divBorderDark"
					bind:checked={onlyOpenSections}
				/>
				<label for="only-open-sections" class="text-xs hover:cursor-pointer">
					Only show open sections
				</label>
			</div>
		</div>
	{/if}
</div>
