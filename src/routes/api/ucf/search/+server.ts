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

  if (query.startsWith("@")) {
    return json({
      courses: [],
      sourceStatus: "Professor search works inside returned myUCF section rows. Search a course or department with @professor to narrow live sections."
    });
  }

  try {
    const catalogCourses = await searchUcfCatalog(query, 10, { includeDetails: includeSections });
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
