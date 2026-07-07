import type { Section } from '@jupiterp/jupiterp';

export type InstructionMode = 'in-person' | 'online' | 'hybrid';

export interface PlannerSectionExtras {
	mode?: InstructionMode;
	campus?: string;
	component?: string;
	components?: string[];
	waitlistCapacity?: number;
	waitlistAvailable?: number;
}

export type PlannerSection = Section & PlannerSectionExtras;

export function sectionMode(section: Section): InstructionMode {
	const extra = section as PlannerSection;
	if (extra.mode === 'online' || extra.mode === 'hybrid' || extra.mode === 'in-person') {
		return extra.mode;
	}
	const hasOnline = section.meetings.some((meeting) => meeting === 'OnlineAsync');
	const hasTimed = section.meetings.some((meeting) => typeof meeting !== 'string');
	if (hasOnline && hasTimed) return 'hybrid';
	if (hasOnline) return 'online';
	return 'in-person';
}

export function sectionMatchesModes(section: Section, modes: readonly string[] | undefined): boolean {
	if (!modes || modes.length === 0) return true;
	return modes.includes(sectionMode(section));
}

export function sectionHasWaitlist(section: Section): boolean {
	const extra = section as PlannerSection;
	return (extra.waitlistCapacity ?? 0) > 0 || section.waitlist > 0;
}

export function sectionMatchesAvailability(
	section: Section,
	onlyOpen: boolean,
	maxWaitlist: number | null | undefined
): boolean {
	if (section.openSeats > 0) return true;
	const hasMaxWaitlist = maxWaitlist !== null && maxWaitlist !== undefined;
	if (hasMaxWaitlist && sectionHasWaitlist(section)) {
		return section.waitlist <= maxWaitlist;
	}
	return !onlyOpen && !hasMaxWaitlist;
}
