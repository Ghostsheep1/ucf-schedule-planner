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
    overlaps,
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
  const appVersion = "1.0.0";
  const fallbackDepartments = [
    ["ACG", "Accounting"],
    ["AMH", "American History"],
    ["ANT", "Anthropology"],
    ["BSC", "Biological Sciences"],
    ["CHM", "Chemistry"],
    ["CIS", "Computer & Information Science"],
    ["COP", "Computer Programming"],
    ["COT", "Computing Theory"],
    ["ECO", "Economics"],
    ["EGN", "Engineering"],
    ["ENC", "English Composition"],
    ["FIL", "Film"],
    ["FIN", "Finance"],
    ["HUM", "Humanities"],
    ["MAC", "Mathematics"],
    ["MAP", "Mathematics Applications"],
    ["MAS", "Mathematics Advanced"],
    ["MGF", "Mathematics General"],
    ["PCB", "Process Biology"],
    ["PEER", "Health Center"],
    ["PERS", "Persian"],
    ["PHIL", "Philosophy"],
    ["PHPE", "Philosophy, Politics, and Economics"],
    ["PHSC", "Public Health Science"],
    ["PHY", "Physics"],
    ["PLCY", "Public Policy"],
    ["PLSC", "Plant Sciences"],
    ["PORT", "Portuguese"],
    ["PSY", "Psychology"],
    ["SLS", "Student Life Skills"],
    ["STA", "Statistics"]
  ];
  let departments = fallbackDepartments;

  let planner: PlannerState = defaultState();
  let hydrated = false;
  let query = "";
  let filters: Filters = { ...emptyFilters };
  let filtersOpen = false;
  let genEdDropdownOpen = false;
  let courses: Course[] = [];
  let sourceStatus = "Search UCF catalog and myUCF class search.";
  let loadingCourses = false;
  let activeView: "planner" | "generator" = "planner";
  let menuOpen = false;
  let aboutMenuOpen = false;
  let infoPage: "terms" | "privacy" | "changelog" | null = null;
  let darkMode = false;
  let scheduleDropdownOpen = false;
  let modalOpen = false;
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
  let generatorCourses: Course[] = [];
  let generatorResults: SchedulePlan[] = [];
  let generatorNotice = "Add courses and set constraints, then generate schedules.";
  let generatorConstraints = {
    noBefore: "",
    noAfter: "",
    daysOff: [] as Exclude<DayOfWeek, "Online">[],
    onlyOpen: true,
    minGap: "0",
    minCredits: ""
  };

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
  $: departmentSuggestions = departmentMatches(query);
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
    darkMode = localStorage.getItem("knight-planner-theme") === "dark";
    document.documentElement.classList.toggle("dark", darkMode);
    hydrated = true;
    void loadDepartments();
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
    const professorOnly = cleaned.trim().startsWith("@");

    if (professorOnly) {
      sourceStatus = courses.length
        ? "Filtering loaded sections by professor. Add a UCF department or course before @professor to load more."
        : "Add a UCF department or course before @professor, for example PHY @stolbov.";
      loadingCourses = false;
    } else if (cleaned.length < 2) {
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
    const catalogPart = query.replace(/@("?)[^"]+\1/g, "").trim();
    const professorToken = query.match(/@("?)([^"]+)\1/)?.[2]?.trim() ?? "";
    const compactQuery = catalogPart.toUpperCase().replace(/[^A-Z0-9]/g, "");
    const baseQuery = compactQuery.replace(/[A-Z]+$/, "");
    const hydrationLimit = professorToken ? 12 : 4;
    const prioritized = compactQuery.match(/^[A-Z]{2,4}[0-9]{4}[A-Z]{0,2}$/)
      ? sourceCourses.filter((course) => course.code.toUpperCase().replace(/[^A-Z0-9]/g, "").startsWith(baseQuery)).slice(0, hydrationLimit)
      : sourceCourses.slice(0, hydrationLimit);
    prioritized.forEach((course) => {
      sectionLoading = { ...sectionLoading, [course.id]: true };
      void fetchCourseDetail(course, run);
      void fetchSectionsForCourse(course, term, run, false);
    });
  }

  async function loadDepartments() {
    try {
      const response = await fetch("/api/ucf/departments");
      const payload = (await response.json()) as { departments?: { code: string; name: string }[] };
      if (payload.departments?.length) {
        departments = payload.departments.map((department) => [department.code, department.name]);
      }
    } catch {
      departments = fallbackDepartments;
    }
  }

  async function fetchCourseDetail(course: Course, run: number) {
    try {
      const response = await fetch(`/api/ucf/course?course=${encodeURIComponent(course.code)}`);
      const payload = (await response.json()) as { course?: Course | null };
      if (run !== searchRun || !payload.course) return;
      courses = courses.map((item) =>
        item.id === course.id ? { ...payload.course!, sections: item.sections.length ? item.sections : payload.course!.sections } : item
      );
      generatorCourses = generatorCourses.map((item) =>
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
      generatorCourses = generatorCourses.map((item) => (item.id === course.id ? { ...item, sections } : item));
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
        !professorToken ||
        sectionLoading[course.id] ||
        detailLoading[course.id] ||
        course.sections.some((section) => section.professorName.toLowerCase().includes(professorToken));
      const matchesTags = genEdFilters.length === 0 || genEdFilters.every((tag) => course.genEdTags.includes(tag));
      const min = currentFilters.minCredits ? Number(currentFilters.minCredits) : 0;
      const max = currentFilters.maxCredits ? Number(currentFilters.maxCredits) : Infinity;
      const matchesCredits = course.credits >= min && course.credits <= max;
      const matchesOpen = !onlyOpen || course.sections.some((section) => section.seatsAvailable > 0);
      return matchesText && matchesProfessor && matchesTags && matchesCredits && matchesOpen;
    });
  }

  function departmentMatches(text: string) {
    const clean = text.trim().toUpperCase().replace(/[^A-Z]/g, "");
    if (!clean || /[0-9@]/.test(clean) || clean.length > 4) return [];
    return departments.filter(([code, name]) => code.startsWith(clean) || name.toUpperCase().includes(clean)).slice(0, 10);
  }

  function selectDepartment(code: string) {
    query = `${code} `;
  }

  function setTheme(nextDark: boolean) {
    darkMode = nextDark;
    document.documentElement.classList.toggle("dark", darkMode);
    localStorage.setItem("knight-planner-theme", darkMode ? "dark" : "light");
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

  function exportSchedule() {
    const ics = buildIcs(activeSchedule, planner.term);
    const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "Knight_Planner_Schedule.ics";
    link.click();
    URL.revokeObjectURL(url);
  }

  function buildIcs(schedule: SchedulePlan, term: string) {
    const { start, until } = termDates(term);
    const dayToIcs: Record<Exclude<DayOfWeek, "Online">, string> = { M: "MO", Tu: "TU", W: "WE", Th: "TH", F: "FR", Sa: "SA", Su: "SU" };
    const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Knight Planner//EN"];
    getSelectionPairs(schedule).forEach(({ course, section }) => {
      const grouped = new Map<string, typeof section.meetings>();
      section.meetings.filter((meeting) => meeting.dayOfWeek !== "Online" && meeting.startTime && meeting.endTime).forEach((meeting) => {
        const key = `${meeting.startTime}-${meeting.endTime}-${[meeting.building, meeting.room].filter(Boolean).join(" ")}`;
        grouped.set(key, [...(grouped.get(key) ?? []), meeting]);
      });
      grouped.forEach((meetings) => {
        const first = meetings[0];
        const location = [first.building, first.room].filter(Boolean).join(" ");
        const firstDate = firstDateForDay(start, first.dayOfWeek as Exclude<DayOfWeek, "Online">);
        lines.push(
          "BEGIN:VEVENT",
          `SUMMARY:${escapeIcs(`${course.code} (${section.sectionNumber})${location ? ` - ${location}` : ""}`)}`,
          `DTSTART:${formatIcsDateTime(firstDate, first.startTime)}`,
          `DTEND:${formatIcsDateTime(firstDate, first.endTime)}`,
          `RRULE:FREQ=WEEKLY;BYDAY=${meetings.map((meeting) => dayToIcs[meeting.dayOfWeek as Exclude<DayOfWeek, "Online">]).join(",")};UNTIL=${until}`,
          `LOCATION:${escapeIcs(location)}`,
          `DESCRIPTION:${escapeIcs(`Course: ${course.title}\\nInstructors: ${section.professorName}`)}`,
          `UID:${escapeIcs(`${course.code}-${section.sectionNumber}-${first.startTime.replace(":", "")}@knight-planner`)}`,
          "END:VEVENT"
        );
      });
    });
    schedule.customEvents.forEach((event) => {
      const firstDate = firstDateForDay(start, event.days[0] ?? "M");
      lines.push(
        "BEGIN:VEVENT",
        `SUMMARY:${escapeIcs(event.name)}`,
        `DTSTART:${formatIcsDateTime(firstDate, event.startTime)}`,
        `DTEND:${formatIcsDateTime(firstDate, event.endTime)}`,
        `RRULE:FREQ=WEEKLY;BYDAY=${event.days.map((day) => dayToIcs[day]).join(",")};UNTIL=${until}`,
        `LOCATION:${escapeIcs(event.location ?? "")}`,
        `DESCRIPTION:${escapeIcs(event.notes ?? "Custom event")}`,
        `UID:${escapeIcs(`${event.id}@knight-planner`)}`,
        "END:VEVENT"
      );
    });
    lines.push("END:VCALENDAR");
    return `${lines.join("\r\n")}\r\n`;
  }

  function termDates(term: string) {
    const year = Number(term.match(/20\d{2}/)?.[0] ?? "2026");
    if (/spring/i.test(term)) return { start: new Date(year, 0, 12), until: `${year}0501T235959Z` };
    if (/summer/i.test(term)) return { start: new Date(year, 4, 11), until: `${year}0807T235959Z` };
    return { start: new Date(year, 7, 24), until: `${year}1211T235959Z` };
  }

  function firstDateForDay(start: Date, day: Exclude<DayOfWeek, "Online">) {
    const target: Record<Exclude<DayOfWeek, "Online">, number> = { Su: 0, M: 1, Tu: 2, W: 3, Th: 4, F: 5, Sa: 6 };
    const date = new Date(start);
    date.setDate(start.getDate() + ((target[day] - start.getDay() + 7) % 7));
    return date;
  }

  function formatIcsDateTime(date: Date, time: string) {
    const [hour, minute] = time.split(":");
    return `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}${String(date.getDate()).padStart(2, "0")}T${hour}${minute}00`;
  }

  function escapeIcs(value: string) {
    return value.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
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

  function toggleGeneratorDay(day: Exclude<DayOfWeek, "Online">) {
    generatorConstraints = {
      ...generatorConstraints,
      daysOff: generatorConstraints.daysOff.includes(day)
        ? generatorConstraints.daysOff.filter((item) => item !== day)
        : [...generatorConstraints.daysOff, day]
    };
  }

  function addGeneratorCourse(course: Course) {
    if (generatorCourses.some((item) => item.id === course.id)) return;
    generatorCourses = [...generatorCourses, course];
    generatorNotice = `${course.code} added to generator.`;
  }

  function removeGeneratorCourse(courseId: string) {
    generatorCourses = generatorCourses.filter((course) => course.id !== courseId);
    generatorResults = [];
  }

  function sectionPassesGenerator(section: Section) {
    if (generatorConstraints.onlyOpen && section.seatDetailsStatus === "live" && section.seatsAvailable <= 0) return false;
    const noBefore = generatorConstraints.noBefore ? timeToMinutes(generatorConstraints.noBefore) : 0;
    const noAfter = generatorConstraints.noAfter ? timeToMinutes(generatorConstraints.noAfter) : 24 * 60;
    return section.meetings.every((meeting) => {
      if (meeting.dayOfWeek === "Online") return true;
      if (generatorConstraints.daysOff.includes(meeting.dayOfWeek)) return false;
      if (noBefore && timeToMinutes(meeting.startTime) < noBefore) return false;
      if (generatorConstraints.noAfter && timeToMinutes(meeting.endTime) > noAfter) return false;
      return true;
    });
  }

  function minGapSatisfied(blocks: CalendarBlock[]) {
    const minGap = Number(generatorConstraints.minGap || 0);
    if (!minGap) return true;
    const byDay = new Map<DayOfWeek, CalendarBlock[]>();
    blocks.forEach((block) => {
      if (block.dayOfWeek === "Online") return;
      byDay.set(block.dayOfWeek, [...(byDay.get(block.dayOfWeek) ?? []), block]);
    });
    for (const dayBlocks of byDay.values()) {
      const sorted = dayBlocks.sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));
      for (let index = 1; index < sorted.length; index += 1) {
        if (timeToMinutes(sorted[index].startTime) - timeToMinutes(sorted[index - 1].endTime) < minGap) return false;
      }
    }
    return true;
  }

  function generateSchedules() {
    generatorResults = [];
    const readyCourses = generatorCourses.filter((course) => course.sections.length > 0);
    if (readyCourses.length === 0) {
      generatorNotice = "Add courses with loaded live sections first.";
      return;
    }
    const minCredits = Number(generatorConstraints.minCredits || 0);
    const options = readyCourses.map((course) => ({
      course,
      sections: course.sections.filter(sectionPassesGenerator)
    }));
    if (options.some((option) => option.sections.length === 0)) {
      generatorNotice = "At least one selected course has no sections matching these constraints.";
      return;
    }
    const results: SchedulePlan[] = [];
    const walk = (index: number, selections: SchedulePlan["selections"]) => {
      if (results.length >= 250) return;
      if (index === options.length) {
        const candidate: SchedulePlan = { id: uid("generated"), name: `Generated ${results.length + 1}`, selections, customEvents: [] };
        const candidateBlocks = markConflicts(getSelectionPairs(candidate).flatMap(({ course, section, selection }) => sectionToBlocks(course, section, selection)));
        if (!candidateBlocks.some((block) => block.conflict) && minGapSatisfied(candidateBlocks) && uniqueCredits(candidate) >= minCredits) {
          results.push(candidate);
        }
        return;
      }
      const option = options[index];
      for (const section of option.sections) {
        const selection = {
          id: uid("generated-selection"),
          courseId: option.course.id,
          sectionId: section.id,
          course: option.course,
          color: colorForIndex(index)
        };
        const next = [...selections, selection];
        const partial: SchedulePlan = { id: "partial", name: "Partial", selections: next, customEvents: [] };
        const partialBlocks = getSelectionPairs(partial).flatMap(({ course, section: selectedSection, selection: selected }) =>
          sectionToBlocks(course, selectedSection, selected)
        );
        if (!partialBlocks.some((block, blockIndex) => partialBlocks.some((other, otherIndex) => blockIndex !== otherIndex && overlaps(block, other)))) {
          walk(index + 1, next);
        }
      }
    };
    walk(0, []);
    generatorResults = results;
    generatorNotice = results.length === 250 ? "Showing first 250 matching schedules." : `${results.length} matching schedules generated.`;
  }

  function useGeneratedSchedule(schedule: SchedulePlan) {
    const copySchedule = {
      ...schedule,
      id: uid("schedule"),
      name: schedule.name,
      selections: schedule.selections.map((selection) => ({ ...selection, id: uid("selection") }))
    };
    planner = {
      ...planner,
      schedulesByTerm: { ...planner.schedulesByTerm, [planner.term]: [...schedules, copySchedule] },
      activeScheduleIdByTerm: { ...planner.activeScheduleIdByTerm, [planner.term]: copySchedule.id }
    };
    activeView = "planner";
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

<main class="min-h-screen bg-bgLight text-textLight dark:bg-bgDark dark:text-textDark">
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
    </div>
    <div class="flex items-center gap-2 text-sm">
      <div class="hidden items-center gap-1 md:flex">
        <button
          class={`rounded-md px-2 py-1 font-bold ${activeView === "planner" ? "text-ucfGold underline decoration-ucfGold decoration-2 underline-offset-4" : "text-white/80 hover:bg-white/10 hover:text-white"}`}
          on:click={() => (activeView = "planner")}
        >
          Course Planner
        </button>
        <button
          class={`rounded-md px-2 py-1 font-bold ${activeView === "generator" ? "text-ucfGold underline decoration-ucfGold decoration-2 underline-offset-4" : "text-white/80 hover:bg-white/10 hover:text-white"}`}
          on:click={() => (activeView = "generator")}
        >
          Schedule Generator
        </button>
      </div>
      <a class="hidden rounded-md px-2 py-1 hover:bg-white/10 sm:inline-flex" href={issueMailto}>Report an issue</a>
      <div class="relative hidden sm:block">
        <button class="inline-flex items-center rounded-md px-2 py-1 hover:bg-white/10" on:click={() => (aboutMenuOpen = !aboutMenuOpen)}>
          About
          <svg class={`ml-1 h-4 w-4 transition-transform ${aboutMenuOpen ? "rotate-180" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" aria-hidden="true">
            <path d="m6 9 6 6 6-6" />
          </svg>
        </button>
        {#if aboutMenuOpen}
          <div class="absolute right-0 mt-2 w-44 rounded-md border border-outlineDark bg-bgDark p-2 text-base font-bold text-textDark shadow-xl">
            <button class="block w-full rounded px-3 py-2 text-left text-ucfGold underline decoration-ucfGold decoration-2 underline-offset-4 hover:bg-hoverDark" on:click={() => (infoPage = "terms", aboutMenuOpen = false)}>Terms of Use</button>
            <button class="block w-full rounded px-3 py-2 text-left hover:bg-hoverDark" on:click={() => (infoPage = "privacy", aboutMenuOpen = false)}>Privacy Policy</button>
            <button class="block w-full rounded px-3 py-2 text-left hover:bg-hoverDark" on:click={() => (infoPage = "changelog", aboutMenuOpen = false)}>Changelog</button>
          </div>
        {/if}
      </div>
      <a class="inline-flex items-center gap-1 rounded-md px-2 py-1 hover:bg-white/10" href={githubUrl} target="_blank" rel="noreferrer">GitHub</a>
      <button
        class="relative h-6 w-14 rounded-full border border-outlineDark bg-bgDark transition"
        aria-label="Toggle dark mode"
        on:click={() => setTheme(!darkMode)}
      >
        <span class={`absolute top-0.5 grid h-5 w-5 place-items-center rounded-full bg-outlineDark text-xs text-white transition ${darkMode ? "left-8" : "left-1"}`}>
          {darkMode ? "☾" : "☀"}
        </span>
      </button>
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
    <aside class="order-2 flex min-h-80 w-full flex-col border-t border-divBorderLight bg-bgLight dark:border-divBorderDark dark:bg-bgDark lg:order-1 lg:h-full lg:border-r lg:border-t-0">
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
            <button class="h-7 rounded-md px-1 hover:bg-hoverLight dark:hover:bg-hoverDark" title="Create new schedule" on:click={createSchedule}>＋</button>
            <button class="h-7 rounded-md px-1 hover:bg-hoverLight dark:hover:bg-hoverDark" title="Export schedule" on:click={exportSchedule}>↗</button>
            <div class="relative">
              <button class="h-7 rounded-md px-1 hover:bg-hoverLight dark:hover:bg-hoverDark" title="Schedule options" on:click={() => (menuOpen = !menuOpen)}>⋮</button>
              {#if menuOpen}
                <div class="absolute right-0 z-20 mt-1 w-40 rounded-md border border-outlineLight bg-bgLight p-1 shadow-lg dark:border-outlineDark dark:bg-bgSecondaryDark">
                  <button class="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-sm hover:bg-hoverLight dark:hover:bg-hoverDark" on:click={() => (modalOpen = true, menuOpen = false)}><span class="w-4 text-center">＋</span> Add Event</button>
                  <button class="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-sm hover:bg-hoverLight dark:hover:bg-hoverDark" on:click={() => deleteSchedule()}>
                    <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="m6 6 1 15h10l1-15"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>
                    Delete
                  </button>
                  <button class="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-sm hover:bg-hoverLight dark:hover:bg-hoverDark" on:click={duplicateSchedule}>
                    <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="8" y="8" width="11" height="11" rx="2"/><path d="M5 16H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                    Duplicate
                  </button>
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
                  <button class="flex h-6 w-6 shrink-0 items-center justify-center rounded-md hover:bg-hoverLight dark:hover:bg-hoverDark" aria-label={`Delete ${schedule.name}`} on:click={() => deleteSchedule(schedule.id)}>
                    <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="m6 6 1 15h10l1-15"/></svg>
                  </button>
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
            {#if departmentSuggestions.length > 0}
              <div class="absolute left-0 right-0 z-30 mt-1 rounded-lg border-2 border-outlineLight bg-bgLight p-2 shadow-xl dark:border-outlineDark dark:bg-bgSecondaryDark">
                {#each departmentSuggestions as [code, name]}
                  <button class="grid w-full grid-cols-[5rem_1fr] rounded px-2 py-1 text-left hover:bg-hoverLight dark:hover:bg-hoverDark" on:click={() => selectDepartment(code)}>
                    <b>{code}</b>
                    <span class="italic">{name}</span>
                  </button>
                {/each}
              </div>
            {/if}
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
                {#if hasGenEdData || courses.length > 0}
                  <div class="relative grid grid-cols-[5rem_1fr] items-start gap-2">
                    <span class="pt-1">Gen-Eds:</span>
                    <div>
                      <button class="flex w-full items-center justify-between rounded-md border border-outlineLight px-2 py-1 text-left dark:border-outlineDark" on:click={() => (genEdDropdownOpen = !genEdDropdownOpen)}>
                        <span>{filters.genEdTags.length ? `${filters.genEdTags.length} selected` : "Select Gen Eds"}</span>
                        <span>{genEdDropdownOpen ? "×" : "⌄"}</span>
                      </button>
                      {#if genEdDropdownOpen}
                        <div class="absolute left-0 right-0 z-20 mt-1 max-h-56 overflow-auto rounded-md border border-outlineLight bg-bgLight p-2 shadow-xl dark:border-outlineDark dark:bg-bgSecondaryDark">
                          {#each ucfAttributeTags as tag}
                            <label class="flex items-center gap-2 rounded px-2 py-1 hover:bg-hoverLight dark:hover:bg-hoverDark">
                              <input type="checkbox" checked={filters.genEdTags.includes(tag)} on:change={() => toggleTag(tag)} />
                              {tag}
                            </label>
                          {/each}
                        </div>
                      {/if}
                    </div>
                    {#if !hasGenEdData}
                      <p class="col-span-2 rounded-md bg-lightOrange/40 p-2 text-xs font-semibold text-black">
                        Gen Ed tags appear when the live catalog provides attributes for these courses.
                      </p>
                    {/if}
                  </div>
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
    <section class="fixed bottom-0 top-12 grid w-full grid-cols-1 overflow-auto bg-bgLight px-4 py-5 dark:bg-bgDark lg:grid-cols-[24rem_minmax(0,1fr)]">
      <aside class="border-divBorderLight pr-4 dark:border-divBorderDark lg:border-r">
        <div class="mb-5 flex items-center justify-between">
          <h1 class="text-2xl font-black">Courses</h1>
          <button class="rounded-md border-2 border-ucfDarkGold px-4 py-2 font-black text-ucfDarkGold" on:click={generateSchedules}>Generate schedules</button>
        </div>
        <input
          bind:value={query}
          placeholder="Search courses (e.g. 'MAC2311') or @professor"
          class="w-full rounded-lg border-2 border-outlineLight bg-transparent px-3 py-2 text-base dark:border-outlineDark"
        />
        <div class="mt-2 flex items-center justify-between text-secCodesLight">
          <button on:click={() => (filtersOpen = !filtersOpen)}>⚙ {appliedFilterCount} filters applied</button>
          <button on:click={() => (filters = { ...emptyFilters })}>Clear filters</button>
        </div>

        <div class="mt-4 space-y-2">
          {#each visibleCourses.slice(0, 5) as course}
            <div class="rounded-md border border-outlineLight bg-bgSecondaryLight p-2 dark:border-outlineDark dark:bg-bgSecondaryDark">
              <div class="flex items-center justify-between">
                <div>
                  <b>{course.code}</b>
                  <div class="text-sm text-secCodesLight">{course.title}</div>
                </div>
                <button class="rounded bg-ucfBlack px-2 py-1 text-xs font-black text-ucfGold" on:click={() => addGeneratorCourse(course)}>Add</button>
              </div>
              <div class="mt-1 text-xs text-secCodesLight">
                {sectionLoading[course.id] ? "Loading sections..." : `${course.sections.length} sections`}
              </div>
            </div>
          {/each}
          {#if query.trim().length < 2}
            <p class="py-4 text-sm font-semibold text-secCodesLight">Search for courses above and add the ones you want to schedule.</p>
          {/if}
        </div>

        {#if generatorCourses.length > 0}
          <div class="mt-5 border-t border-divBorderLight pt-4 dark:border-divBorderDark">
            <h2 class="mb-2 text-lg font-black">Selected Courses</h2>
            {#each generatorCourses as course}
              <div class="mb-1 flex items-center justify-between rounded-md bg-bgSecondaryLight px-2 py-1 text-sm dark:bg-bgSecondaryDark">
                <span><b>{course.code}</b> {course.sections.length} sections</span>
                <button class="font-black text-red-700" on:click={() => removeGeneratorCourse(course.id)}>×</button>
              </div>
            {/each}
          </div>
        {/if}

        <div class="mt-5 border-t border-divBorderLight pt-4 dark:border-divBorderDark">
          <div class="mb-2 flex items-center justify-between">
            <h2 class="text-lg font-black">Constraints</h2>
            <button class="text-sm font-bold text-secCodesLight" on:click={() => (generatorConstraints = { noBefore: "", noAfter: "", daysOff: [], onlyOpen: true, minGap: "0", minCredits: "" })}>Clear</button>
          </div>
          <div class="grid gap-3 text-sm">
            <label class="grid grid-cols-[7rem_1fr] items-center gap-2">No class before
              <select class="rounded-md border border-outlineLight bg-transparent px-2 py-1 dark:border-outlineDark" bind:value={generatorConstraints.noBefore}>
                <option value="">Any time</option>
                {#each eventTimes() as option}<option value={option.value}>{option.label}</option>{/each}
              </select>
            </label>
            <label class="grid grid-cols-[7rem_1fr] items-center gap-2">No class after
              <select class="rounded-md border border-outlineLight bg-transparent px-2 py-1 dark:border-outlineDark" bind:value={generatorConstraints.noAfter}>
                <option value="">Any time</option>
                {#each eventTimes() as option}<option value={option.value}>{option.label}</option>{/each}
              </select>
            </label>
            <div class="flex flex-wrap items-center gap-2">
              <span class="mr-2">Days off:</span>
              {#each days as day}
                <button class={`rounded-md border px-3 py-1 font-bold ${generatorConstraints.daysOff.includes(day) ? "bg-ucfGold text-black" : "border-outlineLight dark:border-outlineDark"}`} on:click={() => toggleGeneratorDay(day)}>{day}</button>
              {/each}
            </div>
            <label class="flex items-center gap-2">
              <input type="checkbox" bind:checked={generatorConstraints.onlyOpen} />
              Only open sections
            </label>
            <div class="grid grid-cols-2 gap-3">
              <label>Min gap (min)
                <input class="mt-1 w-full rounded-md border border-outlineLight bg-transparent px-2 py-1 dark:border-outlineDark" type="number" min="0" bind:value={generatorConstraints.minGap} />
              </label>
              <label>Min credits
                <input class="mt-1 w-full rounded-md border border-outlineLight bg-transparent px-2 py-1 dark:border-outlineDark" type="number" min="0" bind:value={generatorConstraints.minCredits} />
              </label>
            </div>
          </div>
        </div>
      </aside>
      <section class="min-w-0 px-4">
        <p class="mb-4 text-center font-semibold text-secCodesLight">{generatorNotice}</p>
        <div class="grid gap-3 xl:grid-cols-2">
          {#each generatorResults as result}
            <article class="rounded-md border-2 border-outlineLight bg-bgSecondaryLight p-3 dark:border-outlineDark dark:bg-bgSecondaryDark">
              <div class="mb-2 flex items-center justify-between">
                <b>{result.name}</b>
                <button class="rounded bg-ucfBlack px-2 py-1 text-xs font-black text-ucfGold" on:click={() => useGeneratedSchedule(result)}>Use</button>
              </div>
              {#each getSelectionPairs(result) as { course, section }}
                <div class="border-t border-divBorderLight py-1 text-sm dark:border-divBorderDark">
                  <b>{course.code}</b> {section.sectionNumber} · {section.professorName}
                  <div class="text-xs text-secCodesLight">
                    {#each section.meetings as meeting}{dayLabels[meeting.dayOfWeek]} {formatTimeRange(meeting.startTime, meeting.endTime)} {/each}
                  </div>
                </div>
              {/each}
            </article>
          {/each}
        </div>
      </section>
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

  {#if infoPage}
    <section class="fixed inset-0 z-50 overflow-auto bg-bgLight p-6 text-textLight dark:bg-bgDark dark:text-textDark">
      <div class="mb-5 flex items-center justify-between border-b-2 border-divBorderLight pb-3 dark:border-divBorderDark">
        <div class="flex items-center gap-3">
          <button class="rounded-md bg-ucfBlack px-3 py-2 text-sm font-bold text-ucfGold" on:click={() => (infoPage = null)}>Back</button>
          <h1 class="text-2xl font-black">
            {infoPage === "terms" ? "Terms of Use" : infoPage === "privacy" ? "Privacy Policy" : "Changelog"}
          </h1>
        </div>
        <span class="text-sm font-bold text-secCodesLight">Knight Planner v{appVersion}</span>
      </div>

      {#if infoPage === "terms"}
        <div class="space-y-5">
          <p class="font-semibold text-secCodesLight">Last updated: June 30, 2026</p>
          <section><h2 class="border-b border-divBorderLight text-xl font-black dark:border-divBorderDark">Introduction</h2><p class="mt-2">Knight Planner is a UCF schedule planning tool built by Henrique Silva Ribeiro. It is not affiliated with, endorsed by, sponsored by, or operated by the University of Central Florida. By using Knight Planner, you agree that it is a planning aid and that official enrollment decisions must be completed through official UCF systems.</p></section>
          <section><h2 class="border-b border-divBorderLight text-xl font-black dark:border-divBorderDark">Use of Knight Planner</h2><p class="mt-2">The app helps students explore live UCF catalog data, myUCF class sections, RateMyProfessors information, calendar exports, and generated schedule combinations. You may use the app for personal academic planning, comparing sections, and exporting tentative schedules.</p></section>
          <section><h2 class="border-b border-divBorderLight text-xl font-black dark:border-divBorderDark">Source Data</h2><p class="mt-2">Course, section, room, seat, waitlist, and instructor data can change without notice at the source. Knight Planner attempts to show live data, but it cannot guarantee availability, accuracy, or registration eligibility. Always verify CRNs, times, modalities, prerequisites, fees, holds, and enrollment status in official UCF tools before relying on a schedule.</p></section>
          <section><h2 class="border-b border-divBorderLight text-xl font-black dark:border-divBorderDark">Calendar Exports</h2><p class="mt-2">Calendar exports are generated from the schedule currently selected in your browser. Imported calendar events are still unofficial planning records and may need to be deleted or re-imported if UCF changes the official meeting pattern.</p></section>
          <section><h2 class="border-b border-divBorderLight text-xl font-black dark:border-divBorderDark">Acceptable Use</h2><p class="mt-2">Do not use Knight Planner to overload, scrape abusively, disrupt, or bypass controls on UCF or third-party systems. The app is intended for ordinary student planning and lightweight lookups.</p></section>
          <section><h2 class="border-b border-divBorderLight text-xl font-black dark:border-divBorderDark">No Warranty</h2><p class="mt-2">Knight Planner is provided as-is, without warranties of any kind. The developer is not responsible for missed enrollment windows, incorrect registration choices, schedule conflicts, data source outages, or decisions made using the app.</p></section>
          <section><h2 class="border-b border-divBorderLight text-xl font-black dark:border-divBorderDark">Changes</h2><p class="mt-2">These terms may be updated as the project matures. The changelog records major product changes while Knight Planner remains in the version {appVersion} pre-release line.</p></section>
          <section><h2 class="border-b border-divBorderLight text-xl font-black dark:border-divBorderDark">Contact</h2><p class="mt-2">Questions and issues can be sent to <a class="text-ucfDarkGold underline" href={issueMailto}>hsribeiro1@gmail.com</a>.</p></section>
        </div>
      {:else if infoPage === "privacy"}
        <div class="space-y-5">
          <p class="font-semibold text-secCodesLight">Last updated: June 30, 2026</p>
          <section><h2 class="border-b border-divBorderLight text-xl font-black dark:border-divBorderDark">Overview</h2><p class="mt-2">Knight Planner is designed to work without accounts in version {appVersion}. The planner keeps schedule information on your device wherever possible and uses live external sources only to retrieve course, section, and professor information.</p></section>
          <section><h2 class="border-b border-divBorderLight text-xl font-black dark:border-divBorderDark">Local Data</h2><p class="mt-2">Schedules, selected sections, custom events, hidden course variants, and theme preference may be stored in your browser local storage. This lets your planner remain available when you refresh or return later. Clearing browser data can remove saved schedules.</p></section>
          <section><h2 class="border-b border-divBorderLight text-xl font-black dark:border-divBorderDark">Calendar Files</h2><p class="mt-2">Exported `.ics` files are created in your browser from your selected schedule. After export, your calendar app controls the imported events and any data you choose to sync there.</p></section>
          <section><h2 class="border-b border-divBorderLight text-xl font-black dark:border-divBorderDark">External Requests</h2><p class="mt-2">When you search, Knight Planner requests live information from UCF catalog and class-search systems. It may also request public professor rating information from RateMyProfessors. Those providers may receive ordinary web request metadata such as IP address, timestamp, and browser headers.</p></section>
          <section><h2 class="border-b border-divBorderLight text-xl font-black dark:border-divBorderDark">Data Sharing</h2><p class="mt-2">Knight Planner does not sell, rent, or broker your planner data. Exported calendar files are generated locally for you to download and import into your own calendar app.</p></section>
          <section><h2 class="border-b border-divBorderLight text-xl font-black dark:border-divBorderDark">Future Accounts</h2><p class="mt-2">If cloud accounts or cross-device schedule syncing are added later, this policy should be updated before those features are treated as part of the full release.</p></section>
          <section><h2 class="border-b border-divBorderLight text-xl font-black dark:border-divBorderDark">Contact</h2><p class="mt-2"><a class="text-ucfDarkGold underline" href={issueMailto}>hsribeiro1@gmail.com</a></p></section>
        </div>
      {:else}
        <div class="relative ml-3 border-l-2 border-divBorderLight pl-5 dark:border-divBorderDark">
          <article class="mb-7">
            <div class="absolute -left-[7px] mt-2 h-3 w-3 rounded-full bg-ucfGold"></div>
            <h2 class="text-xl font-black">Foundation Build <span class="text-sm text-secCodesLight">v{appVersion}</span></h2>
            <p class="italic">June 30, 2026</p>
            <p>Rebuilt Knight Planner as a SvelteKit UCF planner with live Kuali catalog search, myUCF sections, RateMyProfessors ratings, dark mode, schedule generator, export, and UCF-focused branding.</p>
          </article>
        </div>
      {/if}
    </section>
  {/if}
</main>
