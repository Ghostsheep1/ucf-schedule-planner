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
import {
	filterIndexedCourses,
	loadUcfSectionIndex,
	type IndexedInstructor
} from '$lib/ucf/sectionIndex';
import type { PlannerSection } from '$lib/sectionFilters';

const DEFAULT_TERM = 'Fall 2026';

function ok<T>(data: T[]): ApiResponse<T> {
	return new ApiResponse<T>(200, 'OK', data);
}

function fail<T>(error: unknown): ApiResponse<T> {
	const message = error instanceof Error ? error.message : 'UCF source unavailable';
	return new ApiResponse<T>(502, 'Bad Gateway', null, message);
}

function courseToBasic(course: UcfCourse): CourseBasic {
	const prerequisites = normalizePrerequisites(course.prerequisites);
	return {
		courseCode: normalizeCourseCode(course.code),
		name: course.title,
		minCredits: course.credits || 0,
		maxCredits: null,
		genEds: course.genEdTags.length
			? course.genEdTags.map((tag) => ({ code: tag, name: tag }))
			: null,
		conditions: prerequisites ? [`Prerequisite: ${prerequisites}`] : null,
		description: course.description || null
	};
}

function normalizePrerequisites(prerequisites?: string) {
	const trimmed = prerequisites?.trim();
	if (!trimmed || /^see ucf catalog\.?$/i.test(trimmed)) return '';
	return trimmed;
}

function courseToPlannerCourse(course: UcfCourse): Course {
	return {
		...courseToBasic(course),
		sections: course.sections.length
			? bundleUcfSections(course).map((section) => sectionToPlannerSection(course, section))
			: null
	};
}

type UcfSectionBundle = UcfSection & { components?: string[] };

function sectionToPlannerSection(course: UcfCourse, section: UcfSectionBundle): Section {
	const meetings = section.meetings.map(meetingToPlannerMeeting);
	return {
		courseCode: normalizeCourseCode(course.code),
		sectionCode: section.sectionNumber,
		instructors: [section.professorName || 'TBA'],
		meetings: meetings.length ? meetings : ['Unspecified'],
		openSeats: section.seatsAvailable,
		totalSeats: section.seatsTotal,
		waitlist: section.waitlistTotal ?? 0,
		holdfile: null,
		mode: section.mode,
		campus: section.campus,
		component: section.component,
		components: section.components ?? (section.component ? [section.component] : []),
		waitlistCapacity: section.waitlistCapacity,
		waitlistAvailable: section.waitlistAvailable
	} as PlannerSection;
}

function bundleUcfSections(course: UcfCourse): UcfSectionBundle[] {
	const sections = [...course.sections].sort((a, b) => sectionSortValue(a) - sectionSortValue(b));
	const explicitLectures = sections.filter((section) => section.component === 'LEC');
	const explicitChildren = sections.filter((section) =>
		['DIS', 'LAB', 'CLN', 'RSC'].includes(section.component ?? '')
	);
	if (explicitLectures.length > 0 && explicitChildren.length > 0) {
		return pairLecturesWithChildren(explicitLectures, explicitChildren, sections);
	}

	const splitIndex = inferLectureChildSplit(sections);
	if (splitIndex === -1) return sections;
	return pairLecturesWithChildren(sections.slice(0, splitIndex), sections.slice(splitIndex), sections);
}

function pairLecturesWithChildren(
	lectures: UcfSection[],
	children: UcfSection[],
	original: UcfSection[]
): UcfSectionBundle[] {
	const childGroups = groupChildrenForLectures(lectures, children);
	if (childGroups.length === 0 || childGroups.every((group) => group.length === 0)) return original;

	const bundled: UcfSectionBundle[] = [];
	for (const lecture of lectures) {
		const group = childGroups.shift();
		if (!group || group.length === 0) {
			bundled.push(lecture);
			continue;
		}
		for (const child of group) {
			bundled.push(mergeLectureAndChild(lecture, child));
		}
	}
	return bundled;
}

