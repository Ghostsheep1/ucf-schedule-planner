import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
	fetchUcfCatalogCourses,
	fetchUcfClassSections,
	fetchUcfSubjects,
	normalizeCourseCode,
	searchUcfCatalog
} from '../src/lib/ucf/ucfSources';
import type { Course } from '../src/lib/ucf/types';

type IndexedInstructor = {
	name: string;
	slug: string;
	average_rating: string | null;
	rating_count?: number | null;
};

type UcfSectionIndex = {
	version: 1;
	generatedAt: string;
	term: string;
	complete?: boolean;
	courses: Course[];
	departments: { code: string; name: string }[];
	instructors: IndexedInstructor[];
	sourceStatus?: string;
};

type RmpTeacher = {
	node?: {
		firstName?: string;
		lastName?: string;
		avgRating?: number;
		numRatings?: number;
		legacyId?: number;
	};
};

const term = process.env.UCF_INDEX_TERM ?? 'Fall 2026';
const outputPath =
	process.env.UCF_INDEX_OUTPUT ?? path.resolve(process.cwd(), 'static/data/ucf-section-index.json');
const courseLimit = Number(process.env.UCF_INDEX_COURSE_LIMIT ?? '0');
const concurrency = Math.max(1, Number(process.env.UCF_INDEX_CONCURRENCY ?? '4'));
const subjects = new Set(
	(process.env.UCF_INDEX_SUBJECTS ?? '')
		.split(',')
		.map((subject) => subject.trim().toUpperCase())
		.filter(Boolean)
);
const includeCatalogDetails = process.env.UCF_INDEX_INCLUDE_DETAILS !== '0';
const includeSeatDetails = process.env.UCF_INDEX_INCLUDE_SEATS !== '0';
const includeRmpRatings = process.env.UCF_INDEX_INCLUDE_RMP !== '0';
const rmpConcurrency = Math.max(1, Number(process.env.UCF_INDEX_RMP_CONCURRENCY ?? '3'));
const rmpDelayMs = Math.max(0, Number(process.env.UCF_INDEX_RMP_DELAY_MS ?? '800'));
const rmpRetryCount = Math.max(0, Number(process.env.UCF_INDEX_RMP_RETRIES ?? '4'));
const rmpOnly = process.env.UCF_INDEX_RMP_ONLY === '1';
const RMP_UCF_SCHOOL_ID = 'U2Nob29sLTEwODI=';
const RMP_GRAPHQL_URL = 'https://www.ratemyprofessors.com/graphql';

async function main() {
	const started = Date.now();
	console.log(`Building UCF section index for ${term}...`);

	if (rmpOnly) {
		const existing = JSON.parse(await readFile(outputPath, 'utf8')) as UcfSectionIndex;
		const instructors = await buildInstructorRatings(existing.courses);
		const courses = applyInstructorRatings(existing.courses, instructors);
		await writeIndex({
			...existing,
			generatedAt: new Date().toISOString(),
			instructors,
			courses,
			sourceStatus: `Refreshed ${instructors.length} RMP instructor ratings in ${Math.round(
				(Date.now() - started) / 1000
			)}s.`
		});
		return;
	}

	const [departments, catalogCourses] = await Promise.all([
		fetchUcfSubjects(),
		fetchUcfCatalogCourses({ includeDetails: false })
	]);

	const selectedCourses = catalogCourses
		.filter((course) => {
			if (subjects.size === 0) return true;
			return subjects.has(normalizeCourseCode(course.code).match(/^[A-Z]+/)?.[0] ?? '');
		})
		.slice(0, courseLimit > 0 ? courseLimit : catalogCourses.length);

	console.log(`Indexing ${selectedCourses.length} courses with concurrency ${concurrency}.`);

	let completed = 0;
	let indexedCourses = await mapLimit(selectedCourses, concurrency, async (course) => {
		try {
			const [detail] = includeCatalogDetails
				? await searchUcfCatalog(course.code, 1, { includeDetails: true })
				: [course];
			const indexedCourse = detail ?? course;
			const sections = await fetchUcfClassSections(course.code, term, {
				includeSeatDetails
			});
			completed += 1;
			if (completed % 25 === 0 || completed === selectedCourses.length) {
				console.log(`Indexed ${completed}/${selectedCourses.length} courses.`);
			}
			return { ...indexedCourse, sections };
		} catch (error) {
			completed += 1;
			console.warn(
				`Could not index ${course.code}: ${error instanceof Error ? error.message : String(error)}`
			);
			return { ...course, sections: [] };
		}
	});

	indexedCourses = indexedCourses.filter((course) => course.sections.length > 0);

	const instructors = includeRmpRatings ? await buildInstructorRatings(indexedCourses) : [];
	indexedCourses = applyInstructorRatings(indexedCourses, instructors);

	const index: UcfSectionIndex = {
		version: 1,
		generatedAt: new Date().toISOString(),
		term,
		complete: subjects.size === 0 && courseLimit === 0,
		courses: indexedCourses,
		departments,
		instructors,
		sourceStatus: `Indexed ${indexedCourses.length} UCF courses with ${
			includeSeatDetails ? 'seats/waitlists' : 'section rows'
		} and ${instructors.length} RMP instructor ratings in ${Math.round(
			(Date.now() - started) / 1000
		)}s.`
	};

	await writeIndex(index);
}

