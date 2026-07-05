/**
 * UCF-backed client that adapts live UCF data to the planner UI contract.
 */
import {
	ApiResponse,
	type Course,
	type CourseBasic,
	type CoursesBasicResponse,
	type CoursesConfig,
	type CoursesMinifiedResponse,
	type CoursesResponse,
	type CoursesWithSectionsConfig,
	type Department,
	type DepartmentsResponse,
	type Instructor,
	type InstructorsConfig,
	type InstructorsResponse,
	type Section,
	type SectionsConfig,
	type SectionsResponse
} from '@jupiterp/jupiterp';
import type {
	Course as UcfCourse,
	DayOfWeek,
	Meeting as UcfMeeting,
	Section as UcfSection
} from '$lib/ucf/types';
import { normalizeCourseCode } from '$lib/ucf/ucfSources';
import { filterIndexedCourses, loadUcfSectionIndex } from '$lib/ucf/sectionIndex';

const DEFAULT_TERM = 'Fall 2026';

function ok<T>(data: T[]): ApiResponse<T> {
	return new ApiResponse<T>(200, 'OK', data);
}

function fail<T>(error: unknown): ApiResponse<T> {
	const message = error instanceof Error ? error.message : 'UCF source unavailable';
	return new ApiResponse<T>(502, 'Bad Gateway', null, message);
}

function courseToBasic(course: UcfCourse): CourseBasic {
	return {
		courseCode: normalizeCourseCode(course.code),
		name: course.title,
		minCredits: course.credits || 0,
		maxCredits: null,
		genEds: course.genEdTags.length
			? course.genEdTags.map((tag) => ({ code: tag, name: tag }))
			: null,
		conditions: course.prerequisites ? [`Prerequisite: ${course.prerequisites}`] : null,
		description: course.description || null
	};
}

function courseToPlannerCourse(course: UcfCourse): Course {
	return {
		...courseToBasic(course),
		sections: course.sections.length
			? course.sections.map((section) => sectionToPlannerSection(course, section))
			: null
	};
}

function sectionToPlannerSection(course: UcfCourse, section: UcfSection): Section {
	const meetings = section.meetings.map(meetingToPlannerMeeting);
	return {
		courseCode: normalizeCourseCode(course.code),
		sectionCode: section.sectionNumber,
		instructors: [section.professorName || 'TBA'],
		meetings: meetings.length ? meetings : ['Unspecified'],
		openSeats: section.seatsAvailable,
		totalSeats: section.seatsTotal,
		waitlist: section.waitlistTotal ?? 0,
		holdfile: null
	};
}

function meetingToPlannerMeeting(meeting: UcfMeeting): Section['meetings'][number] {
	if (meeting.dayOfWeek === 'Online') {
		return 'OnlineAsync';
	}
	if (!meeting.startTime || !meeting.endTime) {
		return 'TBA';
	}
	return {
		classtime: {
			days: dayCode(meeting.dayOfWeek),
			start: timeToDecimal(meeting.startTime),
			end: timeToDecimal(meeting.endTime)
		},
		location: {
			building: meeting.building || 'TBA',
			room: meeting.room || null
		}
	};
}

function dayCode(day: DayOfWeek): string {
	switch (day) {
		case 'M':
			return 'M';
		case 'Tu':
			return 'Tu';
		case 'W':
			return 'W';
		case 'Th':
			return 'Th';
		case 'F':
			return 'F';
		case 'Sa':
			return 'Sa';
		case 'Su':
			return 'Su';
		default:
			return 'TBA';
	}
}

function timeToDecimal(time: string): number {
	const [hourRaw, minuteRaw] = time.split(':');
	const hour = Number(hourRaw);
	const minute = Number(minuteRaw);
	return hour + minute / 60;
}

