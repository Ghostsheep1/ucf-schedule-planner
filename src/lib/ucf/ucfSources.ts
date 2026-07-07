import * as cheerio from "cheerio";
import { formatInstructorName } from "./format";
import type { Campus, Course, DayOfWeek, InstructionMode, Meeting, Section } from "./types";

export const UCF_CATALOG_ID = "66bcc88cf93938001c548373";
export const UCF_CATALOG_REFERER = "https://www.ucf.edu/catalog/undergraduate/";
export const UCF_KUALI_BASE = "https://ucf.kuali.co/api/v1/catalog";
export const UCF_CLASS_SEARCH_URL = "https://csprod-ss.net.ucf.edu/psc/CSPROD/EMPLOYEE/SA/c/COMMUNITY_ACCESS.CLASS_SEARCH.GBL";
export const RMP_UCF_SCHOOL_ID = "U2Nob29sLTEwODI=";

export const ucfAttributeTags = [
  "GEP-Communication Foundation",
  "GEP-Humanities",
  "GEP-Mathematical Foundations",
  "GEP-Natural Sciences Foundation",
  "GEP-Science Foundations",
  "GEP-Social Foundations",
  "State Core Math",
  "State Core Science",
  "State Writing Requirement",
  "Career Foundations",
  "Civic Dialogue",
  "Honors Classes",
  "Service Learning",
  "Undergraduate Research"
];

type KualiSearchResult = {
  __catalogCourseId?: string;
  id: string;
  pid: string;
  title: string;
  description?: string;
  code?: string;
  number?: string;
  subjectCode?: { name?: string; description?: string };
  groupFilter1?: { name?: string };
};

type KualiCourse = KualiSearchResult & {
  prerequisites?: string;
  credits?: { value?: number; credits?: { min?: number; max?: number } };
};

type ParsedPeopleSoftSection = Section & {
  classNumber: string;
  detailAction: string;
};

type SeatDetails = Pick<Section, "seatsAvailable" | "seatsTotal" | "enrollmentTotal" | "waitlistAvailable" | "waitlistTotal" | "waitlistCapacity">;
type SectionFetchOptions = {
  includeSeatDetails?: boolean;
};
type CatalogSearchOptions = {
  includeDetails?: boolean;
};

export type UcfSubject = {
  code: string;
  name: string;
};

export function stripHtml(html = "") {
  return cheerio.load(html).text().replace(/\s+/g, " ").trim();
}

export function splitCourseCode(code: string) {
  const clean = normalizeCourseCode(code);
  const match = clean.match(/^([A-Z]{2,4})([0-9]{4}[A-Z]{0,2})$/);
  return { subject: match?.[1] ?? clean.slice(0, 3), number: match?.[2] ?? clean.slice(3), code: clean };
}

