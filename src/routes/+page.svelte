<script lang="ts">
  import { onMount } from "svelte";
  import ProfessorRating from "$lib/ProfessorRating.svelte";
  import WeeklyCalendar from "$lib/WeeklyCalendar.svelte";
  import type { CalendarBlock, Course, CustomEvent, DayOfWeek, Filters, PlannerState, SchedulePlan, Section } from "$lib/types";
  import {
    blockColors,
    candidateConflicts,
    colorForIndex,
    customEventConflicts,
    dayLabels,
    days,
    eventToBlocks,
    formatTimeRange,
    getSelectionPairs,
    initialSchedule,
    markConflicts,
    minutesToDisplay,
    sectionToBlocks,
    selectedCourse,
    timeToMinutes,
    uid,
    uniqueCredits
  } from "$lib/planner";
  import { ucfAttributeTags } from "$lib/ucfSources";

  const terms = ["Fall 2026", "Spring 2027", "Summer 2027"];
  const plannerKey = "knight-planner-state-v2-svelte";
  const emptyFilters: Filters = { genEdTags: [], minCredits: "", maxCredits: "", onlyOpen: false };
  const githubUrl = "https://github.com/Ghostsheep1/ucf-schedule-planner";
  const issueMailto = "mailto:hsribeiro1@gmail.com?subject=Knight%20Planner%20issue";

  let planner: PlannerState = defaultState();
  let hydrated = false;
  let query = "";
  let filters: Filters = { ...emptyFilters };
  let filtersOpen = false;
  let courses: Course[] = [];
  let sourceStatus = "Search UCF catalog and myUCF class search.";
  let loadingCourses = false;
  let activeView: "planner" | "requirements" = "planner";
  let menuOpen = false;
  let scheduleDropdownOpen = false;
  let modalOpen = false;
  let aboutOpen = false;
  let notice = "";
  let expanded: Record<string, boolean> = {};
  let hiddenCourses: Record<string, boolean> = {};
  let sectionLoading: Record<string, boolean> = {};
  let detailLoading: Record<string, boolean> = {};
  let hoveredSection: { course: Course; section: Section } | null = null;
  let searchTimer: ReturnType<typeof setTimeout> | undefined;
  let searchAbort: AbortController | undefined;
  let searchRun = 0;

  let eventName = "";
  let eventDays: Exclude<DayOfWeek, "Online">[] = [];
  let eventStart = "09:00";
  let eventEnd = "10:00";
  let eventLocation = "";
  let eventNotes = "";
  let eventError = "";

  $: schedules = planner.schedulesByTerm[planner.term] ?? [initialSchedule()];
  $: activeScheduleId = planner.activeScheduleIdByTerm[planner.term] ?? schedules[0]?.id;
  $: activeSchedule = schedules.find((schedule) => schedule.id === activeScheduleId) ?? schedules[0] ?? initialSchedule();
  $: selectedPairs = getSelectionPairs(activeSchedule);
  $: credits = uniqueCredits(activeSchedule);
  $: hasGenEdData = courses.some((course) => course.genEdTags.length > 0);
  $: hasSectionData = courses.some((course) => course.sections.length > 0);
  $: activeGenEdFilters = hasGenEdData ? filters.genEdTags : [];
  $: activeOnlyOpen = hasSectionData && filters.onlyOpen;
  $: appliedFilterCount =
    activeGenEdFilters.length + Number(Boolean(filters.minCredits)) + Number(Boolean(filters.maxCredits)) + Number(activeOnlyOpen);
  $: filteredCourses = filterCourses(courses, query, filters, activeGenEdFilters, activeOnlyOpen);
  $: visibleCourses = filteredCourses.filter((course) => !hiddenCourses[course.id]);
  $: baseBlocks = markConflicts([
    ...selectedPairs.flatMap(({ course, section, selection }) => sectionToBlocks(course, section, selection)),
    ...activeSchedule.customEvents.flatMap(eventToBlocks)
  ]);
  $: hoverBlocks = hoveredSection
    ? sectionToBlocks(hoveredSection.course, hoveredSection.section, {
        id: "hover",
        courseId: hoveredSection.course.id,
        sectionId: hoveredSection.section.id,
        color: colorForIndex(activeSchedule.selections.length)
      }).map((block) => ({ ...block, preview: true }))
    : [];
  $: blocks = [...baseBlocks, ...hoverBlocks];
  $: searchKey = `${planner.term}\n${query.trim()}`;

  onMount(() => {
    const stored = localStorage.getItem(plannerKey);
    if (stored) {
      try {
        planner = JSON.parse(stored) as PlannerState;
      } catch {
        localStorage.removeItem(plannerKey);
      }
    }
    hydrated = true;
  });

  $: if (hydrated) {
    localStorage.setItem(plannerKey, JSON.stringify(planner));
  }

  $: queueCourseSearch(searchKey);

  function queueCourseSearch(key: string) {
    const [term, cleaned = ""] = key.split("\n");
    if (searchTimer) clearTimeout(searchTimer);
    if (searchAbort) searchAbort.abort();
    const run = (searchRun += 1);

    if (cleaned.length < 2) {
      courses = [];
      hiddenCourses = {};
      sectionLoading = {};
      detailLoading = {};
      sourceStatus = "Enter at least 2 characters to search live UCF sources.";
      loadingCourses = false;
    } else {
      loadingCourses = true;
      const controller = new AbortController();
      searchAbort = controller;
      searchTimer = setTimeout(async () => {
        try {
          const response = await fetch(`/api/ucf/search?q=${encodeURIComponent(cleaned)}&term=${encodeURIComponent(term)}&sections=0`, {
            signal: controller.signal
          });
          const payload = (await response.json()) as { courses?: Course[]; sourceStatus?: string };
          if (run !== searchRun) return;
          courses = payload.courses ?? [];
          hiddenCourses = {};
          sourceStatus = payload.sourceStatus ?? "UCF source returned results.";
          hydrateSections(courses, term, run);
        } catch (error) {
          if (!controller.signal.aborted) {
            courses = [];
            sourceStatus = error instanceof Error ? error.message : "UCF source unavailable.";
          }
        } finally {
          if (!controller.signal.aborted) loadingCourses = false;
        }
      }, 120);
    }
  }

  async function hydrateSections(sourceCourses: Course[], term: string, run: number) {
    const compactQuery = query.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
    const baseQuery = compactQuery.replace(/[A-Z]+$/, "");
    const prioritized = compactQuery.match(/^[A-Z]{2,4}[0-9]{4}[A-Z]{0,2}$/)
      ? sourceCourses.filter((course) => course.code.toUpperCase().replace(/[^A-Z0-9]/g, "").startsWith(baseQuery)).slice(0, 4)
      : sourceCourses.slice(0, 4);
    prioritized.forEach((course) => {
      sectionLoading = { ...sectionLoading, [course.id]: true };
      void fetchCourseDetail(course, run);
      void fetchSectionsForCourse(course, term, run, false);
    });
  }

  async function fetchCourseDetail(course: Course, run: number) {
    try {
      const response = await fetch(`/api/ucf/course?course=${encodeURIComponent(course.code)}`);
      const payload = (await response.json()) as { course?: Course | null };
      if (run !== searchRun || !payload.course) return;
      courses = courses.map((item) =>
        item.id === course.id ? { ...payload.course!, sections: item.sections.length ? item.sections : payload.course!.sections } : item
      );
    } catch {
      // Catalog rows are still usable while detailed credits/prereqs hydrate.
    }
  }

  async function fetchSectionsForCourse(course: Course, term: string, run: number, details: boolean) {
    try {
      const response = await fetch(
        `/api/ucf/sections?course=${encodeURIComponent(course.code)}&term=${encodeURIComponent(term)}&details=${details ? "1" : "0"}`
      );
      const payload = (await response.json()) as { sections?: Section[]; sourceStatus?: string };
      if (run !== searchRun) return;
      const sections = payload.sections ?? [];
      courses = courses.map((item) => (item.id === course.id ? { ...item, sections } : item));
      sourceStatus = details ? `Updated live seats for ${course.code}.` : `Loaded live sections for ${course.code}. Updating seats...`;
      if (details) {
        detailLoading = { ...detailLoading, [course.id]: false };
      } else {
        sectionLoading = { ...sectionLoading, [course.id]: false };
        detailLoading = { ...detailLoading, [course.id]: true };
        void fetchSectionsForCourse(course, term, run, true);
      }
    } catch (error) {
      if (run !== searchRun) return;
      if (details) detailLoading = { ...detailLoading, [course.id]: false };
      else sectionLoading = { ...sectionLoading, [course.id]: false };
      sourceStatus = error instanceof Error ? error.message : `Could not load ${course.code} sections.`;
    }
  }

  function defaultState(): PlannerState {
    const first: SchedulePlan = { id: "fall-2026-schedule-1", name: "Schedule 1", selections: [], customEvents: [] };
    return {
      term: terms[0],
      schedulesByTerm: {
        [terms[0]]: [first],
        [terms[1]]: [{ id: "spring-2027-schedule-1", name: "Schedule 1", selections: [], customEvents: [] }],
        [terms[2]]: [{ id: "summer-2027-schedule-1", name: "Schedule 1", selections: [], customEvents: [] }]
      },
      activeScheduleIdByTerm: { [terms[0]]: first.id }
    };
  }

  function filterCourses(
    sourceCourses: Course[],
    text: string,
    currentFilters: Filters,
    genEdFilters: string[],
    onlyOpen: boolean
  ) {
    const normalized = text.trim().toLowerCase();
    const professorToken = normalized.match(/@("?)([^"]+)\1/)?.[2] ?? "";
    const textQuery = normalized.replace(/@("?)[^"]+\1/g, "").trim();
    const compactQuery = textQuery.replace(/[^a-z0-9]/g, "");
    return sourceCourses.filter((course) => {
      const compactCode = course.code.toLowerCase().replace(/[^a-z0-9]/g, "");
      const matchesText =
        !textQuery ||
        course.code.toLowerCase().includes(textQuery) ||
        compactCode.includes(compactQuery) ||
        compactQuery.includes(compactCode) ||
        course.title.toLowerCase().includes(textQuery) ||
        course.genEdTags.some((tag) => tag.toLowerCase().includes(textQuery));
      const matchesProfessor =
        !professorToken || course.sections.some((section) => section.professorName.toLowerCase().includes(professorToken));
      const matchesTags = genEdFilters.length === 0 || genEdFilters.every((tag) => course.genEdTags.includes(tag));
      const min = currentFilters.minCredits ? Number(currentFilters.minCredits) : 0;
      const max = currentFilters.maxCredits ? Number(currentFilters.maxCredits) : Infinity;
      const matchesCredits = course.credits >= min && course.credits <= max;
      const matchesOpen = !onlyOpen || course.sections.some((section) => section.seatsAvailable > 0);
      return matchesText && matchesProfessor && matchesTags && matchesCredits && matchesOpen;
    });
  }

  function updateActiveSchedule(updater: (schedule: SchedulePlan) => SchedulePlan) {
    planner = {
      ...planner,
      schedulesByTerm: {
        ...planner.schedulesByTerm,
        [planner.term]: schedules.map((schedule) => (schedule.id === activeSchedule.id ? updater(schedule) : schedule))
      }
    };
  }

  function switchTerm(term: string) {
    const existing = planner.schedulesByTerm[term] ?? [initialSchedule()];
    planner = {
      ...planner,
      term,
      schedulesByTerm: { ...planner.schedulesByTerm, [term]: existing },
      activeScheduleIdByTerm: { ...planner.activeScheduleIdByTerm, [term]: planner.activeScheduleIdByTerm[term] ?? existing[0].id }
    };
  }

  function createSchedule() {
    const next = { ...initialSchedule(), name: `New schedule ${schedules.length + 1}` };
    planner = {
      ...planner,
      schedulesByTerm: { ...planner.schedulesByTerm, [planner.term]: [...schedules, next] },
      activeScheduleIdByTerm: { ...planner.activeScheduleIdByTerm, [planner.term]: next.id }
    };
    scheduleDropdownOpen = false;
  }

  function renameActiveSchedule(name: string) {
    updateActiveSchedule((schedule) => ({ ...schedule, name: name.trim() || "My schedule" }));
  }

  function duplicateSchedule() {
    const copySchedule: SchedulePlan = {
      ...activeSchedule,
      id: uid("schedule"),
      name: `Copy of ${activeSchedule.name}`,
      selections: activeSchedule.selections.map((selection) => ({ ...selection, id: uid("selection") })),
      customEvents: activeSchedule.customEvents.map((event) => ({ ...event, id: uid("event") }))
    };
    planner = {
      ...planner,
      schedulesByTerm: { ...planner.schedulesByTerm, [planner.term]: [...schedules, copySchedule] },
      activeScheduleIdByTerm: { ...planner.activeScheduleIdByTerm, [planner.term]: copySchedule.id }
    };
    menuOpen = false;
  }

  function deleteSchedule(scheduleId = activeSchedule.id) {
    const remaining = schedules.filter((schedule) => schedule.id !== scheduleId);
    if (remaining.length === 0) {
      planner = {
        ...planner,
        schedulesByTerm: { ...planner.schedulesByTerm, [planner.term]: [initialSchedule()] }
      };
      menuOpen = false;
      return;
    }
    planner = {
      ...planner,
      schedulesByTerm: { ...planner.schedulesByTerm, [planner.term]: remaining },
      activeScheduleIdByTerm: { ...planner.activeScheduleIdByTerm, [planner.term]: remaining[0].id }
    };
    menuOpen = false;
  }

  function addSection(course: Course, section: Section) {
    const replacing = selectedCourse(activeSchedule, course.id);
    if (replacing?.sectionId === section.id) {
      removeSelection(replacing.id);
      notice = `${course.code} section ${section.sectionNumber} removed.`;
      return;
    }
    if (candidateConflicts(activeSchedule, course, section, course.id)) {
      notice = `${course.code} ${section.sectionNumber} conflicts with the active schedule.`;
      return;
    }
    updateActiveSchedule((schedule) => ({
      ...schedule,
      selections: [
        ...schedule.selections.filter((selection) => selection.courseId !== course.id),
        {
          id: replacing?.id ?? uid("selection"),
          courseId: course.id,
          sectionId: section.id,
          course,
          color: replacing?.color ?? colorForIndex(schedule.selections.length)
        }
      ]
    }));
    notice = replacing ? `${course.code} replaced with section ${section.sectionNumber}.` : `${course.code} section ${section.sectionNumber} added.`;
  }

  function removeSelection(sourceId: string) {
    updateActiveSchedule((schedule) => ({ ...schedule, selections: schedule.selections.filter((selection) => selection.id !== sourceId) }));
  }

  function removeCustomEvent(sourceId: string) {
    updateActiveSchedule((schedule) => ({ ...schedule, customEvents: schedule.customEvents.filter((event) => event.id !== sourceId) }));
  }

  function toggleTag(tag: string) {
    if (!hasGenEdData) return;
    filters = {
      ...filters,
      genEdTags: filters.genEdTags.includes(tag) ? filters.genEdTags.filter((item) => item !== tag) : [...filters.genEdTags, tag]
    };
  }

  function toggleEventDay(day: Exclude<DayOfWeek, "Online">) {
    eventDays = eventDays.includes(day) ? eventDays.filter((item) => item !== day) : [...eventDays, day];
  }

  function addCustomEvent() {
    eventError = "";
    if (!eventName.trim()) {
      eventError = "Name is required.";
      return;
    }
    if (eventDays.length === 0) {
      eventError = "Select at least one day.";
      return;
    }
    if (timeToMinutes(eventStart) >= timeToMinutes(eventEnd)) {
      eventError = "Start time must be before end time.";
      return;
    }
    const event: CustomEvent = {
      id: uid("event"),
      name: eventName.trim(),
      days: eventDays,
      startTime: eventStart,
      endTime: eventEnd,
      location: eventLocation.trim(),
      notes: eventNotes.trim(),
      color: blockColors[(activeSchedule.customEvents.length + 4) % blockColors.length]
    };
    if (customEventConflicts(activeSchedule, event)) {
      eventError = "This event conflicts with the active schedule.";
      return;
    }
    updateActiveSchedule((schedule) => ({ ...schedule, customEvents: [...schedule.customEvents, event] }));
    modalOpen = false;
    eventName = "";
    eventDays = [];
    eventStart = "09:00";
    eventEnd = "10:00";
    eventLocation = "";
    eventNotes = "";
  }

  function eventTimes() {
    return Array.from({ length: (23 - 5) * 4 + 1 }, (_, index) => {
      const total = 5 * 60 + index * 15;
      const hours = Math.floor(total / 60);
      const minutes = total % 60;
      const value = `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
      return { value, label: minutesToDisplay(total) };
    });
  }
</script>

<svelte:head>
  <title>Knight Planner</title>
  <meta name="description" content="UCF schedule planner with live UCF catalog, myUCF sections, and RateMyProfessors ratings." />
</svelte:head>

<main class="min-h-screen bg-bgLight text-textLight">
  <nav class="fixed top-0 z-50 flex h-12 w-full items-center justify-between border-b-2 border-ucfGold bg-ucfBlack px-4 text-white">
    <div class="flex items-center gap-3">
      <a href="/" class="grid h-9 w-9 place-items-center" aria-label="Knight Planner home">
        <svg viewBox="0 0 64 64" class="h-9 w-9" aria-hidden="true">
          <path d="M32 4 52 12v15c0 14.5-7.7 25-20 33C19.7 52 12 41.5 12 27V12L32 4Z" fill="#ffc904" />
          <path d="M32 9 47 15v12c0 11.4-5.4 19.7-15 26.2C22.4 46.7 17 38.4 17 27V15l15-6Z" fill="#050505" />
          <path d="M24 19h6v9l8-9h7l-10 11 11 15h-7l-8-11-1 1v10h-6V19Z" fill="#ffc904" />
          <path d="M17 14 32 4l15 10-15 5-15-5Z" fill="#f7d97a" opacity=".9" />
          <path d="M32 6v47" stroke="#ffc904" stroke-width="2" opacity=".35" />
        </svg>
      </a>
      <strong class="text-lg">Knight Planner</strong>
      <div class="hidden rounded-md border border-white/15 p-1 text-sm md:flex">
        <button
          class={`rounded px-3 py-1 font-bold ${activeView === "planner" ? "bg-ucfGold text-black" : "text-white/70 hover:text-white"}`}
          on:click={() => (activeView = "planner")}
        >
          Planner
        </button>
        <button
          class={`rounded px-3 py-1 font-bold ${activeView === "requirements" ? "bg-ucfGold text-black" : "text-white/70 hover:text-white"}`}
          on:click={() => (activeView = "requirements")}
        >
          Requirements
        </button>
      </div>
    </div>
    <div class="flex items-center gap-2 text-sm">
      <a class="hidden rounded-md px-2 py-1 hover:bg-white/10 sm:inline-flex" href={issueMailto}>Report an issue</a>
      <button class="hidden rounded-md px-2 py-1 hover:bg-white/10 sm:inline-flex" on:click={() => (aboutOpen = true)}>About</button>
      <a class="inline-flex items-center gap-1 rounded-md px-2 py-1 hover:bg-white/10" href={githubUrl} target="_blank" rel="noreferrer">GitHub</a>
    </div>
  </nav>

  {#if notice}
    <div class="fixed left-1/2 top-16 z-50 max-w-[90vw] -translate-x-1/2 rounded-md border border-ucfDarkGold bg-ucfBlack px-4 py-2 text-sm font-semibold text-ucfGold shadow-lg">
      {notice}
      <button class="ml-3 align-middle text-white" on:click={() => (notice = "")} aria-label="Dismiss notice">×</button>
    </div>
  {/if}

  {#if activeView === "planner"}
  <div id="planner-container" class="fixed bottom-0 top-12 grid w-full grid-cols-1 overflow-y-auto px-3 lg:grid-cols-[22rem_minmax(0,1fr)] lg:overflow-hidden">
    <aside class="order-2 flex min-h-80 w-full flex-col border-t border-divBorderLight bg-bgLight lg:order-1 lg:h-full lg:border-r lg:border-t-0">
      <div id="planner-course-search" class="px-1 pt-1">
        <div class="ml-1 flex flex-row pb-1 text-xs text-secCodesLight 2xl:text-sm">
          <div>{planner.term}</div>
          <div class="grow text-right">Credits: {credits}</div>
        </div>

        <div class="flex w-full flex-col">
          <div class="flex w-full flex-row pb-1 text-sm" title="Toggle schedule dropdown">
            <div class="flex min-w-0 grow flex-row justify-start rounded-md px-0.5 py-1 text-left hover:bg-hoverLight">
              <button class:rotate-90={scheduleDropdownOpen} class="origin-center transition" on:click={() => (scheduleDropdownOpen = !scheduleDropdownOpen)}>
                ›
              </button>
              <input
                id="schedule-name-input"
                class="mr-1 min-w-0 grow cursor-text rounded border-none bg-bgLight px-0.5 py-0 text-sm outline-none"
                value={activeSchedule.name}
                on:input={(event) => renameActiveSchedule(event.currentTarget.value)}
                title="Schedule name"
              />
            </div>
            <button class="h-7 rounded-md px-1 hover:bg-hoverLight" title="Add custom event" on:click={() => (modalOpen = true)}>＋</button>
            <button class="h-7 rounded-md px-1 hover:bg-hoverLight" title="Create new schedule" on:click={createSchedule}>＋</button>
            <div class="relative">
              <button class="h-7 rounded-md px-1 hover:bg-hoverLight" title="Schedule options" on:click={() => (menuOpen = !menuOpen)}>⋮</button>
              {#if menuOpen}
                <div class="absolute right-0 z-20 mt-1 w-32 rounded-md border border-outlineLight bg-bgLight p-1 shadow-lg">
                  <button class="block w-full rounded px-2 py-1 text-left text-sm hover:bg-hoverLight" on:click={() => (modalOpen = true, menuOpen = false)}>Add Event</button>
                  <button class="block w-full rounded px-2 py-1 text-left text-sm hover:bg-hoverLight" on:click={duplicateSchedule}>Duplicate</button>
                  <button class="block w-full rounded px-2 py-1 text-left text-sm hover:bg-hoverLight" on:click={() => deleteSchedule()}>Delete</button>
                </div>
              {/if}
            </div>
          </div>

          {#if scheduleDropdownOpen}
            <div class="w-full pb-0.5 pl-4 pr-6">
              {#each schedules.filter((schedule) => schedule.id !== activeSchedule.id) as schedule}
                <div class="flex h-6 w-full flex-row">
                  <button
                    class="h-6 min-w-0 grow items-center rounded-md pl-1.5 text-left text-sm hover:bg-hoverLight"
                    on:click={() => {
                      planner = {
                        ...planner,
                        activeScheduleIdByTerm: { ...planner.activeScheduleIdByTerm, [planner.term]: schedule.id }
                      };
                      scheduleDropdownOpen = false;
                    }}
                  >
                    <span class="block w-full min-w-0 overflow-x-auto whitespace-nowrap">{schedule.name}</span>
                  </button>
                  <button class="flex h-6 w-6 shrink-0 items-center justify-center rounded-md hover:bg-hoverLight" on:click={() => deleteSchedule(schedule.id)}>×</button>
                </div>
              {/each}
            </div>
          {/if}
        </div>

        <div class="relative flex w-full flex-col border-b-2 border-t-2 border-divBorderLight">
          <div class="relative pt-1">
            <input
              id="planner-course-search-input"
              bind:value={query}
              placeholder="Search courses (e.g. 'COP3502C') or @professor"
              class="w-full rounded-lg border-2 border-outlineLight bg-transparent px-2 py-0 text-xl placeholder:text-base lg:text-base lg:placeholder:text-sm"
            />
          </div>

          <div class="flex flex-col text-secCodesLight">
            <div class="mt-1 flex flex-row items-center justify-between gap-1 px-1 py-0.5">
              <button class="flex grow flex-row items-center rounded-md text-sm hover:text-textLight" title="Show/hide course search filters" on:click={() => (filtersOpen = !filtersOpen)}>
                ⚙ {appliedFilterCount} filter{appliedFilterCount === 1 ? "" : "s"} applied
              </button>
              <button class="text-right text-sm hover:text-textLight" on:click={() => (filters = { ...emptyFilters })}>Clear filters</button>
            </div>

            {#if filtersOpen}
              <div class="mx-1 my-1 flex flex-col gap-2 px-2 py-1 text-xs">
                {#if hasGenEdData}
                  <div class="flex flex-col gap-1">
                    <span>Gen-Eds:</span>
                    {#each ucfAttributeTags as tag}
                      <label class="flex items-center gap-2">
                        <input type="checkbox" checked={filters.genEdTags.includes(tag)} on:change={() => toggleTag(tag)} />
                        {tag}
                      </label>
                    {/each}
                  </div>
                {:else if courses.length > 0}
                  <p class="rounded-md bg-lightOrange/40 p-2 text-xs font-semibold text-black">
                    UCF Catalog did not return per-course Gen Ed attributes for these results. Attribute filters will appear when the live source provides them.
                  </p>
                {/if}

                <div class="flex flex-row gap-4">
                  <label class="flex flex-row items-center gap-1">Min credits:
                    <input class="w-12 rounded-md border border-secCodesLight bg-bgLight px-1 py-0 text-xs" type="number" min="0" bind:value={filters.minCredits} />
                  </label>
                  <label class="flex flex-row items-center gap-1">Max credits:
                    <input class="w-12 rounded-md border border-secCodesLight bg-bgLight px-1 py-0 text-xs" type="number" min="0" bind:value={filters.maxCredits} />
                  </label>
                </div>

                <label class="flex flex-row items-center text-xs">
                  <input class="mr-2" type="checkbox" disabled={!hasSectionData} bind:checked={filters.onlyOpen} />
                  Only show open sections
                </label>
              </div>
            {/if}
          </div>

          <p class="mx-1 mb-1 rounded-md bg-bgSecondaryLight p-2 text-xs font-semibold text-black/70">
            {loadingCourses ? "Loading live UCF data..." : sourceStatus}
          </p>
        </div>
      </div>

      <section id="planner-search-results" class="custom-scrollbar min-h-[12.25rem] grow overflow-y-auto px-1 pb-2 lg:min-h-0">
        {#each visibleCourses as course}
          <article id={`results-${course.code}`} class="my-2 flex scroll-mt-2 flex-col rounded-lg border-2 border-outlineLight bg-bgSecondaryLight px-2">
            <button class="top-0 z-10 -mb-[2px] border-b-2 border-outlineLight bg-bgSecondaryLight px-2 py-2 text-left" on:click={() => (expanded = { ...expanded, [course.id]: !expanded[course.id] })}>
              <div class="flex flex-row align-middle">
                <div class="grow text-left align-middle"><b>{course.code}</b></div>
                <div class="grow text-right align-middle text-sm">
                  Credits: {course.credits}
                  <span
                    class="ml-2 inline-flex h-6 w-6 items-center justify-center rounded border border-outlineLight font-black hover:bg-hoverLight"
                    role="button"
                    tabindex="0"
                    title="Hide this course version"
                    on:click|stopPropagation={() => (hiddenCourses = { ...hiddenCourses, [course.id]: true })}
                    on:keydown|stopPropagation={(event) => {
                      if (event.key === "Enter" || event.key === " ") hiddenCourses = { ...hiddenCourses, [course.id]: true };
                    }}
                  >
                    ×
                  </span>
                </div>
              </div>
              <div class="max-w-[254px] text-sm xl:max-w-[314px]">{course.title}</div>
              <div class="flex w-full flex-row content-center text-left text-sm text-secCodesLight">
                <span class:rotate-90={expanded[course.id]} class="-ml-1 transition-transform">›</span>
                <span>{expanded[course.id] ? "Hide details" : "Show details"}</span>
              </div>
              {#if expanded[course.id]}
                <div class="py-1 text-sm leading-tight">
                  <a href={course.catalogUrl} class="text-ucfDarkGold underline" target="_blank" rel="noreferrer">View on UCF Catalog</a>
                  <p>{course.description}</p>
                  <p><b>Prerequisites:</b> {course.prerequisites}</p>
                </div>
              {/if}
            </button>

            {#if sectionLoading[course.id]}
              <div class="border-t-2 border-outlineLight px-2 py-3 text-sm font-semibold text-black/60">Loading live class sections...</div>
            {:else if course.sections.length === 0}
              <div class="border-t-2 border-outlineLight px-2 py-3 text-sm font-semibold text-black/60">No live class sections returned yet.</div>
            {/if}

            {#each course.sections as section}
              {@const chosen = selectedCourse(activeSchedule, course.id)}
              {@const isChosen = chosen?.sectionId === section.id}
              {@const conflicts = !isChosen && candidateConflicts(activeSchedule, course, section, course.id)}
              <button
                class={`flex w-full flex-row border-t-2 border-outlineLight pb-1 text-left transition ${isChosen ? "bg-lightOrange" : conflicts ? "cursor-not-allowed bg-red-50 text-black/60" : "hover:bg-hoverLight"}`}
                disabled={conflicts}
                title={isChosen ? "Remove course from schedule" : "Add course to schedule"}
                on:click={() => addSection(course, section)}
                on:mouseenter={() => (hoveredSection = isChosen || conflicts ? null : { course, section })}
                on:mouseleave={() => (hoveredSection = null)}
                on:focus={() => (hoveredSection = isChosen || conflicts ? null : { course, section })}
                on:blur={() => (hoveredSection = null)}
              >
                <div class="w-12 shrink-0 pt-1 text-sm font-semibold text-secCodesLight xl:w-14 xl:text-base">{section.sectionNumber}</div>
                <div class="min-w-0 grow py-1">
                  <div class="text-sm">
                    <b>{section.professorName}</b>
                    <ProfessorRating name={section.professorName} />
                    {#if isChosen}<span class="float-right text-green-700">✓</span>{/if}
                  </div>
                  <div class="pb-1 text-xs font-medium">
                    {#if section.seatDetailsStatus === "loading" || detailLoading[course.id]}
                      Seat and waitlist details loading...
                    {:else if section.seatsTotal > 0}
                      {section.seatsAvailable} / {section.seatsTotal} seats available
                      {#if section.enrollmentTotal !== undefined} ({section.enrollmentTotal} enrolled){/if}
                      {#if section.waitlistTotal !== undefined && section.waitlistCapacity !== undefined} | Waitlist: {section.waitlistTotal} / {section.waitlistCapacity}{/if}
                      {#if section.waitlistTotal !== undefined && section.waitlistCapacity === undefined} | Waitlist limit unavailable{/if}
                    {:else}
                      Seat count unavailable
                    {/if}
                  </div>
                  {#each section.meetings as meeting}
                    <div class="flex w-full flex-row text-xs font-medium">
                      <span class="grow">{dayLabels[meeting.dayOfWeek]} {formatTimeRange(meeting.startTime, meeting.endTime)}</span>
                      <span class="grow text-right">
                        {#if meeting.building}
                          <a class="rounded-md p-0.5 text-ucfDarkGold underline hover:bg-hoverLight" href={`https://map.ucf.edu/?show=${meeting.building}`} target="_blank" rel="noreferrer" on:click|stopPropagation>
                            {[meeting.building, meeting.room].filter(Boolean).join(" ")}
                          </a>
                        {/if}
                      </span>
                    </div>
                  {/each}
                  <div class="mt-1 flex flex-wrap gap-1 text-[11px] font-bold">
                    <span class="rounded bg-black px-1.5 py-0.5 capitalize text-ucfGold">{section.mode}</span>
                    <span>{section.campus}</span>
                    {#if conflicts}<span class="font-black text-red-700">Conflicts with selected class or custom event</span>{/if}
                  </div>
                </div>
              </button>
            {/each}
          </article>
        {/each}

        {#if visibleCourses.length === 0}
          <div class="my-2 rounded-lg border-2 border-dashed border-outlineLight bg-bgSecondaryLight p-6 text-center text-sm text-black/60">
            {query.trim().length < 2 ? "Search a real UCF course code, title, or professor." : filteredCourses.length > 0 ? "All matching course versions are hidden. Search again to reset." : "No live UCF courses match this search."}
          </div>
        {/if}
      </section>

      <section class="border-t-2 border-divBorderLight px-2 py-2">
        <div class="mb-1 flex items-center justify-between text-sm font-bold">
          <span>Custom Events</span>
          <button class="rounded-md bg-ucfBlack px-2 py-1 text-xs font-black text-ucfGold" on:click={() => (modalOpen = true)}>Add</button>
        </div>
        {#each activeSchedule.customEvents as event}
          <div class="flex items-center justify-between rounded-md bg-bgSecondaryLight px-2 py-1 text-xs">
            <span class="font-semibold">{event.name}</span>
            <button class="font-black text-red-700" on:click={() => removeCustomEvent(event.id)}>Remove</button>
          </div>
        {:else}
          <p class="text-xs text-black/55">Add work, commute, clubs, or study blocks.</p>
        {/each}
      </section>
    </aside>

    <section class="order-1 min-w-0 py-3 lg:order-2 lg:h-full lg:pl-2">
      <div class="mb-2 flex flex-wrap items-center justify-between gap-2 px-1 text-xs font-semibold text-black/70">
        <div>{planner.term}</div>
        <div class="flex flex-wrap items-center gap-2 text-[11px]">
          <span class="rounded-md bg-ucfBlack px-2 py-1 text-ucfGold">Live UCF sources</span>
          <span class="rounded-md bg-bgSecondaryLight px-2 py-1 text-black">RMP</span>
          <span class="rounded-md bg-bgSecondaryLight px-2 py-1 text-black">Kuali</span>
          <span class="rounded-md bg-bgSecondaryLight px-2 py-1 text-black">myUCF</span>
        </div>
      </div>
      <WeeklyCalendar {blocks} {removeSelection} {removeCustomEvent} />
    </section>
  </div>
  {:else}
    <section class="fixed bottom-0 top-12 w-full overflow-auto bg-bgLight px-4 py-5">
      <div class="mx-auto max-w-5xl">
        <div class="mb-4 flex items-center justify-between border-b-2 border-divBorderLight pb-3">
          <div>
            <h1 class="text-2xl font-black">Requirements</h1>
            <p class="text-sm text-black/60">Track UCF planning buckets alongside your schedules.</p>
          </div>
          <button class="rounded-md bg-ucfBlack px-3 py-2 text-sm font-bold text-ucfGold" on:click={() => (activeView = "planner")}>
            Back to Planner
          </button>
        </div>

        <div class="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {#each ["GEP Communication", "GEP Math", "GEP Science", "State Core", "Major Prereqs", "Major Core", "Electives", "Honors / Research"] as bucket}
            <article class="rounded-md border-2 border-outlineLight bg-bgSecondaryLight p-4">
              <div class="mb-2 flex items-center justify-between">
                <h2 class="font-black">{bucket}</h2>
                <span class="rounded bg-ucfGold px-2 py-0.5 text-xs font-black text-black">Plan</span>
              </div>
              <p class="text-sm text-black/65">Use course search to add matching classes, then compare them against this bucket.</p>
            </article>
          {/each}
        </div>
      </div>
    </section>
  {/if}

  {#if modalOpen}
    <div class="fixed inset-0 z-50 grid place-items-center bg-black/55 p-4">
      <form class="w-full max-w-lg rounded-md bg-white p-4 shadow-lg" on:submit|preventDefault={addCustomEvent}>
        <div class="flex items-center justify-between">
          <h2 class="text-lg font-black">Add Custom Event</h2>
          <button type="button" on:click={() => (modalOpen = false)} aria-label="Close modal">×</button>
        </div>
        <label class="mt-3 block text-sm font-bold">Name<input class="mt-1 w-full rounded-md border px-3 py-2" bind:value={eventName} /></label>
        <div class="mt-3 text-sm font-bold">Days</div>
        <div class="mt-1 flex gap-2">
          {#each days as day}
            <button type="button" class={`h-10 w-10 rounded-md border font-black ${eventDays.includes(day) ? "bg-ucfGold" : "bg-white"}`} on:click={() => toggleEventDay(day)}>{day}</button>
          {/each}
        </div>
        <div class="mt-3 grid grid-cols-2 gap-3">
          <label class="text-sm font-bold">Start
            <select class="mt-1 w-full rounded-md border px-3 py-2" bind:value={eventStart}>
              {#each eventTimes() as option}<option value={option.value}>{option.label}</option>{/each}
            </select>
          </label>
          <label class="text-sm font-bold">End
            <select class="mt-1 w-full rounded-md border px-3 py-2" bind:value={eventEnd}>
              {#each eventTimes() as option}<option value={option.value}>{option.label}</option>{/each}
            </select>
          </label>
        </div>
        <label class="mt-3 block text-sm font-bold">Location<input class="mt-1 w-full rounded-md border px-3 py-2" bind:value={eventLocation} /></label>
        <label class="mt-3 block text-sm font-bold">Notes<textarea class="mt-1 min-h-20 w-full rounded-md border px-3 py-2" bind:value={eventNotes}></textarea></label>
        {#if eventError}<div class="mt-3 rounded-md bg-red-50 p-2 text-sm font-bold text-red-700">{eventError}</div>{/if}
        <div class="mt-4 flex justify-end gap-2">
          <button type="button" class="rounded-md border px-4 py-2 font-bold" on:click={() => (modalOpen = false)}>Cancel</button>
          <button type="submit" class="rounded-md bg-ucfBlack px-4 py-2 font-bold text-ucfGold">Add event</button>
        </div>
      </form>
    </div>
  {/if}

  {#if aboutOpen}
    <div class="fixed inset-0 z-50 grid place-items-center bg-black/55 p-4">
      <section id="about" class="max-w-lg rounded-lg bg-white p-5 shadow-lg">
        <div class="flex items-center justify-between">
          <h2 class="text-lg font-black">About Knight Planner</h2>
          <button on:click={() => (aboutOpen = false)} aria-label="Close about">×</button>
        </div>
        <p class="mt-3 text-sm">
          Knight Planner is a UCF course schedule planner built by Henrique Silva Ribeiro. It uses live UCF Kuali catalog data,
          live myUCF class sections, and RateMyProfessors ratings.
        </p>
        <div class="mt-4 flex gap-2">
          <a class="rounded-md bg-ucfBlack px-3 py-2 text-sm font-bold text-ucfGold" href={githubUrl} target="_blank" rel="noreferrer">GitHub</a>
          <a class="rounded-md border px-3 py-2 text-sm font-bold" href={issueMailto}>Report an issue</a>
        </div>
      </section>
    </div>
  {/if}
</main>
