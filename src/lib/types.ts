export type DayOfWeek = "M" | "Tu" | "W" | "Th" | "F" | "Sa" | "Su" | "Online";
export type Campus = "Main" | "Downtown" | "Rosen" | "Online";
export type InstructionMode = "in-person" | "online" | "hybrid";

export type Meeting = {
  dayOfWeek: DayOfWeek;
  startTime: string;
  endTime: string;
  building?: string;
  room?: string;
};

export type Section = {
  id: string;
  sectionNumber: string;
  professorName: string;
  professorRating?: number;
  professorRatingCount?: number;
  professorRatingUrl?: string;
  seatsAvailable: number;
  seatsTotal: number;
  enrollmentTotal?: number;
  waitlistAvailable?: number;
  waitlistTotal?: number;
  waitlistCapacity?: number;
  seatDetailsStatus?: "loading" | "live" | "unavailable";
  mode: InstructionMode;
  campus: Campus;
  meetings: Meeting[];
};

export type Course = {
  id: string;
  code: string;
  title: string;
  credits: number;
  genEdTags: string[];
  description: string;
  prerequisites: string;
  catalogUrl?: string;
  scheduleUrl?: string;
  sections: Section[];
};

export type SelectedSection = {
  id: string;
  courseId: string;
  sectionId: string;
  course?: Course;
  color: string;
};

export type CustomEvent = {
  id: string;
  name: string;
  days: Exclude<DayOfWeek, "Online">[];
  startTime: string;
  endTime: string;
  location?: string;
  notes?: string;
  color: string;
};

export type SchedulePlan = {
  id: string;
  name: string;
  selections: SelectedSection[];
  customEvents: CustomEvent[];
};

export type PlannerState = {
  term: string;
  schedulesByTerm: Record<string, SchedulePlan[]>;
  activeScheduleIdByTerm: Record<string, string>;
};

export type Filters = {
  genEdTags: string[];
  minCredits: string;
  maxCredits: string;
  onlyOpen: boolean;
};

export type CalendarBlock = {
  id: string;
  sourceId: string;
  type: "course" | "custom";
  preview?: boolean;
  courseCode?: string;
  sectionNumber?: string;
  title: string;
  professor?: string;
  dayOfWeek: DayOfWeek;
  startTime: string;
  endTime: string;
  location?: string;
  color: string;
  conflict: boolean;
};