export function normalizeCourseCode(input: string) {
  return input.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function likelyCourseCode(input: string) {
  return normalizeCourseCode(input).match(/^[A-Z]{2,4}[0-9]{4}[A-Z]{0,2}$/)?.[0];
}

export function catalogSearchQueries(input: string) {
  const cleanText = input.trim().replace(/\s+/g, " ");
  const code = likelyCourseCode(input);
  const queries = new Set<string>();
  if (code) {
    const { subject, number } = splitCourseCode(code);
    queries.add(`${subject} ${number}`);
    queries.add(`${subject}${number}`);
    if (/[A-Z]$/.test(number)) {
      const baseNumber = number.replace(/[A-Z]+$/, "");
      queries.add(`${subject} ${baseNumber}`);
      queries.add(`${subject}${baseNumber}`);
    }
  }
  if (cleanText) queries.add(cleanText);
  return [...queries];
}

function isDepartmentOnlyQuery(input: string) {
  return /^[A-Z]{2,4}$/.test(normalizeCourseCode(input));
}

async function kualiFetch<T>(path: string): Promise<T> {
  const response = await fetch(`${UCF_KUALI_BASE}${path}`, {
    headers: {
      accept: "application/json",
      referer: UCF_CATALOG_REFERER,
      "user-agent": "KnightPlanner/0.1 UCF schedule planner"
    }
  });
  if (!response.ok) {
    throw new Error(`UCF Catalog returned ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export async function searchUcfCatalog(query: string, limit = 10, options: CatalogSearchOptions = {}) {
  if (isDepartmentOnlyQuery(query)) {
    const subject = normalizeCourseCode(query);
    const directMatches = await coursesForSubject(subject, limit, options);
    if (directMatches.length > 0) return directMatches;

    const subjects = await fetchUcfSubjects();
    const alias =
      subjects.find((item) => item.code === subject.replace(/S$/, "")) ??
      subjects.find((item) => item.code !== subject && item.name.toUpperCase() === subject) ??
      subjects.find((item) => item.code !== subject && item.name.toUpperCase().startsWith(subject)) ??
      subjects.find((item) => item.code !== subject && item.name.toUpperCase().includes(subject));
    return alias ? coursesForSubject(alias.code, limit, options) : [];
  }

  const seen = new Set<string>();
  const allCourses: Course[] = [];
  for (const searchQuery of catalogSearchQueries(query)) {
    const courses = await searchUcfCatalogOnce(searchQuery, limit, options);
    for (const course of courses) {
      const key = normalizeCourseCode(course.code);
      if (!seen.has(key)) {
        seen.add(key);
        allCourses.push(course);
      }
    }
    if (allCourses.length >= limit) break;
  }
  const code = likelyCourseCode(query);
  if (code) {
    const base = code.replace(/[A-Z]+$/, "");
    const codeFamily = allCourses.filter((course) => normalizeCourseCode(course.code).startsWith(base));
    const sortable = codeFamily.length ? codeFamily : allCourses;
    sortable.sort((a, b) => {
      const aCode = normalizeCourseCode(a.code);
      const bCode = normalizeCourseCode(b.code);
      const aScore = aCode === code ? 0 : aCode === base ? 1 : aCode.startsWith(base) ? 2 : 3;
      const bScore = bCode === code ? 0 : bCode === base ? 1 : bCode.startsWith(base) ? 2 : 3;
      return aScore - bScore || compareCourseCodes(a, b);
    });
    return sortable.slice(0, limit);
  } else {
    allCourses.sort(compareCourseCodes);
  }
  return allCourses.slice(0, limit);
}

export async function fetchUcfProfessorCourses(professorQuery: string, term: string, limit = 30, searchNameHints?: string[]): Promise<Course[]> {
  const name = professorQuery.trim().replace(/^@/, "").replace(/\s+/g, " ");
  if (name.length < 2) return [];

  const first = await peopleSoftFetch(UCF_CLASS_SEARCH_URL);
  const initialHtml = first.html;
  const cookie = first.cookie || parseCookies(readSetCookie(first.response.headers));
  if (!initialHtml.includes("CLASS_SRCH_WRK2_SSR_PB_CLASS_SRCH")) return [];

  const normalizedName = name.toLowerCase();
  const searchNames = (searchNameHints?.length ? searchNameHints : professorSearchNames(name)).slice(0, 4);
  const responses = await Promise.all(
    searchNames.map(async (searchName) => {
    const params = allFormFields(initialHtml);
    params.set("ICAction", "CLASS_SRCH_WRK2_SSR_PB_CLASS_SRCH");
    params.set("ICChanged", "1");
    params.set("CLASS_SRCH_WRK2_INSTITUTION$31$", "UCF01");
    params.set("CLASS_SRCH_WRK2_STRM$35$", termToStrm(term));
    params.set("SSR_CLSRCH_WRK_LAST_NAME$9", searchName);
    params.set("SSR_CLSRCH_WRK_ACAD_CAREER$3", "UGRD");
    params.set("SSR_CLSRCH_WRK_SSR_OPEN_ONLY$chk$6", "N");
    params.delete("SSR_CLSRCH_WRK_SSR_OPEN_ONLY$6");
    params.set("FX_CLSSRCH_DER_FLAG$chk", "Y");
    params.set("FX_CLSSRCH_DER_FLAG", "Y");

    return peopleSoftFetch(UCF_CLASS_SEARCH_URL, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        cookie,
        referer: UCF_CLASS_SEARCH_URL,
        origin: "https://csprod-ss.net.ucf.edu",
        "user-agent": "Mozilla/5.0 KnightPlanner/0.1"
      },
      body: params
    });
    })
  );

  const courseMap = new Map<string, Course>();
  for (const response of responses) {
    for (const course of parsePeopleSoftCourseResults(response.html)) {
      const sections = course.sections.filter((section) => professorNameMatches(section.professorName, normalizedName));
      if (sections.length === 0) continue;
      const existing = courseMap.get(course.code);
      if (!existing) {
        courseMap.set(course.code, { ...course, sections });
      } else {
        const seenSections = new Set(existing.sections.map((section) => section.id));
        existing.sections = [...existing.sections, ...sections.filter((section) => !seenSections.has(section.id))];
      }
    }
  }

  return [...courseMap.values()].slice(0, limit);
}

function professorNameMatches(professorName: string, query: string) {
  const normalizedQuery = query.trim().toLowerCase();
  const fullName = professorName.toLowerCase().replace(/\s+/g, " ");
  if (!normalizedQuery) return true;
  if (normalizedQuery.includes(" ")) return fullName.includes(normalizedQuery);

  const words = fullName.split(/[^a-z]+/).filter(Boolean);
  return words.some((word) => (normalizedQuery.length >= 4 ? word === normalizedQuery : word.startsWith(normalizedQuery)));
}

function professorSearchNames(name: string) {
  const clean = formatInstructorName(name);
  const words = clean.split(/\s+/).filter(Boolean);
  const [first = clean, ...rest] = words;
  const candidates = [clean, words.at(-1) ?? clean, ...rest, first];
  const firstLetter = (words.at(-1) ?? clean).slice(0, 1);
  if (firstLetter) candidates.push(firstLetter);
  return [...new Set(candidates.filter(Boolean))];
}

async function coursesForSubject(subject: string, limit: number, options: CatalogSearchOptions) {
  const catalogCourses = await kualiFetch<KualiCourse[]>(`/courses/${UCF_CATALOG_ID}`);
  const matches = catalogCourses
    .filter((course) => (course.subjectCode?.name ?? splitCourseCode(course.code || course.__catalogCourseId || "").subject).toUpperCase() === subject)
    .sort(compareCourseCodes)
    .slice(0, limit);
  return options.includeDetails ? Promise.all(matches.map((course) => getUcfCatalogCourse(course))) : matches.map(catalogResultToCourse);
}

export async function fetchUcfCatalogCourses(options: CatalogSearchOptions = {}): Promise<Course[]> {
  const catalogCourses = await kualiFetch<KualiCourse[]>(`/courses/${UCF_CATALOG_ID}`);
  const sorted = catalogCourses.sort(compareCourseCodes);
  return options.includeDetails
    ? Promise.all(sorted.map((course) => getUcfCatalogCourse(course)))
    : sorted.map(catalogResultToCourse);
}

function compareCourseCodes(a: { code?: string; __catalogCourseId?: string }, b: { code?: string; __catalogCourseId?: string }) {
  const parse = (code: string) => normalizeCourseCode(code).match(/^([A-Z]+)(\d+)([A-Z]*)$/);
  const aCode = a.code || a.__catalogCourseId || "";
  const bCode = b.code || b.__catalogCourseId || "";
  const aMatch = parse(aCode);
  const bMatch = parse(bCode);
  if (!aMatch || !bMatch) return aCode.localeCompare(bCode);
  return (
    aMatch[1].localeCompare(bMatch[1]) ||
    Number(aMatch[2]) - Number(bMatch[2]) ||
    aMatch[3].localeCompare(bMatch[3])
  );
}

async function searchUcfCatalogOnce(query: string, limit = 10, options: CatalogSearchOptions = {}) {
  const params = new URLSearchParams({
    q: query,
    itemTypes: "courses",
    limit: String(limit),
    skip: "0"
  });
  const results = await kualiFetch<KualiSearchResult[]>(`/search/${UCF_CATALOG_ID}?${params}`);
  return options.includeDetails
    ? Promise.all(results.map((result) => getUcfCatalogCourse(result)))
    : results.map(catalogResultToCourse);
}

function catalogResultToCourse(result: KualiSearchResult | KualiCourse): Course {
  const code = result.code || result.__catalogCourseId || "";
  const credits = "credits" in result ? result.credits?.value ?? result.credits?.credits?.min ?? 0 : 0;
  return {
    id: result.id || result.pid || code,
    code,
    title: result.title,
    credits,
    genEdTags: [],
    description: result.description || "",
    prerequisites: "",
    catalogUrl: `${UCF_CATALOG_REFERER}#/courses/view/${result.id}`,
    scheduleUrl: UCF_CLASS_SEARCH_URL,
    sections: []
  };
}

export async function getUcfCatalogCourse(result: KualiSearchResult): Promise<Course> {
  const detail = await kualiFetch<KualiCourse>(`/course/${UCF_CATALOG_ID}/${result.pid}`);
  const code = detail.code || detail.__catalogCourseId || result.code || result.__catalogCourseId || "";
  return {
    id: detail.id || result.id || code,
    code,
    title: detail.title || result.title,
    credits: detail.credits?.value ?? detail.credits?.credits?.min ?? 0,
    genEdTags: [],
    description: detail.description || result.description || "",
    prerequisites: stripHtml(detail.prerequisites),
    catalogUrl: `${UCF_CATALOG_REFERER}#/courses/view/${detail.id || result.id}`,
    scheduleUrl: UCF_CLASS_SEARCH_URL,
    sections: []
  };
}

export function termToStrm(term: string) {
  const lower = term.toLowerCase();
  const yearMatch = lower.match(/20\d{2}/);
  const year = yearMatch ? Number(yearMatch[0]) : 2026;
  const springCode = (year - 1964) * 30;
  if (lower.includes("spring")) return String(springCode);
  if (lower.includes("summer")) return String(springCode + 10);
  return String(springCode + 20);
}

function parseCookies(setCookie: string[] | null) {
  return (setCookie ?? []).map((cookie) => cookie.split(";")[0]).join("; ");
}

function readSetCookie(headers: Headers) {
  const getSetCookie = (headers as Headers & { getSetCookie?: () => string[] }).getSetCookie;
  if (getSetCookie) return getSetCookie.call(headers);
  const single = headers.get("set-cookie");
  return single ? [single] : [];
}

function mergeCookies(cookie: string, setCookie: string[]) {
  const jar = new Map<string, string>();
  cookie
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .forEach((part) => {
      const [name, ...value] = part.split("=");
      jar.set(name, value.join("="));
    });
  setCookie.forEach((header) => {
    const [pair] = header.split(";");
    const [name, ...value] = pair.split("=");
    if (name) jar.set(name, value.join("="));
  });
  return [...jar.entries()].map(([name, value]) => `${name}=${value}`).join("; ");
}

async function peopleSoftFetch(url: string, init: RequestInit = {}) {
  let currentUrl = url;
  const initialHeaders = new Headers(init.headers);
  let cookie = initialHeaders.get("cookie") ?? "";
  let currentInit: RequestInit = { ...init, redirect: "manual" };

  for (let redirectCount = 0; redirectCount < 8; redirectCount += 1) {
    const headers = new Headers(currentInit.headers);
    headers.set("user-agent", headers.get("user-agent") ?? "Mozilla/5.0 KnightPlanner/0.1");
    headers.set("accept", headers.get("accept") ?? "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8");
    if (cookie) headers.set("cookie", cookie);

    const response = await fetch(currentUrl, { ...currentInit, headers, redirect: "manual", cache: "no-store" });
    cookie = mergeCookies(cookie, readSetCookie(response.headers));

    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      if (!location) return { response, html: await response.text(), cookie };
      currentUrl = new URL(location, currentUrl).href;
      currentInit = { method: "GET", headers: { cookie } };
      continue;
    }

    return { response, html: await response.text(), cookie };
  }

  throw new Error("UCF class search redirected too many times");
}

function allFormFields(html: string) {
  const $ = cheerio.load(html);
  const params = new URLSearchParams();
  $("input, select, textarea").each((_, element) => {
    const el = $(element);
    const name = el.attr("name");
    if (!name) return;
    const type = (el.attr("type") ?? "").toLowerCase();
    if (["button", "submit", "reset"].includes(type)) return;
    if (type === "checkbox" && el.attr("checked") === undefined) return;
    let value = el.attr("value") ?? "";
    if (element.tagName === "select") {
      value = el.find("option[selected]").attr("value") ?? el.find("option").first().attr("value") ?? "";
    }
    params.append(name, value);
  });
  return params;
}

export async function fetchUcfSubjects(): Promise<UcfSubject[]> {
  const catalogCourses = await kualiFetch<KualiCourse[]>(`/courses/${UCF_CATALOG_ID}`);
  const catalogSubjects = subjectListFromCourses(catalogCourses);
  if (catalogSubjects.length) return catalogSubjects;

  const first = await peopleSoftFetch(UCF_CLASS_SEARCH_URL);
  const $ = cheerio.load(first.html);
  const subjects = new Map<string, string>();

  $("select").each((_, select) => {
    const selectElement = $(select);
    const selectKey = `${selectElement.attr("name") ?? ""} ${selectElement.attr("id") ?? ""}`.toUpperCase();
    if (!selectKey.includes("SUBJECT")) return;

    selectElement.find("option").each((__, element) => {
      const option = $(element);
      const value = (option.attr("value") ?? "").trim().toUpperCase();
      const label = option.text().replace(/\s+/g, " ").trim();
      if (!/^[A-Z]{2,4}$/.test(value) || !label || /^select/i.test(label)) return;

      const name = cleanSubjectName(value, label);
      subjects.set(value, name || value);
    });
  });

  return [...subjects.entries()]
    .map(([code, name]) => ({ code, name }))
    .sort((a, b) => a.code.localeCompare(b.code));
}

function subjectListFromCourses(courses: KualiCourse[]) {
  const subjects = new Map<string, string>();
  courses.forEach((course) => {
    const code = course.subjectCode?.name?.trim().toUpperCase();
    const description = course.subjectCode?.description?.trim() ?? "";
    if (!code || !/^[A-Z]{2,4}$/.test(code)) return;
    subjects.set(code, cleanSubjectName(code, description || code));
  });
  return [...subjects.entries()]
    .map(([code, name]) => ({ code, name }))
    .sort((a, b) => a.code.localeCompare(b.code));
}

function cleanSubjectName(code: string, label: string) {
  return label
    .replace(new RegExp(`^${code}\\s*[-–:]?\\s*`, "i"), "")
    .replace(/\s*\([^)]*\)\s*$/g, "")
    .trim();
}

