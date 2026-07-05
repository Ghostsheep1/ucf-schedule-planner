import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
	fetchUcfCatalogCourses,
	fetchUcfClassSections,
	fetchUcfSubjects,
	normalizeCourseCode,
	searchUcfCatalog
} from '../src/lib/ucf/ucfSources';
import type { Course } from '../src/lib/ucf/types';

type UcfSectionIndex = {
	version: 1;
	generatedAt: string;
	term: string;
	complete?: boolean;
	courses: Course[];
	departments: { code: string; name: string }[];
	sourceStatus?: string;
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

async function main() {
	const started = Date.now();
	console.log(`Building UCF section index for ${term}...`);

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
	const indexedCourses = await mapLimit(selectedCourses, concurrency, async (course) => {
		try {
			const [detail] = includeCatalogDetails
				? await searchUcfCatalog(course.code, 1, { includeDetails: true })
				: [course];
			const indexedCourse = detail ?? course;
			const sections = await fetchUcfClassSections(course.code, term, { includeSeatDetails: false });
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

	const index: UcfSectionIndex = {
		version: 1,
		generatedAt: new Date().toISOString(),
		term,
		complete: subjects.size === 0 && courseLimit === 0,
		courses: indexedCourses.filter((course) => course.sections.length > 0),
		departments,
		sourceStatus: `Indexed ${indexedCourses.length} UCF courses in ${Math.round(
			(Date.now() - started) / 1000
		)}s. Seats and waitlists refresh live.`
	};

	await mkdir(path.dirname(outputPath), { recursive: true });
	await writeFile(outputPath, `${JSON.stringify(index, null, 2)}\n`);
	console.log(`Wrote ${index.courses.length} section-bearing courses to ${outputPath}.`);
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
