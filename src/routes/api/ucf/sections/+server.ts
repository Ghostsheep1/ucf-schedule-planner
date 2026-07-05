import { json } from "@sveltejs/kit";
import { likelyCourseCode } from "$lib/ucf/ucfSources";
import { loadServerUcfSectionIndex } from "$lib/server/ucfSectionIndex";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async ({ url }) => {
  const course = likelyCourseCode(url.searchParams.get("course") ?? "");
  const term = url.searchParams.get("term") ?? "Fall 2026";

  if (!course) {
    return json({ sections: [], sourceStatus: "Enter a UCF course code." }, { status: 400 });
  }

  try {
    const index = await loadServerUcfSectionIndex();
    const indexedCourse = index?.term === term
      ? index.courses.find((candidate) => likelyCourseCode(candidate.code) === course)
      : null;

    if (indexedCourse) {
      return json({
        course,
        sections: indexedCourse.sections,
        sourceStatus: `Indexed UCF sections from ${new Date(index?.generatedAt ?? Date.now()).toLocaleDateString()}.`
      });
    }

    return json({ course, sections: [], sourceStatus: "Course is not in the nightly UCF index." });
  } catch (error) {
    return json(
      {
        course,
        sections: [],
        sourceStatus: error instanceof Error ? error.message : "UCF section source unavailable."
      },
      { status: 502 }
    );
  }
};