export async function fetchUcfClassSections(courseCode: string, term: string, options: SectionFetchOptions = {}): Promise<Section[]> {
  const first = await peopleSoftFetch(UCF_CLASS_SEARCH_URL);
  const initialHtml = first.html;
  const cookie = first.cookie || parseCookies(readSetCookie(first.response.headers));
  if (!initialHtml.includes("CLASS_SRCH_WRK2_SSR_PB_CLASS_SRCH")) return [];

  const { subject, number } = splitCourseCode(courseCode);
  const params = allFormFields(initialHtml);
  params.set("ICAction", "CLASS_SRCH_WRK2_SSR_PB_CLASS_SRCH");
  params.set("ICChanged", "1");
  params.set("CLASS_SRCH_WRK2_INSTITUTION$31$", "UCF01");
  params.set("CLASS_SRCH_WRK2_STRM$35$", termToStrm(term));
  params.set("SSR_CLSRCH_WRK_SUBJECT$0", subject);
  params.set("SSR_CLSRCH_WRK_SSR_EXACT_MATCH1$1", "E");
  params.set("SSR_CLSRCH_WRK_CATALOG_NBR$1", number);
  params.set("SSR_CLSRCH_WRK_ACAD_CAREER$3", "UGRD");
  params.set("SSR_CLSRCH_WRK_SSR_OPEN_ONLY$chk$6", "N");
  params.delete("SSR_CLSRCH_WRK_SSR_OPEN_ONLY$6");
  params.set("FX_CLSSRCH_DER_FLAG$chk", "Y");
  params.set("FX_CLSSRCH_DER_FLAG", "Y");

  const response = await peopleSoftFetch(UCF_CLASS_SEARCH_URL, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      cookie,
      referer: UCF_CLASS_SEARCH_URL,
      origin: "https://csprod-ss.net.ucf.edu",
      "user-agent": "Mozilla/5.0 KnightPlanner/0.1"
    },
    body: params
  });
  const parsedSections = parsePeopleSoftSectionRows(response.html, courseCode);
  if (!options.includeSeatDetails) {
    return parsedSections.map(toPublicSection);
  }
  const seatDetails = await fetchSeatDetailsForSections(response.html, response.cookie, parsedSections);
  return parsedSections.map((section) => {
    const details = seatDetails.get(section.classNumber);
    const publicSection = toPublicSection(section);
    return details ? { ...publicSection, ...details, seatDetailsStatus: "live" } : { ...publicSection, seatDetailsStatus: "unavailable" };
  });
}