async function writeIndex(index: UcfSectionIndex) {
	await mkdir(path.dirname(outputPath), { recursive: true });
	await writeFile(outputPath, `${JSON.stringify(index, null, 2)}\n`);
	console.log(`Wrote ${index.courses.length} section-bearing courses to ${outputPath}.`);
}

function applyInstructorRatings(courses: Course[], instructors: IndexedInstructor[]) {
	const instructorLookup = new Map(instructors.map((instructor) => [normalizeInstructor(instructor.name), instructor]));
	return courses.map((course) => ({
		...course,
		sections: course.sections.map((section) => {
			const instructor = instructorLookup.get(normalizeInstructor(section.professorName));
			if (!instructor?.average_rating) {
				const { professorRating, professorRatingCount, professorRatingUrl, ...withoutRating } = section;
				return withoutRating;
			}
			return {
				...section,
				professorRating: Number(instructor.average_rating),
				professorRatingCount: instructor.rating_count ?? undefined,
				professorRatingUrl: `https://www.ratemyprofessors.com/professor/${instructor.slug}`
			};
		})
	}));
}

async function buildInstructorRatings(courses: Course[]): Promise<IndexedInstructor[]> {
	const names = [
		...new Set(
			courses
				.flatMap((course) => course.sections.map((section) => section.professorName))
				.map((name) => name.trim())
				.filter((name) => name && !/^(TBA|To be Announced)$/i.test(name))
		)
	].sort();

	console.log(`Fetching RateMyProfessors ratings for ${names.length} instructors.`);
	const results = await mapLimit(names, rmpConcurrency, async (name, index) => {
		try {
			const rating = await fetchRmpRating(name);
			if ((index + 1) % 50 === 0 || index + 1 === names.length) {
				console.log(`Indexed RMP ${index + 1}/${names.length} instructors.`);
			}
			return rating;
		} catch (error) {
			console.warn(`Could not index RMP for ${name}: ${error instanceof Error ? error.message : String(error)}`);
			return {
				name,
				slug: slugify(name),
				average_rating: null,
				rating_count: null
			};
		}
	});
	return results;
}

async function fetchRmpRating(name: string): Promise<IndexedInstructor> {
	const results = await searchRmpProfessor(name);
	const normalizedName = normalizeInstructor(name);
	const best =
		results.find((result) => {
			const node = result.node;
			if (!node?.legacyId) return false;
			const candidate = normalizeInstructor([node.firstName, node.lastName].filter(Boolean).join(' '));
			return candidate === normalizedName;
		})?.node ?? results.find((result) => result.node?.legacyId)?.node;

	return {
		name,
		slug: best?.legacyId ? String(best.legacyId) : slugify(name),
		average_rating:
			typeof best?.avgRating === 'number' && best.avgRating > 0 ? best.avgRating.toFixed(1) : null,
		rating_count: typeof best?.numRatings === 'number' ? best.numRatings : null
	};
}

async function searchRmpProfessor(name: string): Promise<RmpTeacher[]> {
	for (let attempt = 0; attempt <= rmpRetryCount; attempt += 1) {
		if (attempt > 0 || rmpDelayMs > 0) {
			await delay(rmpDelayMs * Math.max(1, attempt));
		}
		const response = await fetch(RMP_GRAPHQL_URL, {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				authorization: 'Basic dGVzdDp0ZXN0',
				'user-agent': 'Mozilla/5.0 KnightPlanner/1.0'
			},
			body: JSON.stringify({
				query: `query TeacherSearchResultsPageQuery($query: TeacherSearchQuery!, $schoolID: ID, $includeSchoolFilter: Boolean!) {
				search: newSearch {
					teachers(query: $query, first: 8, after: "") {
						edges {
							node {
								id
								legacyId
								firstName
								lastName
								avgRating
								numRatings
								school {
									id
									name
								}
							}
						}
					}
				}
				school: node(id: $schoolID) @include(if: $includeSchoolFilter) {
					__typename
					... on School {
						name
					}
					id
				}
			}`,
				variables: {
					query: {
						text: name,
						schoolID: RMP_UCF_SCHOOL_ID,
						fallback: true,
						departmentID: null
					},
					schoolID: RMP_UCF_SCHOOL_ID,
					includeSchoolFilter: true
				}
			})
		});
		if (response.status === 429 && attempt < rmpRetryCount) continue;
		if (!response.ok) throw new Error(`RMP ${response.status}`);
		const payload = (await response.json()) as {
			data?: { search?: { teachers?: { edges?: RmpTeacher[] } } };
			errors?: { message?: string }[];
		};
		if (payload.errors?.length) {
			throw new Error(payload.errors.map((error) => error.message).filter(Boolean).join('; '));
		}
		return payload.data?.search?.teachers?.edges ?? [];
	}
	return [];
}

function delay(ms: number) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeInstructor(name: string) {
	return name.toLowerCase().replace(/[^a-z]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function slugify(name: string) {
	return normalizeInstructor(name).replace(/\s+/g, '-');
}

async function mapLimit<T, R>(
	items: T[],
	limit: number,
	mapper: (item: T, index: number) => Promise<R>
) {
	const results: R[] = new Array(items.length);
	let nextIndex = 0;

	async function worker() {
		while (nextIndex < items.length) {
			const currentIndex = nextIndex;
			nextIndex += 1;
			results[currentIndex] = await mapper(items[currentIndex], currentIndex);
		}
	}

	await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
	return results;
}

main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
