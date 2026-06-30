import { json } from "@sveltejs/kit";
import { fetchUcfClassSections, searchUcfCatalog } from "$lib/ucfSources";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async ({ url }) => {
  const query = url.searchParams.get("q")?.trim() ?? "";
  const term = url.searchParams.get("term") ?? "Fall 2026";

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
    const catalogCourses = await searchUcfCatalog(query, 10);
    const courses = await Promise.all(
      catalogCourses.map(async (course) => ({
        ...course,
        sections: await fetchUcfClassSections(course.code, term)
      }))
    );

    return json({
      courses,
      sourceStatus: "Live UCF catalog and myUCF section results."
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