export function parsePeopleSoftSections(html: string, courseCode: string): Section[] {
  return parsePeopleSoftSectionRows(html, courseCode).map(toPublicSection);
}

function toPublicSection(section: ParsedPeopleSoftSection): Section {
  return {
    id: section.id,
    sectionNumber: section.sectionNumber,
    professorName: section.professorName,
    professorRating: section.professorRating,
    professorRatingCount: section.professorRatingCount,
    professorRatingUrl: section.professorRatingUrl,
    seatsAvailable: section.seatsAvailable,
    seatsTotal: section.seatsTotal,
    enrollmentTotal: section.enrollmentTotal,
    waitlistAvailable: section.waitlistAvailable,
    waitlistTotal: section.waitlistTotal,
    waitlistCapacity: section.waitlistCapacity,
    seatDetailsStatus: section.seatDetailsStatus,
    mode: section.mode,
    campus: section.campus,
    meetings: section.meetings
  };
}

function parsePeopleSoftSectionRows(html: string, courseCode: string): ParsedPeopleSoftSection[] {
  const $ = cheerio.load(html);
  const text = $.text();
  if (!/Search Results|Class Section|Meeting Dates|Instructor/i.test(text)) return [];

  const sectionRows = $("[id^='win0divSSR_CLSRSLT_WRK_GROUPBOX3$']").toArray();
  if (sectionRows.length === 0) return [];

  return sectionRows.map((row, fallbackIndex) => parsePeopleSoftSectionRow($, row, courseCode, fallbackIndex));
}

