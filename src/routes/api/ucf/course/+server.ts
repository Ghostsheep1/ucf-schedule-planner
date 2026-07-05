import { json } from "@sveltejs/kit";
import { likelyCourseCode } from "$lib/ucf/ucfSources";
import { loadServerUcfSectionIndex } from "$lib/server/ucfSectionIndex";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async ({ url }) => {
  const course = likelyCourseCode(url.searchParams.get("course") ?? "");

  if (!course) {
    return json({ course: null, sourceStatus: "Enter a UCF course code." }, { status: 400 });
  }

  try {
    const index = await loadServerUcfSectionIndex();
    const indexedCourse = index?.courses.find((item) => item.code === course) ?? null;
    if (indexedCourse) {
      return json({
        course: indexedCourse,
        sourceStatus: `Indexed UCF catalog detail from ${new Date(index?.generatedAt ?? Date.now()).toLocaleDateString()}.`
      });
    }
    return json({ course: null, sourceStatus: "Course is not in the nightly UCF index." });
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