function mergeLectureAndChild(lecture: UcfSection, child: UcfSection): UcfSectionBundle {
	const lectureSeats = lecture.seatsTotal > 0 ? lecture.seatsAvailable : Number.MAX_SAFE_INTEGER;
	const childSeats = child.seatsTotal > 0 ? child.seatsAvailable : Number.MAX_SAFE_INTEGER;
	const openSeats = Math.min(lectureSeats, childSeats);
	const waitlistTotal = Math.max(lecture.waitlistTotal ?? 0, child.waitlistTotal ?? 0);
	const waitlistCapacity = Math.max(lecture.waitlistCapacity ?? 0, child.waitlistCapacity ?? 0) || undefined;
	const components = [lecture.component ?? 'LEC', child.component ?? 'DIS'];
	return {
		...lecture,
		id: `${lecture.id}+${child.id}`,
		sectionNumber: `${lecture.sectionNumber}/${child.sectionNumber}`,
		component: components.join('+'),
		components,
		professorName: lecture.professorName || child.professorName,
		seatsAvailable: openSeats === Number.MAX_SAFE_INTEGER ? 0 : openSeats,
		seatsTotal: finiteMin(lecture.seatsTotal, child.seatsTotal),
		waitlistTotal,
		waitlistCapacity,
		waitlistAvailable:
			waitlistCapacity !== undefined ? Math.max(0, waitlistCapacity - waitlistTotal) : undefined,
		mode: mergeModes(lecture.mode, child.mode),
		campus: lecture.campus === child.campus ? lecture.campus : lecture.campus,
		meetings: [...lecture.meetings, ...child.meetings]
	};
}

function finiteMin(a: number, b: number) {
	const values = [a, b].filter((value) => value > 0);
	return values.length > 0 ? Math.min(...values) : 0;
}

function mergeModes(a: UcfSection['mode'], b: UcfSection['mode']): UcfSection['mode'] {
	if (a === b) return a;
	return 'hybrid';
}

function groupChildrenForLectures(lectures: UcfSection[], children: UcfSection[]): UcfSection[][] {
	const exact = lectures.map((lecture) =>
		children.filter((child) => childGroupNumber(child) === sectionSortValue(lecture))
	);
	if (exact.every((group) => group.length > 0)) return exact;

	const groups: UcfSection[][] = lectures.map(() => []);
	let currentLecture = 0;
	for (const child of children) {
		if (
			groups[currentLecture].length >= Math.ceil(children.length / lectures.length) &&
			currentLecture < lectures.length - 1
		) {
			currentLecture += 1;
		}
		groups[currentLecture].push(child);
	}
	return groups;
}

function inferLectureChildSplit(sections: UcfSection[]) {
	const values = sections.map(sectionSortValue);
	for (let index = 1; index < values.length; index += 1) {
		if (values[index - 1] < 10 && values[index] - values[index - 1] >= 5) {
			return index;
		}
	}
	return -1;
}

function childGroupNumber(section: UcfSection) {
	return Math.floor(sectionSortValue(section) / 10);
}

function sectionSortValue(section: UcfSection) {
	const numeric = Number(section.sectionNumber.replace(/\D/g, ''));
	return Number.isFinite(numeric) ? numeric : Number.MAX_SAFE_INTEGER;
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

function filterCourses(
	courses: Course[],
	cfg: CoursesWithSectionsConfig | CoursesConfig
): Course[] {
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
				average_rating: instructor.average_rating,
				rating_count: instructor.rating_count
			}));
		return ok<Instructor>(instructors);
	}
};

function deriveIndexedInstructors(courses: UcfCourse[]) {
	const instructors = new Map<string, IndexedInstructor>();
	courses.forEach((course) => {
		course.sections.forEach((section) => {
			if (!section.professorName || /^(TBA|To be Announced)$/i.test(section.professorName)) return;
			const rating = section.professorRating ? section.professorRating.toFixed(1) : null;
			instructors.set(section.professorName, {
				name: section.professorName,
				slug:
					section.professorRatingUrl?.split('/').pop() ??
					section.professorName
						.toLowerCase()
						.replace(/[^a-z0-9]+/g, '-')
						.replace(/^-|-$/g, ''),
				average_rating: rating,
				rating_count: section.professorRatingCount ?? null
			});
		});
	});
	return [...instructors.values()];
}