function parsePeopleSoftCourseResults(html: string): Course[] {
  const $ = cheerio.load(html);
  return $("[id^='win0divSSR_CLSRSLT_WRK_GROUPBOX2$']")
    .toArray()
    .flatMap((group, groupIndex) => {
      const header =
        $(group).find(`[id='win0divSSR_CLSRSLT_WRK_GROUPBOX2GP$${groupIndex}']`).first().text().replace(/\s+/g, " ").trim() ||
        $(group).text().replace(/\s+/g, " ").trim();
      const match = header.match(/\b([A-Z]{2,4})\s+([0-9]{4}[A-Z]?)\s+-\s+(.+?)(?:\s+Class\s+Section|\s*$)/);
      if (!match) return [];

      const code = `${match[1]}${match[2]}`;
      const sections = $(group)
        .find("[id^='win0divSSR_CLSRSLT_WRK_GROUPBOX3$']")
        .toArray()
        .map((row, fallbackIndex) => parsePeopleSoftSectionRow($, row, code, fallbackIndex));

      return [
        {
          id: code,
          code,
          title: match[3].trim(),
          credits: 0,
          genEdTags: [],
          description: "",
          prerequisites: "",
          catalogUrl: UCF_CATALOG_REFERER,
          scheduleUrl: UCF_CLASS_SEARCH_URL,
          sections
        }
      ];
    });
}

