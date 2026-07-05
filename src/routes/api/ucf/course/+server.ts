import { json } from "@sveltejs/kit";
import { likelyCourseCode, searchUcfCatalog } from "$lib/ucf/ucfSources";
import { cached } from "$lib/server/cache";
import { loadServerUcfSectionIndex } from "$lib/server/ucfSectionIndex";
import type { RequestHandler } from "./$types";

const thirtyMinutes = 30 * 60 * 1000;

export const GET: RequestHandler = async ({ url }) => {
  const course = likelyCourseCode(url.searchParams.get("course") ?? "");

  if (!course) {
    return json({ course: null, sourceStatus: "Enter a UCF course code." }, { status: 400 });
  }

  try {
    const index = await loadServerUcfSectionIndex();
    const indexedCourse = index?.complete ? index.courses.find((item) => item.code === course) : null;
    if (indexedCourse) {
      return json({
        course: indexedCourse,
        sourceStatus: `Indexed UCF catalog detail from ${new Date(index?.generatedAt ?? Date.now()).toLocaleDateString()}.`
      });
    }
    const [detail] = await cached(`course:${course}`, thirtyMinutes, () => searchUcfCatalog(course, 1, { includeDetails: true }));
    return json({ course: detail ?? null, sourceStatus: detail ? "Live UCF catalog detail." : "Course not found." });
  } catch (error) {
    return json(
      {
        course: null,
        sourceStatus: error instanceof Error ? error.message : "UCF catalog detail unavailable."
      },
      { status: 502 }
    );
  }
};