function filterCourses(courses: Course[], cfg: CoursesWithSectionsConfig | CoursesConfig): Course[] {
	let result = courses;
	if (cfg.courseCodes && cfg.courseCodes.size > 0) {
		const codes = new Set([...cfg.courseCodes].map(normalizeCourseCode));
		result = result.filter((course) => codes.has(course.courseCode));
	}
	if (cfg.prefix !== undefined && cfg.prefix !== '') {
		const prefix = normalizeCourseCode(cfg.prefix);
		result = result.filter((course) => course.courseCode.startsWith(prefix));
	}
	if (cfg.number !== undefined && cfg.number !== '') {
		const number = cfg.number.replace(/\D/g, '');
		result = result.filter((course) => course.courseCode.replace(/^[A-Z]+/, '').startsWith(number));
	}
	if ('onlyOpen' in cfg && cfg.onlyOpen) {
		result = result
			.map((course) => ({
				...course,
				sections: course.sections?.filter((section) => section.openSeats > 0) ?? null
			}))
			.filter((course) => course.sections != null && course.sections.length > 0);
	}
	return result.slice(cfg.offset ?? 0, (cfg.offset ?? 0) + (cfg.limit ?? result.length));
}

async function coursesWithSectionsData(cfg: CoursesWithSectionsConfig): Promise<Course[]> {
	const index = await loadUcfSectionIndex();
	if (index?.term === DEFAULT_TERM && index.courses.length > 0) {
		const indexedCourses = filterIndexedCourses(index.courses, cfg);
		return indexedCourses.map(courseToPlannerCourse);
	}
	return [];
}

export const client = {
	async deptList(): Promise<DepartmentsResponse> {
		try {
			const index = await loadUcfSectionIndex();
			if (index?.departments.length) {
				return ok<Department>(
					index.departments.map((dept) => ({
						deptCode: dept.code,
						name: dept.name
					}))
				);
			}
			return ok<Department>([]);
		} catch (error) {
			return fail<Department>(error);
		}
	},

	async coursesBasic(cfg: CoursesConfig): Promise<CoursesBasicResponse> {
		try {
			const courses = await coursesWithSectionsData(cfg);
			return ok<CourseBasic>(courses.map(({ sections, ...course }) => course));
		} catch (error) {
			return fail<CourseBasic>(error);
		}
	},

	async coursesMinified(cfg: CoursesConfig): Promise<CoursesMinifiedResponse> {
		try {
			const courses = await coursesWithSectionsData(cfg);
			return ok(courses.map((course) => ({ courseCode: course.courseCode, name: course.name })));
		} catch (error) {
			return fail(error);
		}
	},

	async coursesWithSections(cfg: CoursesWithSectionsConfig): Promise<CoursesResponse> {
		try {
			return ok<Course>(await coursesWithSectionsData(cfg));
		} catch (error) {
			return fail<Course>(error);
		}
	},

	async sections(cfg: SectionsConfig): Promise<SectionsResponse> {
		try {
			const courses = await coursesWithSectionsData(cfg);
			return ok<Section>(courses.flatMap((course) => course.sections ?? []));
		} catch (error) {
			return fail<Section>(error);
		}
	},

	async activeInstructors(cfg: InstructorsConfig): Promise<InstructorsResponse> {
		const index = await loadUcfSectionIndex();
		if (!index) return ok<Instructor>([]);
		const instructors = (index.instructors ?? deriveIndexedInstructors(index.courses))
			.sort((a, b) => a.name.localeCompare(b.name))
			.slice(cfg.offset ?? 0, (cfg.offset ?? 0) + (cfg.limit ?? index.courses.length))
			.map((instructor) => ({
				name: instructor.name,
				slug: instructor.slug,
				average_rating: instructor.average_rating
			}));
		return ok<Instructor>(instructors);
	}
};

function deriveIndexedInstructors(courses: UcfCourse[]) {
	const instructors = new Map<string, Instructor>();
	courses.forEach((course) => {
		course.sections.forEach((section) => {
			if (!section.professorName || /^(TBA|To be Announced)$/i.test(section.professorName)) return;
			const rating = section.professorRating ? section.professorRating.toFixed(1) : null;
			instructors.set(section.professorName, {
				name: section.professorName,
				slug: section.professorRatingUrl?.split('/').pop() ?? section.professorName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
				average_rating: rating
			});
		});
	});
	return [...instructors.values()];
}
