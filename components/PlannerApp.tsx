"use client";

import { ucfAttributeTags } from "@/lib/ucfSources";
import {
  blockColors,
  calendarBlocks,
  candidateConflicts,
  colorForIndex,
  customEventConflicts,
  dayLabels,
  days,
  formatTimeRange,
  getSelectionPairs,
  initialSchedule,
  minutesToDisplay,
  selectedCourse,
  sectionToBlocks,
  timeToMinutes,
  uid,
  uniqueCredits
} from "@/lib/planner";
import type { CalendarBlock, Course, CustomEvent, DayOfWeek, Filters, PlannerState, SchedulePlan, Section } from "@/lib/types";
import {
  CalendarPlus,
  Check,
  ChevronDown,
  Copy,
  ExternalLink,
  Github,
  MoreVertical,
  Plus,
  Search,
  Settings,
  Trash2,
  X
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";

const terms = ["Fall 2026", "Spring 2027", "Summer 2027"];
const plannerKey = "knight-planner-state-v1";
const emptyFilters: Filters = { genEdTags: [], minCredits: "", maxCredits: "", onlyOpen: false };
const timeOptions = Array.from({ length: ((23 - 5) * 4) + 1 }, (_, index) => {
  const total = 5 * 60 + index * 15;
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  const value = `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
  return { value, label: minutesToDisplay(total) };
});

const defaultState = (): PlannerState => {
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
};

export function PlannerApp() {
  const [planner, setPlanner] = useState<PlannerState>(() => defaultState());
  const [hydrated, setHydrated] = useState(false);
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [menuOpen, setMenuOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const [courses, setCourses] = useState<Course[]>([]);
  const [sourceStatus, setSourceStatus] = useState("Search UCF catalog and myUCF class search.");
  const [loadingCourses, setLoadingCourses] = useState(false);
  const [hoveredSection, setHoveredSection] = useState<{ course: Course; section: Section } | null>(null);

  useEffect(() => {
    const stored = window.localStorage.getItem(plannerKey);
    if (stored) {
      try {
        // LocalStorage is the MVP persistence layer; hydrate once after mount.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setPlanner(JSON.parse(stored) as PlannerState);
      } catch {
        window.localStorage.removeItem(plannerKey);
      }
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated) window.localStorage.setItem(plannerKey, JSON.stringify(planner));
  }, [hydrated, planner]);

  useEffect(() => {
    const controller = new AbortController();
    const cleaned = query.trim();
    if (cleaned.length < 2) {
      // Reset live-search state when the user clears the query.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCourses([]);
      setSourceStatus("Enter at least 2 characters to search live UCF sources.");
      return;
    }
    setLoadingCourses(true);
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/ucf/search?q=${encodeURIComponent(cleaned)}&term=${encodeURIComponent(planner.term)}`, {
          signal: controller.signal
        });
        const payload = (await response.json()) as { courses?: Course[]; sourceStatus?: string };
        setCourses(payload.courses ?? []);
        setSourceStatus(payload.sourceStatus ?? "UCF source returned results.");
      } catch (error) {
        if (!controller.signal.aborted) {
          setCourses([]);
          setSourceStatus(error instanceof Error ? error.message : "UCF source unavailable.");
        }
      } finally {
        if (!controller.signal.aborted) setLoadingCourses(false);
      }
    }, 350);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query, planner.term]);

  const schedules = planner.schedulesByTerm[planner.term] ?? [initialSchedule()];
  const activeScheduleId = planner.activeScheduleIdByTerm[planner.term] ?? schedules[0]?.id;
  const activeSchedule = schedules.find((schedule) => schedule.id === activeScheduleId) ?? schedules[0];
  const selectedPairs = getSelectionPairs(activeSchedule);
  const baseBlocks = calendarBlocks(activeSchedule);
  const hoverBlocks = hoveredSection
    ? sectionToBlocks(hoveredSection.course, hoveredSection.section, {
        id: "hover",
        courseId: hoveredSection.course.id,
        sectionId: hoveredSection.section.id,
        color: colorForIndex(activeSchedule.selections.length)
      }).map((block) => ({ ...block, preview: true }))
    : [];
  const blocks = [...baseBlocks, ...hoverBlocks];
  const credits = uniqueCredits(activeSchedule);
  const hasGenEdData = courses.some((course) => course.genEdTags.length > 0);
  const hasSectionData = courses.some((course) => course.sections.length > 0);
  const activeGenEdFilters = useMemo(() => (hasGenEdData ? filters.genEdTags : []), [filters.genEdTags, hasGenEdData]);
  const activeOnlyOpen = hasSectionData && filters.onlyOpen;
  const appliedFilterCount = activeGenEdFilters.length + Number(Boolean(filters.minCredits)) + Number(Boolean(filters.maxCredits)) + Number(activeOnlyOpen);

  const filteredCourses = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const professorToken = normalized.match(/@("?)([^"]+)\1/)?.[2] ?? "";
    const textQuery = normalized.replace(/@("?)[^"]+\1/g, "").trim();
    return courses.filter((course) => {
      const matchesText =
        !textQuery ||
        course.code.toLowerCase().includes(textQuery) ||
        course.title.toLowerCase().includes(textQuery) ||
        course.genEdTags.some((tag) => tag.toLowerCase().includes(textQuery));
      const matchesProfessor =
        !professorToken || course.sections.some((section) => section.professorName.toLowerCase().includes(professorToken));
      const matchesTags = activeGenEdFilters.length === 0 || activeGenEdFilters.every((tag) => course.genEdTags.includes(tag));
      const min = filters.minCredits ? Number(filters.minCredits) : 0;
      const max = filters.maxCredits ? Number(filters.maxCredits) : Infinity;
      const matchesCredits = course.credits >= min && course.credits <= max;
      const matchesOpen = !activeOnlyOpen || course.sections.some((section) => section.seatsAvailable > 0);
      return matchesText && matchesProfessor && matchesTags && matchesCredits && matchesOpen;
    });
  }, [query, filters, courses, activeGenEdFilters, activeOnlyOpen]);

  function updateActiveSchedule(updater: (schedule: SchedulePlan) => SchedulePlan) {
    setPlanner((current) => ({
      ...current,
      schedulesByTerm: {
        ...current.schedulesByTerm,
        [current.term]: (current.schedulesByTerm[current.term] ?? []).map((schedule) =>
          schedule.id === activeSchedule.id ? updater(schedule) : schedule
        )
      }
    }));
  }

  function switchTerm(term: string) {
    setPlanner((current) => {
      const existing = current.schedulesByTerm[term] ?? [initialSchedule()];
      return {
        ...current,
        term,
        schedulesByTerm: { ...current.schedulesByTerm, [term]: existing },
        activeScheduleIdByTerm: { ...current.activeScheduleIdByTerm, [term]: current.activeScheduleIdByTerm[term] ?? existing[0].id }
      };
    });
  }

  function createSchedule() {
    const next: SchedulePlan = { ...initialSchedule(), name: `Schedule ${schedules.length + 1}` };
    setPlanner((current) => ({
      ...current,
      schedulesByTerm: { ...current.schedulesByTerm, [current.term]: [...schedules, next] },
      activeScheduleIdByTerm: { ...current.activeScheduleIdByTerm, [current.term]: next.id }
    }));
  }

  function duplicateSchedule() {
    const copySchedule: SchedulePlan = {
      ...activeSchedule,
      id: uid("schedule"),
      name: `${activeSchedule.name} copy`,
      selections: activeSchedule.selections.map((selection) => ({ ...selection, id: uid("selection") })),
      customEvents: activeSchedule.customEvents.map((event) => ({ ...event, id: uid("event") }))
    };
    setPlanner((current) => ({
      ...current,
      schedulesByTerm: { ...current.schedulesByTerm, [current.term]: [...schedules, copySchedule] },
      activeScheduleIdByTerm: { ...current.activeScheduleIdByTerm, [current.term]: copySchedule.id }
    }));
    setMenuOpen(false);
  }

  function deleteSchedule() {
    if (schedules.length === 1) {
      updateActiveSchedule(() => ({ ...initialSchedule(), name: "Schedule 1" }));
      setMenuOpen(false);
      return;
    }
    const remaining = schedules.filter((schedule) => schedule.id !== activeSchedule.id);
    setPlanner((current) => ({
      ...current,
      schedulesByTerm: { ...current.schedulesByTerm, [current.term]: remaining },
      activeScheduleIdByTerm: { ...current.activeScheduleIdByTerm, [current.term]: remaining[0].id }
    }));
    setMenuOpen(false);
  }

  function addSection(course: Course, section: Section) {
    const replacing = selectedCourse(activeSchedule, course.id);
    if (replacing?.sectionId === section.id) {
      removeSelection(replacing.id);
      setNotice(`${course.code} section ${section.sectionNumber} removed.`);
      return;
    }
    if (candidateConflicts(activeSchedule, course, section, course.id)) {
      setNotice(`${course.code} ${section.sectionNumber} conflicts with the active schedule.`);
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
    setNotice(replacing ? `${course.code} replaced with section ${section.sectionNumber}.` : `${course.code} section ${section.sectionNumber} added.`);
  }

  function removeSelection(sourceId: string) {
    updateActiveSchedule((schedule) => ({ ...schedule, selections: schedule.selections.filter((selection) => selection.id !== sourceId) }));
  }

  function removeCustomEvent(sourceId: string) {
    updateActiveSchedule((schedule) => ({ ...schedule, customEvents: schedule.customEvents.filter((event) => event.id !== sourceId) }));
  }

  function addCustomEvent(event: CustomEvent) {
    if (customEventConflicts(activeSchedule, event)) {
      setNotice(`${event.name} conflicts with the active schedule.`);
      return false;
    }
    updateActiveSchedule((schedule) => ({ ...schedule, customEvents: [...schedule.customEvents, event] }));
    setNotice(`${event.name} added.`);
    return true;
  }

  return (
    <main className="min-h-screen bg-[#f5f1e7]">
      <TopNav />
      {notice ? (
        <div className="fixed left-1/2 top-16 z-50 max-w-[90vw] -translate-x-1/2 rounded-md border border-ucf-darkGold bg-ucf-black px-4 py-2 text-sm font-semibold text-ucf-gold shadow-planner">
          {notice}
          <button className="ml-3 align-middle text-white" onClick={() => setNotice("")} aria-label="Dismiss notice">
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : null}

      <div
        id="planner-container"
        className="fixed bottom-0 top-14 grid w-full grid-cols-1 overflow-y-auto bg-white px-3 lg:grid-cols-[22rem_minmax(0,1fr)] lg:overflow-hidden"
      >
        <section className="order-1 min-w-0 py-3 lg:order-2 lg:h-full lg:pl-2">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2 px-1 text-xs font-semibold text-black/70">
            <div>{planner.term}</div>
            <div className="flex flex-wrap items-center gap-2 text-[11px]">
              <span className="rounded-md bg-ucf-black px-2 py-1 text-ucf-gold">Live UCF sources</span>
              <span className="rounded-md bg-[#ebebeb] px-2 py-1 text-black">RMP</span>
              <span className="rounded-md bg-[#ebebeb] px-2 py-1 text-black">Kuali</span>
              <span className="rounded-md bg-[#ebebeb] px-2 py-1 text-black">myUCF</span>
            </div>
          </div>
          <WeeklyCalendar blocks={blocks} removeSelection={removeSelection} removeCustomEvent={removeCustomEvent} />
        </section>

        <aside className="order-2 flex min-h-80 w-full flex-col border-t border-black/10 bg-white lg:order-1 lg:h-full lg:border-r lg:border-t-0">
          <div id="planner-course-search" className="px-1 pt-1">
            <div className="ml-1 flex flex-row pb-1 text-xs font-medium text-black/75 2xl:text-sm">
              <div>{planner.term}</div>
              <div className="grow text-right">Credits: {credits}</div>
            </div>

            <section className="rounded-lg border-2 border-[#a2aabd] bg-[#ebebeb] p-2">
              <div className="flex items-center gap-2">
                <select
                  aria-label="Active schedule"
                  className="min-w-0 grow rounded-md border border-black/20 bg-white px-2 py-1.5 text-sm font-semibold"
                  value={activeSchedule.id}
                  onChange={(event) =>
                    setPlanner((current) => ({
                      ...current,
                      activeScheduleIdByTerm: { ...current.activeScheduleIdByTerm, [current.term]: event.target.value }
                    }))
                  }
                >
                  {schedules.map((schedule) => (
                    <option key={schedule.id} value={schedule.id}>
                      {schedule.name}
                    </option>
                  ))}
                </select>
                <button className="rounded-md bg-ucf-black p-2 text-ucf-gold" onClick={createSchedule} title="Create schedule">
                  <Plus className="h-4 w-4" />
                </button>
                <div className="relative">
                  <button
                    className="rounded-md border border-black/20 bg-white p-2"
                    onClick={() => setMenuOpen((open) => !open)}
                    title="Schedule actions"
                  >
                    <MoreVertical className="h-4 w-4" />
                  </button>
                  {menuOpen ? (
                    <div className="absolute right-0 z-20 mt-2 w-52 rounded-lg border border-[#a2aabd] bg-white p-1 shadow-planner">
                      <MenuButton icon={<CalendarPlus />} label="Add Custom Event" onClick={() => { setModalOpen(true); setMenuOpen(false); }} />
                      <MenuButton icon={<Copy />} label="Duplicate" onClick={duplicateSchedule} />
                      <MenuButton icon={<Trash2 />} label="Delete" onClick={deleteSchedule} />
                    </div>
                  ) : null}
                </div>
              </div>
              <div className="mt-2 flex items-center justify-between text-xs text-black/70">
                <span>{selectedPairs.length} courses, {activeSchedule.customEvents.length} custom events</span>
                <label className="flex items-center gap-1">
                  <span>Term</span>
                  <select
                    id="term"
                    className="rounded-md border border-black/20 bg-white px-1.5 py-1 text-xs"
                    value={planner.term}
                    onChange={(event) => switchTerm(event.target.value)}
                  >
                    {terms.map((term) => (
                      <option key={term}>{term}</option>
                    ))}
                  </select>
                </label>
              </div>
            </section>

            <div className="relative mt-2 flex w-full flex-col border-b-2 border-t-2 border-solid border-[#f1f1f1] py-1">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2 top-2 h-5 w-5 text-black/40" />
                <input
                  id="planner-course-search-input"
                  className="w-full rounded-lg border-2 border-solid border-[#a2aabd] bg-transparent py-1 pl-9 pr-2 text-xl placeholder:text-base lg:text-base lg:placeholder:text-sm"
                  placeholder="Search courses (e.g. 'COP3502C') or @professor"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
              </div>
              <div className="mt-2 flex flex-wrap gap-1">
                {["COP3502C", "ENC1102", "MAC2311C", "PSY2012"].map((chip) => (
                  <button
                    key={chip}
                    className={`rounded-md border px-2 py-0.5 text-xs font-bold transition ${
                      query === chip ? "border-ucf-darkGold bg-ucf-gold text-black" : "border-black/10 bg-[#ebebeb] text-black/70 hover:bg-[#d8d8d8]"
                    }`}
                    onClick={() => setQuery(chip)}
                  >
                    {chip}
                  </button>
                ))}
              </div>
              <div className="mt-2 flex items-center justify-between text-sm">
                <span className="inline-flex items-center gap-1 font-bold"><Settings className="h-4 w-4" /> {appliedFilterCount} filters applied</span>
                <button className="text-sm font-semibold text-ucf-darkGold" onClick={() => setFilters(emptyFilters)}>
                  Clear filters
                </button>
              </div>
              <FiltersPanel
                filters={filters}
                setFilters={setFilters}
                hasGenEdData={hasGenEdData}
                hasSectionData={hasSectionData}
                hasCourseResults={courses.length > 0}
              />
              <p className="mt-2 rounded-md bg-[#ebebeb] p-2 text-xs font-semibold text-black/70">
                {loadingCourses ? "Loading live UCF data..." : sourceStatus}
              </p>
            </div>
          </div>

          <section id="planner-search-results" className="planner-scrollbar min-h-[12.25rem] grow overflow-y-auto px-1 pb-2 lg:min-h-0">
            {filteredCourses.map((course) => (
              <CourseResult
                key={course.id}
                course={course}
                activeSchedule={activeSchedule}
                expanded={Boolean(expanded[course.id])}
                toggleExpanded={() => setExpanded((current) => ({ ...current, [course.id]: !current[course.id] }))}
                addSection={addSection}
                setHoveredSection={setHoveredSection}
              />
            ))}
            {filteredCourses.length === 0 ? (
              <div className="my-2 rounded-lg border-2 border-dashed border-[#a2aabd] bg-[#ebebeb] p-6 text-center text-sm text-black/60">
                {query.trim().length < 2
                  ? "Search a real UCF course code, title, or professor."
                  : query.trim().startsWith("@")
                    ? "Professor search needs live myUCF instructor rows."
                    : "No live UCF courses match this search."}
              </div>
            ) : null}
          </section>

          <section className="border-t-2 border-[#f1f1f1] px-2 py-2">
            <div className="mb-1 flex items-center justify-between text-sm font-bold">
              <span>Custom Events</span>
              <button className="rounded-md bg-ucf-black px-2 py-1 text-xs font-black text-ucf-gold" onClick={() => setModalOpen(true)}>
                Add
              </button>
            </div>
            {activeSchedule.customEvents.length > 0 ? (
              <div className="space-y-1">
                {activeSchedule.customEvents.map((event) => (
                  <div key={event.id} className="flex items-center justify-between rounded-md bg-[#ebebeb] px-2 py-1 text-xs">
                    <span className="font-semibold">{event.name}</span>
                    <button className="font-black text-red-700" onClick={() => removeCustomEvent(event.id)}>Remove</button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-black/55">Add work, commute, clubs, or study blocks.</p>
            )}
          </section>
        </aside>
      </div>
      {modalOpen ? <CustomEventModal onClose={() => setModalOpen(false)} onAdd={addCustomEvent} existingCount={activeSchedule.customEvents.length} /> : null}
    </main>
  );
}

function TopNav() {
  return (
    <nav className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-ucf-gold bg-ucf-black px-4 text-white">
      <div className="flex items-center gap-3">
        <div className="grid h-8 w-8 place-items-center rounded-md bg-ucf-gold font-black text-black">KP</div>
        <span className="text-lg font-black">Knight Planner</span>
        <div className="hidden rounded-md border border-white/15 p-1 text-sm md:flex">
          <button className="rounded bg-ucf-gold px-3 py-1 font-bold text-black">Planner</button>
          <button className="px-3 py-1 text-white/70">Requirements</button>
        </div>
      </div>
      <div className="flex items-center gap-2 text-sm">
        <a className="hidden rounded-md px-2 py-1 hover:bg-white/10 sm:inline-flex" href="mailto:issues@example.com">Report an issue</a>
        <a className="hidden rounded-md px-2 py-1 hover:bg-white/10 sm:inline-flex" href="#about">About</a>
        <a className="inline-flex items-center gap-1 rounded-md px-2 py-1 hover:bg-white/10" href="https://github.com/" target="_blank">
          <Github className="h-4 w-4" /> GitHub
        </a>
      </div>
    </nav>
  );
}

function MenuButton({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button className="flex w-full items-center gap-2 rounded px-2 py-2 text-left text-sm font-semibold hover:bg-ucf-paper" onClick={onClick}>
      <span className="h-4 w-4 [&>svg]:h-4 [&>svg]:w-4">{icon}</span>
      {label}
    </button>
  );
}

function FiltersPanel({
  filters,
  setFilters,
  hasGenEdData,
  hasSectionData,
  hasCourseResults
}: {
  filters: Filters;
  setFilters: (filters: Filters) => void;
  hasGenEdData: boolean;
  hasSectionData: boolean;
  hasCourseResults: boolean;
}) {
  function toggleTag(tag: string) {
    if (!hasGenEdData) return;
    setFilters({
      ...filters,
      genEdTags: filters.genEdTags.includes(tag) ? filters.genEdTags.filter((item) => item !== tag) : [...filters.genEdTags, tag]
    });
  }

  return (
    <div className="mt-3 space-y-3">
      {hasGenEdData ? (
        <div className="flex flex-wrap gap-2">
          {ucfAttributeTags.map((tag) => (
            <button
              key={tag}
              className={`rounded-md border px-2 py-1 text-xs font-bold ${
                filters.genEdTags.includes(tag) ? "border-ucf-darkGold bg-ucf-gold text-black" : "border-black/15 bg-white text-black/70"
              }`}
              onClick={() => toggleTag(tag)}
            >
              {tag}
            </button>
          ))}
        </div>
      ) : hasCourseResults ? (
        <p className="rounded-md bg-amber-50 p-2 text-xs font-semibold text-amber-900">
          UCF Catalog did not return per-course Gen Ed attributes for these results. Attribute filters will appear when the live source provides them.
        </p>
      ) : null}
      <div className="grid grid-cols-2 gap-2">
        <input
          type="number"
          min="0"
          className="rounded-md border border-black/20 px-3 py-2"
          placeholder="Min credits"
          value={filters.minCredits}
          onChange={(event) => setFilters({ ...filters, minCredits: event.target.value })}
        />
        <input
          type="number"
          min="0"
          className="rounded-md border border-black/20 px-3 py-2"
          placeholder="Max credits"
          value={filters.maxCredits}
          onChange={(event) => setFilters({ ...filters, maxCredits: event.target.value })}
        />
      </div>
      <label className="flex items-center gap-2 text-sm font-semibold">
        <input
          type="checkbox"
          checked={filters.onlyOpen}
          disabled={!hasSectionData}
          onChange={(event) => setFilters({ ...filters, onlyOpen: event.target.checked })}
        />
        Only show open sections
      </label>
      {hasCourseResults && !hasSectionData ? (
        <p className="text-xs font-semibold text-black/50">Open-seat filtering is available once myUCF returns live section rows.</p>
      ) : null}
    </div>
  );
}

function CourseResult({
  course,
  activeSchedule,
  expanded,
  toggleExpanded,
  addSection,
  setHoveredSection
}: {
  course: Course;
  activeSchedule: SchedulePlan;
  expanded: boolean;
  toggleExpanded: () => void;
  addSection: (course: Course, section: Section) => void;
  setHoveredSection: (section: { course: Course; section: Section } | null) => void;
}) {
  const chosen = selectedCourse(activeSchedule, course.id);

  return (
    <article id={`results-${course.code}`} className="my-2 flex scroll-mt-2 flex-col rounded-lg border-2 border-solid border-[#a2aabd] bg-[#ebebeb] px-2">
      <header className="top-0 z-10 -mb-[2px] border-b-2 border-solid border-[#a2aabd] bg-[#ebebeb] px-2 py-2 text-left">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-black text-ucf-black">{course.code}</h2>
              <span className="text-sm font-semibold text-black/70">Credits: {course.credits}</span>
            </div>
            <p className="max-w-[254px] text-sm font-semibold xl:max-w-[314px] 2xl:max-w-[394px]">{course.title}</p>
          </div>
          <button className="rounded-md border border-black/15 bg-white p-1.5" onClick={toggleExpanded} aria-label={expanded ? "Hide details" : "Show details"}>
            <ChevronDown className={`h-4 w-4 transition ${expanded ? "rotate-180" : ""}`} />
          </button>
        </div>
        <div className="mt-2 flex flex-wrap gap-1">
          {course.genEdTags.map((tag) => (
            <span key={tag} className="rounded bg-ucf-paper px-1.5 py-0.5 text-[11px] font-bold text-black/75 ring-1 ring-black/10">
              {tag}
            </span>
          ))}
        </div>
        {expanded ? (
          <div className="mt-2 space-y-2 py-1 text-sm leading-tight">
            <p>{course.description}</p>
            <p><strong>Prerequisites:</strong> {course.prerequisites}</p>
            <div className="flex flex-wrap gap-2">
              {course.catalogUrl ? <OfficialLink href={course.catalogUrl} label="View catalog" /> : null}
              {course.scheduleUrl ? <OfficialLink href={course.scheduleUrl} label="View official schedule" /> : null}
            </div>
          </div>
        ) : null}
      </header>
      <div>
        {course.sections.map((section) => {
          const isChosen = chosen?.sectionId === section.id;
          const conflicts = !isChosen && candidateConflicts(activeSchedule, course, section, course.id);
          return (
            <button
              key={section.id}
              disabled={conflicts}
              onClick={() => addSection(course, section)}
              onMouseEnter={() => setHoveredSection(isChosen || conflicts ? null : { course, section })}
              onMouseLeave={() => setHoveredSection(null)}
              onFocus={() => setHoveredSection(isChosen || conflicts ? null : { course, section })}
              onBlur={() => setHoveredSection(null)}
              className={`flex w-full flex-row border-t-2 border-[#a2aabd] pb-1 text-left transition ${
                isChosen ? "bg-ucf-gold/35" : conflicts ? "cursor-not-allowed bg-red-50 text-black/60" : "hover:bg-[#d8d8d8]"
              }`}
              title={conflicts ? "Conflicts with active schedule" : isChosen ? "Remove section from schedule" : "Add section to schedule"}
            >
              <div className="w-12 shrink-0 pt-1 text-sm font-semibold text-[#667085] xl:w-14 xl:text-base">
                {section.sectionNumber}
              </div>
              <div className="min-w-0 grow py-1">
                <div className="flex items-start justify-between gap-2">
                  <p className="min-w-0 text-sm">
                    <span className="font-semibold">{section.professorName}</span> <ProfessorRating name={section.professorName} />
                  </p>
                  {isChosen ? <Check className="h-4 w-4 shrink-0 text-green-700" /> : null}
                </div>
                <div className="pb-1 text-xs font-medium 2xl:text-base">
                  {section.seatsTotal > 0
                    ? `${section.seatsAvailable} / ${section.seatsTotal} seats available${section.enrollmentTotal !== undefined ? ` (${section.enrollmentTotal} enrolled)` : ""}`
                    : "Seat count unavailable"}
                  {section.waitlistTotal !== undefined && section.waitlistCapacity !== undefined
                    ? ` | Waitlist: ${section.waitlistTotal} / ${section.waitlistCapacity}`
                    : section.waitlistAvailable !== undefined
                      ? ` | Waitlist spots: ${section.waitlistAvailable}`
                      : ""}
                </div>
                <div className="space-y-0.5">
                  {section.meetings.map((meeting, index) => (
                    <div key={`${section.id}-${index}`} className="flex w-full flex-row text-xs font-medium 2xl:text-base">
                      <span className="grow">
                        {dayLabels[meeting.dayOfWeek]} {formatTimeRange(meeting.startTime, meeting.endTime)}
                      </span>
                      <span className="grow text-right">
                        {meeting.building ? (
                          <a className="rounded-md p-0.5 text-ucf-darkGold underline transition hover:bg-[#d8d8d8]" href={`https://map.ucf.edu/?show=${meeting.building}`} target="_blank" onClick={(event) => event.stopPropagation()}>
                            {[meeting.building, meeting.room].filter(Boolean).join(" ")}
                          </a>
                        ) : null}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="mt-1 flex flex-wrap gap-1 text-[11px] font-bold">
                  <span className="rounded bg-black px-1.5 py-0.5 capitalize text-ucf-gold">{section.mode}</span>
                  <span className="text-black/60">{section.campus}</span>
                  {conflicts ? <span className="font-black text-red-700">Conflicts with selected class or custom event</span> : null}
                </div>
              </div>
            </button>
          );
        })}
        {course.sections.length === 0 ? (
          <div className="border-t-2 border-[#a2aabd] p-3 text-sm font-semibold text-black/60">
            No live myUCF sections returned for this term. Catalog details are live from UCF.
          </div>
        ) : null}
      </div>
    </article>
  );
}

function ProfessorRating({ name }: { name: string }) {
  const [rating, setRating] = useState<{ rating: number | null; ratingCount?: number | null; url?: string | null } | null>(null);

  useEffect(() => {
    const trimmed = name.trim();
    if (!trimmed || trimmed === "TBA") return;
    const controller = new AbortController();
    fetch(`/api/ucf/rmp?name=${encodeURIComponent(trimmed)}`, { signal: controller.signal })
      .then((response) => response.json())
      .then((payload) => setRating(payload))
      .catch(() => undefined);
    return () => controller.abort();
  }, [name]);

  if (!rating?.rating) return <span className="font-semibold text-black/45">RMP unavailable</span>;
  const content = (
    <span className="font-semibold text-ucf-darkGold">
      {"★".repeat(Math.max(1, Math.round(rating.rating)))} {rating.rating.toFixed(1)}
      {rating.ratingCount ? ` (${rating.ratingCount})` : ""}
    </span>
  );
  return rating.url ? (
    <a href={rating.url} target="_blank" className="underline-offset-2 hover:underline" onClick={(event) => event.stopPropagation()}>
      {content}
    </a>
  ) : (
    content
  );
}

function OfficialLink({ href, label }: { href: string; label: string }) {
  return (
    <a className="inline-flex items-center gap-1 rounded-md bg-white px-2 py-1 font-bold text-ucf-darkGold ring-1 ring-black/10" href={href} target="_blank">
      {label} <ExternalLink className="h-3.5 w-3.5" />
    </a>
  );
}

function WeeklyCalendar({
  blocks,
  removeSelection,
  removeCustomEvent
}: {
  blocks: CalendarBlock[];
  removeSelection: (sourceId: string) => void;
  removeCustomEvent: (sourceId: string) => void;
}) {
  const timedBlocks = blocks.filter((block) => block.dayOfWeek !== "Online");
  const otherBlocks = blocks.filter((block) => block.dayOfWeek === "Online");
  const timedMinutes = timedBlocks.flatMap((block) => [timeToMinutes(block.startTime), timeToMinutes(block.endTime)]).filter(Boolean);
  const minHour = timedMinutes.length ? Math.floor(Math.min(...timedMinutes) / 60) : 8;
  const maxHour = timedMinutes.length ? Math.ceil(Math.max(...timedMinutes) / 60) : 16;
  const displayedHours = Math.max(8, maxHour - minHour);
  const padding = Math.max(0, Math.floor((8 - (maxHour - minHour)) / 2));
  const start = Math.max(0, (minHour - padding) * 60);
  const end = Math.min(24 * 60, (minHour - padding + displayedHours) * 60);
  const minuteHeight = 1.85;
  const hours = Array.from({ length: Math.floor((end - start) / 60) + 1 }, (_, index) => start + index * 60);
  const height = (end - start) * minuteHeight;

  return (
    <div id="planner-schedule" className="planner-scrollbar relative h-[calc(100svh-8.25rem)] min-h-80 w-full overflow-auto text-center text-lg font-medium text-black lg:h-[calc(100svh-5.5rem)]">
      <div className={`grid min-w-[760px] ${otherBlocks.length > 0 ? "grid-cols-[44px_repeat(5,minmax(112px,1fr))_140px]" : "grid-cols-[44px_repeat(5,minmax(112px,1fr))]"}`}>
        <div className="sticky top-0 z-20 border-b border-r border-black/10 bg-white p-2" />
        {days.map((day) => (
          <div key={day} className="sticky top-0 z-20 border-b border-r border-black/10 bg-white p-2 text-center text-sm font-black">
            {dayLabels[day]}
          </div>
        ))}
        {otherBlocks.length > 0 ? <div className="sticky top-0 z-20 border-b border-black/10 bg-white p-2 text-center text-sm font-black">Other</div> : null}

        <div className="relative border-r border-black/10" style={{ height }}>
          {hours.map((hour) => (
            <div key={hour} className="absolute right-1 text-[11px] font-bold text-black/45" style={{ top: (hour - start) * minuteHeight - 8 }}>
              {minutesToDisplay(hour)}
            </div>
          ))}
        </div>

        {days.map((day) => (
          <div key={day} className="relative border-r border-black/10" style={{ height }}>
            {hours.map((hour) => (
              <div key={hour} className="absolute left-0 right-0 border-t border-black/10" style={{ top: (hour - start) * minuteHeight }} />
            ))}
            {timedBlocks
              .filter((block) => block.dayOfWeek === day)
              .map((block, index) => (
                <CalendarEvent
                  key={block.id}
                  block={block}
                  top={(timeToMinutes(block.startTime) - start) * minuteHeight}
                  height={Math.max(44, (timeToMinutes(block.endTime) - timeToMinutes(block.startTime)) * minuteHeight - 4)}
                  index={index}
                  removeSelection={removeSelection}
                  removeCustomEvent={removeCustomEvent}
                />
              ))}
          </div>
        ))}
        {otherBlocks.length > 0 ? (
          <div className="min-w-0 space-y-2 p-2">
            {otherBlocks.map((block) => (
              <div key={block.id} className="rounded-lg border border-black/10 p-2 text-xs shadow-sm" style={{ backgroundColor: block.color, opacity: block.preview ? 0.45 : 1 }}>
                <div className="font-black">{block.courseCode ?? block.title}</div>
                <div>{block.courseCode ? block.title : block.location}</div>
                {!block.preview ? (
                  <button
                    className="mt-1 text-xs font-black text-red-800"
                    onClick={() => (block.type === "course" ? removeSelection(block.sourceId) : removeCustomEvent(block.sourceId))}
                  >
                    Remove
                  </button>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function CalendarEvent({
  block,
  top,
  height,
  index,
  removeSelection,
  removeCustomEvent
}: {
  block: CalendarBlock;
  top: number;
  height: number;
  index: number;
  removeSelection: (sourceId: string) => void;
  removeCustomEvent: (sourceId: string) => void;
}) {
  return (
    <div
      className={`absolute left-1 right-1 overflow-hidden rounded-md border p-2 text-left text-[11px] leading-tight text-white shadow-sm ${
        block.conflict ? "border-red-900 ring-2 ring-red-500" : "border-black/15"
      }`}
      style={{ top, height, backgroundColor: block.type === "custom" ? "#202020" : block.color, opacity: block.preview ? 0.45 : 1, transform: `translateX(${index % 2 === 0 ? 0 : 4}px)` }}
    >
      <div className="flex items-start justify-between gap-1">
        <div className="min-w-0">
          <div className="truncate font-black">{block.courseCode ?? block.title}</div>
          <div className="truncate">{block.professor ?? "Custom event"}</div>
        </div>
        {!block.preview ? (
          <button
            className="rounded bg-black/25 p-0.5"
            onClick={() => (block.type === "course" ? removeSelection(block.sourceId) : removeCustomEvent(block.sourceId))}
            title="Remove"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </div>
      <div className="mt-1">{formatTimeRange(block.startTime, block.endTime)}</div>
      <div className="truncate">{block.sectionNumber ? `Sec ${block.sectionNumber}` : ""} {block.location}</div>
      {block.conflict ? <div className="mt-1 font-black">Conflict</div> : null}
    </div>
  );
}

function CustomEventModal({
  onClose,
  onAdd,
  existingCount
}: {
  onClose: () => void;
  onAdd: (event: CustomEvent) => boolean;
  existingCount: number;
}) {
  const [name, setName] = useState("");
  const [selectedDays, setSelectedDays] = useState<Exclude<DayOfWeek, "Online">[]>([]);
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("10:00");
  const [location, setLocation] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");

  function toggleDay(day: Exclude<DayOfWeek, "Online">) {
    setSelectedDays((current) => (current.includes(day) ? current.filter((item) => item !== day) : [...current, day]));
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) return setError("Name is required.");
    if (selectedDays.length === 0) return setError("Select at least one day.");
    if (timeToMinutes(startTime) >= timeToMinutes(endTime)) return setError("Start time must be before end time.");
    const added = onAdd({
      id: uid("event"),
      name: name.trim(),
      days: selectedDays,
      startTime,
      endTime,
      location: location.trim(),
      notes: notes.trim(),
      color: blockColors[(existingCount + 4) % blockColors.length]
    });
    if (added) onClose();
    else setError("This event conflicts with the active schedule.");
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/55 p-4">
      <form className="w-full max-w-lg rounded-md bg-white p-4 shadow-planner" onSubmit={submit}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-black">Add Custom Event</h2>
          <button type="button" onClick={onClose} className="rounded-md p-1 hover:bg-ucf-paper" aria-label="Close modal">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="mt-4 space-y-3">
          <div>
            <label className="block text-sm font-bold" htmlFor="custom-event-name">Name</label>
            <input
              id="custom-event-name"
              className="mt-1 w-full rounded-md border border-black/20 px-3 py-2"
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
            />
          </div>
          <div>
            <div className="text-sm font-bold">Days</div>
            <div className="mt-1 flex gap-2">
              {days.map((day) => (
                <button
                  key={day}
                  type="button"
                  className={`h-10 w-10 rounded-md border font-black ${selectedDays.includes(day) ? "border-ucf-darkGold bg-ucf-gold" : "border-black/20 bg-white"}`}
                  onClick={() => toggleDay(day)}
                >
                  {day}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-bold" htmlFor="custom-event-start">Start time</label>
              <select
                id="custom-event-start"
                className="mt-1 w-full rounded-md border border-black/20 px-3 py-2"
                value={startTime}
                onChange={(event) => setStartTime(event.target.value)}
                required
              >
                {timeOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-bold" htmlFor="custom-event-end">End time</label>
              <select
                id="custom-event-end"
                className="mt-1 w-full rounded-md border border-black/20 px-3 py-2"
                value={endTime}
                onChange={(event) => setEndTime(event.target.value)}
                required
              >
                {timeOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-bold" htmlFor="custom-event-location">Location</label>
            <input
              id="custom-event-location"
              className="mt-1 w-full rounded-md border border-black/20 px-3 py-2"
              value={location}
              onChange={(event) => setLocation(event.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-bold" htmlFor="custom-event-notes">Notes</label>
            <textarea
              id="custom-event-notes"
              className="mt-1 min-h-20 w-full rounded-md border border-black/20 px-3 py-2"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </div>
        </div>
        {error ? <div className="mt-3 rounded-md bg-red-50 p-2 text-sm font-bold text-red-700">{error}</div> : null}
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" className="rounded-md border border-black/20 px-4 py-2 font-bold" onClick={onClose}>Cancel</button>
          <button type="submit" className="rounded-md bg-ucf-black px-4 py-2 font-bold text-ucf-gold">Add event</button>
        </div>
      </form>
    </div>
  );
}
