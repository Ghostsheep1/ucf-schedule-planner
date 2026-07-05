import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { UcfSectionIndex } from '$lib/ucf/sectionIndex';

let indexPromise: Promise<UcfSectionIndex | null> | null = null;

export async function loadServerUcfSectionIndex() {
	if (indexPromise) return indexPromise;
	indexPromise = readFile(path.resolve(process.cwd(), 'static/data/ucf-section-index.json'), 'utf8')
		.then((raw) => JSON.parse(raw) as UcfSectionIndex)
		.catch(() => null);
	return indexPromise;
}

export function clearServerUcfSectionIndexCache() {
	indexPromise = null;
}
