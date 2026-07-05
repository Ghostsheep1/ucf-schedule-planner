import type { CoursesConfig, CoursesWithSectionsConfig } from '@jupiterp/jupiterp';
import type { Course } from '$lib/ucf/types';
import type { UcfSubject } from '$lib/ucf/ucfSources';

export type IndexedInstructor = {
	name: string;
	slug: string;
	average_rating: string | null;
	rating_count?: number | null;
};

export type UcfSectionIndex = {
	version: 1;
	generatedAt: string;
	term: string;
	complete?: boolean;
	courses: Course[];
	departments: UcfSubject[];
	instructors?: IndexedInstructor[];
	sourceStatus?: string;
};

let indexPromise: Promise<UcfSectionIndex | null> | null = null;

function normalizeCourseCode(input: string) {
	return input.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export async function loadUcfSectionIndex(): Promise<UcfSectionIndex | null> {
	if (indexPromise) return indexPromise;
	if (typeof window === 'undefined') return null;

	indexPromise = fetch('/data/ucf-section-index.json', { cache: 'force-cache' })
		.then((response) => (response.ok ? (response.json() as Promise<UcfSectionIndex>) : null))
		.catch(() => null);
	return indexPromise;
}

export function filterIndexedCourses(
	courses: Course[],
	cfg: CoursesWithSectionsConfig | CoursesConfig
): Course[] {
	let result = courses;

	if (cfg.courseCodes && cfg.courseCodes.size > 0) {
		const wanted = new Set([...cfg.courseCodes].map(normalizeCourseCode));
		result = result.filter((course) => wanted.has(normalizeCourseCode(course.code)));
	}

	if (cfg.prefix !== undefined && cfg.prefix !== '') {
		const prefix = normalizeCourseCode(cfg.prefix);
		result = result.filter((course) => normalizeCourseCode(course.code).startsWith(prefix));
	}

	if (cfg.number !== undefined && cfg.number !== '') {
		const number = cfg.number.replace(/\D/g, '');
		result = result.filter((course) =>
			normalizeCourseCode(course.code).replace(/^[A-Z]+/, '').startsWith(number)
		);
	}

	if ('instructor' in cfg && cfg.instructor) {
		const instructor = normalizePersonQuery(cfg.instructor);
		result = result
			.map((course) => ({
				...course,
				sections: course.sections.filter((section) =>
					personMatches(section.professorName, instructor)
				)
			}))
			.filter((course) => course.sections.length > 0);
	}

	if ('genEds' in cfg && cfg.genEds && cfg.genEds.size > 0) {
		const genEds = new Set([...cfg.genEds].map(genEdCode));
		result = result.filter((course) =>
			course.genEdTags.some((tag) => genEds.has(tag.toUpperCase()))
		);
	}

	if ('onlyOpen' in cfg && cfg.onlyOpen) {
		result = result
			.map((course) => ({
				...course,
				sections: course.sections.filter((section) => section.seatsAvailable > 0)
			}))
			.filter((course) => course.sections.length > 0);
	}

	return result
		.sort((a, b) => compareCourseCodes(a.code, b.code))
		.slice(cfg.offset ?? 0, (cfg.offset ?? 0) + (cfg.limit ?? result.length));
}

function genEdCode(tag: unknown) {
	if (typeof tag === 'string') return tag.toUpperCase();
	if (tag && typeof tag === 'object' && 'code' in tag && typeof tag.code === 'string') {
		return tag.code.toUpperCase();
	}
	return '';
}

function compareCourseCodes(a: string, b: string) {
	const parse = (code: string) => normalizeCourseCode(code).match(/^([A-Z]+)(\d+)([A-Z]*)$/);
	const aMatch = parse(a);
	const bMatch = parse(b);
	if (!aMatch || !bMatch) return a.localeCompare(b);
	return (
		aMatch[1].localeCompare(bMatch[1]) ||
		Number(aMatch[2]) - Number(bMatch[2]) ||
		aMatch[3].localeCompare(bMatch[3])
	);
}

export function searchIndexedCourses(
	courses: Course[],
	query: string,
	limit: number,
	instructorQuery = ''
) {
	const normalizedQuery = normalizeCourseCode(query);
	const textQuery = query.trim().toLowerCase();
	let result = courses;

	if (instructorQuery) {
		const instructor = normalizePersonQuery(instructorQuery);
		result = result
			.map((course) => ({
				...course,
				sections: course.sections.filter((section) =>
					personMatches(section.professorName, instructor)
				)
			}))
			.filter((course) => course.sections.length > 0);
	}

	if (normalizedQuery) {
		result = result.filter((course) => {
			const code = normalizeCourseCode(course.code);
			return code.startsWith(normalizedQuery) || course.title.toLowerCase().includes(textQuery);
		});
	}

	return result.sort((a, b) => compareCourseCodes(a.code, b.code)).slice(0, limit);
}

function normalizePersonQuery(input: string) {
	return input
		.trim()
		.toLowerCase()
		.replace(/^@/, '')
		.replace(/[^a-z\s-]/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
}

function personMatches(name: string, normalizedQuery: string) {
	if (!normalizedQuery) return true;
	const normalizedName = normalizePersonQuery(name);
	if (normalizedName.includes(normalizedQuery)) return true;

	const queryParts = normalizedQuery.split(/\s+/).filter(Boolean);
	const nameParts = normalizedName.split(/\s+/).filter(Boolean);
	return queryParts.every((queryPart) =>
		nameParts.some((namePart) =>
			queryPart.length >= 4 ? namePart === queryPart : namePart.startsWith(queryPart)
		)
	);
}
