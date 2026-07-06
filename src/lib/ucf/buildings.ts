const UCF_LOCATION_BASE = 'https://www.ucf.edu/location/';

const LOCATION_SLUG_BY_BUILDING: Record<string, string> = {
	BA1: 'business-administration-i',
	BA2: 'business-administration-ii',
	BHC: 'burnett-honors-college',
	BIO: 'biological-sciences-building',
	CB1: 'classroom-building-i',
	CB2: 'classroom-building-ii',
	CHEM: 'chemistry-building',
	CMMS: 'barbara-ying-center-cmms',
	DPAC: 'performing-arts-center',
	ENG1: 'engineering-i',
	ENG2: 'engineering-ii',
	HEC: 'l3harris-engineering-center',
	HS1: 'health-sciences-i',
	HS2: 'health-sciences-ii',
	MSB: 'mathematical-sciences-building',
	NSC: 'nicholson-school-of-communication-and-media',
	PAC: 'performing-arts-center',
	PSY: 'psychology-building',
	RSH: 'research-i',
	TA: 'teaching-academy',
	TCH: 'trevor-colbourn-hall',
	VAB: 'visual-arts-building'
};

export function ucfBuildingUrl(building: string): string {
	const normalized = building.trim().toUpperCase();
	const slug = LOCATION_SLUG_BY_BUILDING[normalized];
	if (slug) return `${UCF_LOCATION_BASE}${slug}/`;
	return `https://map.ucf.edu/?show=${encodeURIComponent(building)}`;
}

export function isUcfBuilding(building: string): boolean {
	const normalized = building.trim().toUpperCase();
	return Boolean(normalized && !/^(TBA|ONLINE|ONLINEASYNC|ONLINESYNC)$/.test(normalized));
}
