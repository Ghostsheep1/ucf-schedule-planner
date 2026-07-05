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
import {
	fetchUcfClassSections,
	fetchUcfProfessorCourses,
	fetchUcfSubjects,
	normalizeCourseCode,
	searchUcfCatalog,
	UCF_CLASS_SEARCH_URL
} from '$lib/ucf/ucfSources';
import { filterIndexedCourses, loadUcfSectionIndex } from '$lib/ucf/sectionIndex';

const DEFAULT_TERM = 'Fall 2026';
const COURSE_CACHE_MS = 10 * 60 * 1000;
const DEPT_CACHE_MS = 60 * 60 * 1000;
const CATALOG_CACHE_MS = 60 * 60 * 1000;

type CacheEntry<T> = {
	expires: number;
	value: Promise<T>;
};

const cache = new Map<string, CacheEntry<unknown>>();

function cached<T>(key: string, ttlMs: number, loader: () => Promise<T>): Promise<T> {
	const now = Date.now();
	const current = cache.get(key) as CacheEntry<T> | undefined;
	if (current && current.expires > now) {
		return current.value;
	}
	const value = loader();
	cache.set(key, { expires: now + ttlMs, value });
	return value;
}

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
	const limit = cfg.limit ?? 80;
	const index = await loadUcfSectionIndex();
	if (index?.complete && index.term === DEFAULT_TERM && index.courses.length > 0) {
		const indexedCourses = filterIndexedCourses(index.courses, cfg);
		if (indexedCourses.length > 0 || cfg.prefix !== undefined || cfg.number !== undefined || cfg.instructor) {
			return indexedCourses.map(courseToPlannerCourse);
		}
	}

	if (cfg.instructor) {
		const instructor = cfg.instructor.trim();
		const courses = await cached(`professor:${DEFAULT_TERM}:${instructor}:${limit}`, COURSE_CACHE_MS, () =>
			fetchUcfProfessorCourses(instructor, DEFAULT_TERM, limit)
		);
		return filterCourses(courses.map(courseToPlannerCourse), cfg);
	}

	let catalogCourses: UcfCourse[] = [];
	const shouldLoadSections = cfg.courseCodes != null && cfg.courseCodes.size > 0;
	if (cfg.courseCodes && cfg.courseCodes.size > 0) {
		catalogCourses = (
			await Promise.all(
				[...cfg.courseCodes].map((code) =>
					cached(`catalog:exact:${normalizeCourseCode(code)}`, CATALOG_CACHE_MS, () =>
						searchUcfCatalog(normalizeCourseCode(code), 1, { includeDetails: true })
					)
				)
			)
		).flat();
	} else if (cfg.prefix !== undefined) {
		catalogCourses = await cached(`catalog:prefix:${cfg.prefix}:${limit}`, CATALOG_CACHE_MS, () =>
			searchUcfCatalog(cfg.prefix ?? '', limit, { includeDetails: false })
		);
	} else if (cfg.number !== undefined) {
		catalogCourses = await cached(`catalog:number:${cfg.number}:${limit}`, CATALOG_CACHE_MS, () =>
			searchUcfCatalog(cfg.number ?? '', limit, { includeDetails: false })
		);
	}

	const withSections = shouldLoadSections
		? await Promise.all(
				catalogCourses.map(async (course) => ({
					...course,
					scheduleUrl: UCF_CLASS_SEARCH_URL,
					sections: await cached(
						`sections:${DEFAULT_TERM}:${normalizeCourseCode(course.code)}`,
						COURSE_CACHE_MS,
						() => fetchUcfClassSections(course.code, DEFAULT_TERM, { includeSeatDetails: false })
					)
				}))
			)
		: catalogCourses;

	return filterCourses(withSections.map(courseToPlannerCourse), cfg);
}

export const client = {
	async deptList(): Promise<DepartmentsResponse> {
		try {
			const index = await loadUcfSectionIndex();
			if (index?.complete && index.departments.length > 0) {
				return ok<Department>(
					index.departments.map((dept) => ({
						deptCode: dept.code,
						name: dept.name
					}))
				);
			}
			const departments = await cached('departments', DEPT_CACHE_MS, fetchUcfSubjects);
			return ok<Department>(
				departments.map((dept) => ({
					deptCode: dept.code,
					name: dept.name
				}))
			);
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
		const names = new Set<string>();
		if (!index?.complete) return ok<Instructor>([]);
		index.courses.forEach((course) => {
			course.sections.forEach((section) => {
				if (section.professorName && section.professorName !== 'TBA') {
					names.add(section.professorName);
				}
			});
		});
		const instructors = [...names]
			.sort()
			.slice(cfg.offset ?? 0, (cfg.offset ?? 0) + (cfg.limit ?? names.size))
			.map((name) => ({
				name,
				slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
				average_rating: null
			}));
		return ok<Instructor>(instructors);
	}
};
