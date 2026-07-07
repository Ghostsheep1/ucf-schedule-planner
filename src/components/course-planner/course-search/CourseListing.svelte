<!-- 
This file is part of Jupiterp. For terms of use, please see the file
called LICENSE at the top level of the Jupiterp source tree (online at
https://github.com/atcupps/Jupiterp/LICENSE).
Copyright (C) 2026 Andrew Cupps
-->
<script lang="ts">
	import SectionListing from './SectionListing.svelte';
	import { formatCredits, myUcfClassSearchLink } from '../../../lib/course-planner/Formatting';
	import { slide } from 'svelte/transition';
	import CourseCondition from './CourseCondition.svelte';
	import { AngleRightOutline } from 'flowbite-svelte-icons';
	import type { Course, Section } from '@jupiterp/jupiterp';
	import type { Section as UcfSection } from '$lib/ucf/types';
	import { CourseSearchFilterStore } from '../../../stores/CoursePlannerStores';

	export let course: Course;
	export let isDesktop: boolean;

	let showMoreInfo: boolean = false;
	let liveSections: Section[] | null = course.sections;
	let loadingSections = false;
	let sectionLoadError = '';
	let onlyShowingOpen = false;
	CourseSearchFilterStore.subscribe((store) => {
		onlyShowingOpen = store.clientSideFilters.onlyOpen === true;
	});
	$: hasKnownCredits = course.minCredits > 0 || course.maxCredits != null;
	$: visibleSections =
		liveSections?.filter((section) => !onlyShowingOpen || section.openSeats > 0) ?? null;
	$: if (course.courseCode) {
		liveSections = course.sections;
		loadingSections = false;
		sectionLoadError = '';
	}

	function scrollToCourseTop(event: FocusEvent) {
		const button = event.currentTarget as HTMLElement | null;
		const container = button?.closest('[id^="results-"]') as HTMLElement | null;
		container?.scrollIntoView({ behavior: 'smooth', block: 'start' });
	}

	async function toggleMoreInfo() {
		showMoreInfo = !showMoreInfo;
		if (showMoreInfo) {
			await loadLiveSections();
		}
	}

	async function loadLiveSections() {
		if (liveSections != null && liveSections.length > 0) return;
		if (loadingSections) return;

		loadingSections = true;
		sectionLoadError = '';
		try {
			const response = await fetch(
				`/api/ucf/sections?course=${encodeURIComponent(course.courseCode)}&term=Fall%202026`
			);
			if (!response.ok) {
				throw new Error('Could not load live myUCF sections.');
			}
			const payload = (await response.json()) as { sections?: UcfSection[] };
			liveSections = (payload.sections ?? []).map(ucfSectionToPlannerSection);
		} catch (error) {
			sectionLoadError =
				error instanceof Error ? error.message : 'Could not load live myUCF sections.';
		} finally {
			loadingSections = false;
		}
	}

	function ucfSectionToPlannerSection(section: UcfSection): Section {
		return {
			courseCode: course.courseCode,
			sectionCode: section.sectionNumber,
			instructors: [section.professorName || 'TBA'],
			meetings: section.meetings.length ? section.meetings.map(ucfMeetingToPlannerMeeting) : ['TBA'],
			openSeats: section.seatsAvailable,
			totalSeats: section.seatsTotal,
			waitlist: section.waitlistTotal ?? 0,
			holdfile: null
		};
	}

	function ucfMeetingToPlannerMeeting(meeting: UcfSection['meetings'][number]): Section['meetings'][number] {
		if (meeting.dayOfWeek === 'Online') return 'OnlineAsync';
		if (!meeting.startTime || !meeting.endTime) return 'TBA';
		return {
			classtime: {
				days: meeting.dayOfWeek,
				start: timeToDecimal(meeting.startTime),
				end: timeToDecimal(meeting.endTime)
			},
			location: {
				building: meeting.building || 'TBA',
				room: meeting.room || null
			}
		};
	}

	function timeToDecimal(time: string) {
		const [hour, minute] = time.split(':').map(Number);
		return hour + minute / 60;
	}
</script>

<div
	id="results-{course.courseCode}"
	class="my-2 flex scroll-mt-2 flex-col rounded-lg border-2 border-solid border-outlineLight bg-bgSecondaryLight px-2 dark:border-outlineDark dark:bg-bgSecondaryDark"
>
	<button
		on:focus={scrollToCourseTop}
		class="top-0 z-10 -mb-[2px] border-b-2 border-solid border-outlineLight bg-bgSecondaryLight px-2 text-left dark:border-outlineDark dark:bg-bgSecondaryDark"
	>
		<!-- Course code and credit count -->
		<div class="flex flex-row align-middle">
			<div class="grow text-left align-middle">
				<b>{course.courseCode}</b>
			</div>
			{#if hasKnownCredits}
				<div class="grow text-right align-middle text-sm 2xl:text-base">
					Credits: {formatCredits(course.minCredits, course.maxCredits)}
				</div>
			{/if}
		</div>

		<!-- Course title -->
		<div class="wrap max-w-[254px] text-sm xl:max-w-[314px] 2xl:max-w-[394px] 2xl:text-base">
			{course.name}
		</div>

		{#if course.genEds != null && course.genEds.length > 0}
			<div class="align-center my-1 flex w-full flex-row justify-start">
				{#each course.genEds as genEd}
					<!-- format-check exempt 5 -->
					<a
						class="mr-1 rounded-xl border border-orange
                            px-1 text-[0.625rem] font-bold leading-tight text-orange transition
                            hover:bg-orange hover:text-bgSecondaryLight
                            2xl:text-xs hover:dark:text-bgSecondaryDark"
						href="https://www.ucf.edu/catalog/undergraduate/#/policy/SJ3U0aO5d"
						target="_blank"
						title={'GenEd: ' + genEd.name}
					>
						{genEd.code}
					</a>
				{/each}
			</div>
		{/if}

		<button
			class="flex w-full flex-row content-center text-left text-sm text-secCodesLight hover:text-secCodesDark 2xl:text-base dark:text-[#8892a8]"
			title={!showMoreInfo ? 'Show more course details' : 'Hide course details'}
			on:click={toggleMoreInfo}
		>
			<div class="-ml-1 h-full self-center transition-transform" class:rotate-90={showMoreInfo}>
				<AngleRightOutline class="h-4 w-4" />
			</div>
			<span>
				{showMoreInfo ? 'Hide details' : 'Show details'}
			</span>
		</button>

		{#if showMoreInfo}
			<div
				class="font-base flex flex-col
                    py-1 text-sm leading-tight 2xl:text-base"
				transition:slide
			>
				<div class="pb-1">
					<a href={myUcfClassSearchLink(course.courseCode)} class="text-orange underline" target="_blank">
						View on myUCF
					</a>
				</div>

				{#if course.conditions != null && course.conditions.length > 0}
					{#each course.conditions as condition}
						<CourseCondition {condition} />
					{/each}
				{/if}

				{#if course.description != null}
					{course.description}
				{/if}
			</div>
		{/if}
	</button>
	<!-- Sections -->
	{#if visibleSections != null && visibleSections.length > 0}
		{#each visibleSections as section (section.sectionCode)}
			<SectionListing courseCode={course.courseCode} {section} {course} {isDesktop} />
		{/each}
	{:else if showMoreInfo}
		<div class="border-t-2 border-outlineLight py-3 text-sm font-medium text-secCodesLight dark:border-outlineDark dark:text-secCodesDark">
			{#if loadingSections}
				Loading live myUCF sections...
			{:else if sectionLoadError}
				{sectionLoadError}
			{:else}
				No live myUCF sections returned for this term.
			{/if}
		</div>
	{/if}
</div>
