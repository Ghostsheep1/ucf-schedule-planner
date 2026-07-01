import type { CalendarBlock, Course, CustomEvent, DayOfWeek, Meeting, SchedulePlan, Section, SelectedSection } from "$lib/types";

export const days: Exclude<DayOfWeek, "Online">[] = ["M", "Tu", "W", "Th", "F", "Sa", "Su"];
export const dayLabels: Record<DayOfWeek, string> = {
  M: "Mon",
  Tu: "Tue",
  W: "Wed",
  Th: "Thu",
  F: "Fri",
  Sa: "Sat",
  Su: "Sun",
  Online: "Other"
};

export const blockColors = ["#f0b429", "#3f8cff", "#20a67a", "#d45d79", "#7c5cff", "#ef7d22", "#1c7c8c", "#8a6f2a"];

export function uid(prefix: string) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function timeToMinutes(time: string) {
  if (!time) return 0;
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

export function minutesToDisplay(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  const suffix = hours >= 12 ? "PM" : "AM";
  const hour = hours % 12 || 12;
  return `${hour}:${mins.toString().padStart(2, "0")} ${suffix}`;
}

export function formatTimeRange(startTime: string, endTime: string) {
  if (!startTime || !endTime) return "Async";
  return `${minutesToDisplay(timeToMinutes(startTime))} - ${minutesToDisplay(timeToMinutes(endTime))}`;
}

export function meetingLocation(meeting: Meeting) {
  if (meeting.dayOfWeek === "Online") return meeting.building ?? "Online";
  return [meeting.building, meeting.room].filter(Boolean).join(" ");
}

export function selectedCourse(schedule: SchedulePlan, courseId: string) {
  return schedule.selections.find((selection) => selection.courseId === courseId);
}

export function findSection(course: Course, sectionId: string) {
  return course.sections.find((section) => section.id === sectionId);
}

export function getSelectionPairs(schedule: SchedulePlan) {
  return schedule.selections.flatMap((selection) => {
    const course = selection.course;
    const section = course ? findSection(course, selection.sectionId) : undefined;
    return course && section ? [{ selection, course, section }] : [];
  });
}

export function uniqueCredits(schedule: SchedulePlan) {
  const seen = new Set<string>();
  return schedule.selections.reduce((total, selection) => {
    if (!selection.course || seen.has(selection.courseId)) return total;
    seen.add(selection.courseId);
    return total + selection.course.credits;
  }, 0);
}

export function sectionToBlocks(course: Course, section: Section, selection: SelectedSection): CalendarBlock[] {
  return section.meetings.map((meeting, index) => ({
    id: `${selection.id}-${meeting.dayOfWeek}-${index}`,
    sourceId: selection.id,
    type: "course",
    courseCode: course.code,
    sectionNumber: section.sectionNumber,
    title: course.title,
    professor: section.professorName,
    dayOfWeek: meeting.dayOfWeek,
    startTime: meeting.startTime,
    endTime: meeting.endTime,
    location: meetingLocation(meeting),
    color: selection.color,
    conflict: false
  }));
}

export function eventToBlocks(event: CustomEvent): CalendarBlock[] {
  return event.days.map((day, index) => ({
    id: `${event.id}-${day}-${index}`,
    sourceId: event.id,
    type: "custom",
    title: event.name,
    dayOfWeek: day,
    startTime: event.startTime,
    endTime: event.endTime,
    location: event.location,
    color: event.color,
    conflict: false
  }));
}

export function calendarBlocks(schedule: SchedulePlan) {
  const blocks = [
    ...getSelectionPairs(schedule).flatMap(({ course, section, selection }) => sectionToBlocks(course, section, selection)),
    ...schedule.customEvents.flatMap(eventToBlocks)
  ];
  return markConflicts(blocks);
}

export function overlaps(a: CalendarBlock, b: CalendarBlock) {
  if (a.dayOfWeek === "Online" || b.dayOfWeek === "Online") return false;
  if (a.dayOfWeek !== b.dayOfWeek) return false;
  if (!a.startTime || !a.endTime || !b.startTime || !b.endTime) return false;
  return timeToMinutes(a.startTime) < timeToMinutes(b.endTime) && timeToMinutes(b.startTime) < timeToMinutes(a.endTime);
}

export function markConflicts(blocks: CalendarBlock[]) {
  return blocks.map((block, _, all) => ({
    ...block,
    conflict: all.some((other) => other.id !== block.id && overlaps(block, other))
  }));
}

export function candidateConflicts(schedule: SchedulePlan, course: Course, section: Section, replacingCourseId?: string) {
  const retained: SchedulePlan = {
    ...schedule,
    selections: schedule.selections.filter((selection) => selection.courseId !== replacingCourseId)
  };
  const candidate: SelectedSection = {
    id: "candidate",
    courseId: course.id,
    sectionId: section.id,
    color: "#111111"
  };
  const existingBlocks = calendarBlocks(retained);
  const candidateBlocks = sectionToBlocks(course, section, candidate);
  return candidateBlocks.some((candidateBlock) => existingBlocks.some((existing) => overlaps(candidateBlock, existing)));
}

export function customEventConflicts(schedule: SchedulePlan, event: CustomEvent) {
  const candidateBlocks = eventToBlocks(event);
  return candidateBlocks.some((candidateBlock) => calendarBlocks(schedule).some((existing) => overlaps(candidateBlock, existing)));
}

export function initialSchedule(): SchedulePlan {
  return {
    id: uid("schedule"),
    name: "Schedule 1",
    selections: [],
    customEvents: []
  };
}

export function colorForIndex(index: number) {
  return blockColors[index % blockColors.length];
}
