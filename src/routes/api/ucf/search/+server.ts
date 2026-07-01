import { json } from "@sveltejs/kit";
import { fetchUcfClassSections, searchUcfCatalog } from "$lib/ucfSources";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async ({ url }) => {
  const query = url.searchParams.get("q")?.trim() ?? "";
  const term = url.searchParams.get("term") ?? "Fall 2026";
  const includeSections = url.searchParams.get("sections") === "1";
  const includeDetails = url.searchParams.get("details") === "1";

  if (query.length < 2) {
    return json({ courses: [], sourceStatus: "Enter at least 2 characters." });
  }

  const professorToken = query.match(/@("?)([^"]+)\1/)?.[2]?.trim() ?? "";
  const catalogQuery = query.replace(/@("?)[^"]+\1/g, "").trim();

  if (professorToken && catalogQuery.length < 2) {
    return json({
      courses: [],
      sourceStatus: "Add a UCF department or course before @professor, for example PHY @stolbov, so Knight Planner knows which live sections to inspect."
    });
  }

  try {
    const catalogCourses = await searchUcfCatalog(catalogQuery || query, 10, { includeDetails: includeSections });
    const courses = includeSections
      ? await Promise.all(
          catalogCourses.map(async (course) => ({
            ...course,
            sections: await fetchUcfClassSections(course.code, term, { includeSeatDetails: includeDetails })
          }))
        )
      : catalogCourses;

    return json({
      courses,
      sourceStatus: includeSections ? "Live UCF catalog and myUCF section results." : "Live UCF catalog results. Loading sections..."
    });
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