function parsePeopleSoftSectionRow($: cheerio.CheerioAPI, row: Parameters<cheerio.CheerioAPI>[0], courseCode: string, fallbackIndex: number): ParsedPeopleSoftSection {
  const rowId = $(row).attr("id") ?? "";
  const rowIndex = rowId.match(/\$(\d+)$/)?.[1] ?? String(fallbackIndex);
  const field = (id: string) => $(row).find(`[id='${id}$${rowIndex}']`).first().text().replace(/\s+/g, " ").trim();
  const detailAction = $(row).find(`[id='MTG_CLASS_NBR$${rowIndex}']`).attr("id") || `MTG_CLASS_NBR$${rowIndex}`;
  const classNumber = field("MTG_CLASS_NBR");
  const rowText = $(row).text().replace(/\s+/g, " ").trim();
  const sectionLabel = field("MTG_CLASSNAME") || rowText;
  const sectionNumber = sectionLabel.match(/\b([A-Z0-9]+)-(LEC|LAB|DIS|SEM|IND|CLN|RSC)\b/i)?.[1] ?? String(fallbackIndex + 1).padStart(4, "0");
  const professorName = formatInstructorName(field("MTG_INSTR") || "TBA");
  const room = field("MTG_ROOM");
  const meetings = parseMeetingText(rowText);
  if (room && meetings.length > 0) {
    const rooms = room.match(/[A-Z0-9]{2,5}\s+[O0-9A-Z-]{2,}/g) ?? [room];
    meetings.forEach((meeting, index) => {
      const [building, ...roomParts] = (rooms[index] ?? rooms[0]).split(/\s+/);
      meeting.building = building;
      meeting.room = roomParts.join(" ");
    });
  }
  return {
    id: `${courseCode}-${classNumber || sectionNumber}`,
    classNumber,
    detailAction,
    sectionNumber,
    professorName,
    seatsAvailable: 0,
    seatsTotal: 0,
    seatDetailsStatus: "loading",
    mode: inferMode(field("INSTRUCT_MODE_DESCR") || rowText),
    campus: inferCampus(rowText),
    meetings
  };
}

