import { json } from "@sveltejs/kit";
import { cached } from "$lib/server/cache";
import { loadServerUcfSectionIndex } from "$lib/server/ucfSectionIndex";
import { searchIndexedCourses } from "$lib/ucf/sectionIndex";
import type { Course } from "$lib/ucf/types";
import type { RequestHandler } from "./$types";

const tenMinutes = 10 * 60 * 1000;

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
      `index-search:${query}:${term}:${includeSections}:${includeDetails}:${requestedLimit}`,
      tenMinutes,
      async (): Promise<{ courses: Course[]; sourceStatus: string }> => {
    const index = await loadServerUcfSectionIndex();
    if (index?.term === term && index.courses.length > 0) {
      const indexedLimit = requestedLimit || (/^[A-Za-z]{2,5}\s*$/.test(catalogQuery || query) ? 80 : 40);
      const indexedCourses = searchIndexedCourses(index.courses, catalogQuery, indexedLimit, professorToken);
      if (indexedCourses.length > 0 || professorToken || catalogQuery) {
        return {
          courses: includeSections ? indexedCourses : indexedCourses.map((course) => ({ ...course, sections: [] })),
          sourceStatus: `Indexed UCF sections from ${new Date(index.generatedAt).toLocaleDateString()}.`
        };
      }
    }

    return {
      courses: [],
      sourceStatus: "Nightly UCF index is unavailable or has no matches."
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
