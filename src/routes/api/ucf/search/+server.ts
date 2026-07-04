import { json } from "@sveltejs/kit";
import { RMP_UCF_SCHOOL_ID, fetchUcfClassSections, fetchUcfProfessorCourses, searchUcfCatalog } from "$lib/ucf/ucfSources";
import { cached } from "$lib/server/cache";
import type { Course } from "$lib/ucf/types";
import type { RequestHandler } from "./$types";

const tenMinutes = 10 * 60 * 1000;

type RmpTeacher = {
  node?: {
    firstName?: string;
    lastName?: string;
  };
};

type ExpandedProfessorName = {
  fullName: string;
  searchHints: string[];
};

export const GET: RequestHandler = async ({ url }) => {
  const query = url.searchParams.get("q")?.trim() ?? "";
  const term = url.searchParams.get("term") ?? "Fall 2026";
  const includeSections = url.searchParams.get("sections") === "1";
  const includeDetails = url.searchParams.get("details") === "1";
  const requestedLimit = Number(url.searchParams.get("limit") ?? "0");

  if (query.length < 2) {
    return json({ courses: [], sourceStatus: "Enter at least 2 characters." });
  }

  const professorToken = query.match(/@("?)([^"]+)\1/)?.[2]?.trim() ?? "";
  const catalogQuery = query.replace(/@("?)[^"]+\1/g, "").trim();

  try {
    const payload = await cached(
      `search:${query}:${term}:${includeSections}:${includeDetails}:${requestedLimit}`,
      tenMinutes,
      async (): Promise<{ courses: Course[]; sourceStatus: string }> => {
    if (professorToken && catalogQuery.length < 2) {
      const courses = await fetchUcfProfessorCoursesWithFallbacks(professorToken, term, requestedLimit || 40);
      return {
        courses,
        sourceStatus: courses.length ? `Live myUCF sections matching @${professorToken}.` : `No live myUCF sections found for @${professorToken}.`
      };
    }

    const catalogOnly = catalogQuery || query;
    const limit = requestedLimit || (/^[A-Za-z]{2,5}\s*$/.test(catalogOnly) ? 80 : 20);
    const catalogCourses = await searchUcfCatalog(catalogOnly, limit, { includeDetails: includeSections });
    const courses = includeSections
      ? await Promise.all(
          catalogCourses.map(async (course) => ({
            ...course,
            sections: await fetchUcfClassSections(course.code, term, { includeSeatDetails: includeDetails })
          }))
        )
      : catalogCourses;

    return {
      courses,
      sourceStatus: includeSections ? "Live UCF catalog and myUCF section results." : "Live UCF catalog results. Loading sections..."
    };
      }
    );
    return json(payload);
  } catch (error) {
    return json(
      {
        courses: [],
        sourceStatus: error instanceof Error ? error.message : "UCF source unavailable."
      },
      { status: 502 }
    );
  }
};

async function fetchUcfProfessorCoursesWithFallbacks(professorToken: string, term: string, limit: number) {
  const expandedNamesPromise = expandProfessorNames(professorToken);
  const directPromise = fetchUcfProfessorCourses(professorToken, term, limit);
  const expandedResultsPromise = expandedNamesPromise.then((expandedNames) =>
    Promise.all(expandedNames.map((expandedName) => fetchUcfProfessorCourses(expandedName.fullName, term, limit, expandedName.searchHints)))
  );
  const direct = await directPromise;
  if (direct.length > 0) return direct;

  const expandedResults = await expandedResultsPromise;
  return expandedResults.find((courses) => courses.length > 0) ?? [];
}

async function expandProfessorNames(professorToken: string) {
  try {
    const rmp = await import("ratemyprofessor-api");
    const results = (await rmp.searchProfessorsAtSchoolId(professorToken, RMP_UCF_SCHOOL_ID)) as RmpTeacher[];
    return results
      .map((result) => {
        const firstName = result.node?.firstName?.trim() ?? "";
        const lastName = result.node?.lastName?.trim() ?? "";
        const lastWords = lastName.split(/\s+/).filter(Boolean);
        return {
          fullName: [firstName, lastName].filter(Boolean).join(" ").trim(),
          searchHints: [...new Set([lastName, ...lastWords].filter(Boolean))]
        };
      })
      .filter((result) => result.fullName)
      .slice(0, 3);
  } catch {
    // RMP is only used as a name-expansion fallback; direct UCF results remain authoritative.
    return [];
  }
}