async function fetchSeatDetailsForSections(html: string, cookie: string, sections: ParsedPeopleSoftSection[]) {
  const details = new Map<string, SeatDetails>();
  const chunkSize = 10;

  for (let index = 0; index < sections.length; index += chunkSize) {
    const chunk = sections.slice(index, index + chunkSize);
    const chunkDetails = await Promise.all(
      chunk.map(async (section) => {
        if (!section.classNumber || !section.detailAction) return null;
        try {
          const params = allFormFields(html);
          params.set("ICAction", section.detailAction);
          params.set("ICChanged", "-1");
          const response = await peopleSoftFetch(UCF_CLASS_SEARCH_URL, {
            method: "POST",
            headers: {
              "content-type": "application/x-www-form-urlencoded",
              cookie,
              referer: UCF_CLASS_SEARCH_URL,
              origin: "https://csprod-ss.net.ucf.edu",
              "user-agent": "Mozilla/5.0 KnightPlanner/0.1"
            },
            body: params,
            signal: AbortSignal.timeout(12000)
          });
          return [section.classNumber, parseSeatDetails(response.html)] as const;
        } catch {
          return null;
        }
      })
    );
    chunkDetails.forEach((detail) => {
      if (detail) details.set(detail[0], detail[1]);
    });
  }

  return details;
}

export function parseSeatDetails(html: string): SeatDetails {
  const $ = cheerio.load(html);
  const numberField = (id: string) => {
    const value = $(`#${id}`).first().text().replace(/\s+/g, " ").trim();
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  };
  const seatsTotal = numberField("SSR_CLS_DTL_WRK_ENRL_CAP") ?? 0;
  const enrollmentTotal = numberField("SSR_CLS_DTL_WRK_ENRL_TOT");
  const rawWaitlistCapacity = numberField("SSR_CLS_DTL_WRK_WAIT_CAP");
  const waitlistTotal = numberField("SSR_CLS_DTL_WRK_WAIT_TOT");
  const waitlistCapacity =
    rawWaitlistCapacity !== undefined && rawWaitlistCapacity < 1000 ? rawWaitlistCapacity : undefined;
  const seatsAvailable = numberField("SSR_CLS_DTL_WRK_AVAILABLE_SEATS") ?? Math.max(0, seatsTotal - (enrollmentTotal ?? seatsTotal));
  return {
    seatsAvailable,
    seatsTotal,
    enrollmentTotal,
    waitlistCapacity,
    waitlistTotal,
    waitlistAvailable: waitlistCapacity !== undefined && waitlistTotal !== undefined ? Math.max(0, waitlistCapacity - waitlistTotal) : undefined
  };
}

function inferMode(text: string): InstructionMode {
  if (/online|web/i.test(text)) return "online";
  if (/mixed|hybrid|blendflex/i.test(text)) return "hybrid";
  return "in-person";
}

function inferCampus(text: string): Campus {
  if (/online|web/i.test(text)) return "Online";
  if (/downtown/i.test(text)) return "Downtown";
  if (/rosen/i.test(text)) return "Rosen";
  return "Main";
}

function parseMeetingText(text: string): Meeting[] {
  const dayMap: Record<string, DayOfWeek> = { Mo: "M", Tu: "Tu", We: "W", Th: "Th", Fr: "F", Sa: "Sa", Su: "Su" };
  const matches = [...text.matchAll(/\b(Mo|Tu|We|Th|Fr|Sa|Su)+\b.*?(\d{1,2}:\d{2})(AM|PM)\s*-\s*(\d{1,2}:\d{2})(AM|PM)/gi)];
  const meetings = matches.flatMap((match) => {
    const days = match[0].match(/Mo|Tu|We|Th|Fr|Sa|Su/g) ?? [];
    return days.map((day) => ({
      dayOfWeek: dayMap[day],
      startTime: to24Hour(match[2], match[3]),
      endTime: to24Hour(match[4], match[5]),
      building: text.match(/\b([A-Z]{2,5})\s+([0-9A-Z-]{2,})\b/)?.[1],
      room: text.match(/\b([A-Z]{2,5})\s+([0-9A-Z-]{2,})\b/)?.[2]
    }));
  });
  return meetings.length > 0 ? meetings : [{ dayOfWeek: "Online", startTime: "", endTime: "", building: "TBA" }];
}

function to24Hour(time: string, suffix: string) {
  const [hourText, minute] = time.split(":");
  let hour = Number(hourText);
  if (suffix.toUpperCase() === "PM" && hour !== 12) hour += 12;
  if (suffix.toUpperCase() === "AM" && hour === 12) hour = 0;
  return `${String(hour).padStart(2, "0")}:${minute}`;
}
