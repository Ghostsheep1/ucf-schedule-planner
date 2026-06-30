import { json } from "@sveltejs/kit";
import { fetchUcfClassSections, likelyCourseCode } from "$lib/ucfSources";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async ({ url }) => {
  const course = likelyCourseCode(url.searchParams.get("course") ?? "");
  const term = url.searchParams.get("term") ?? "Fall 2026";
  const details = url.searchParams.get("details") === "1";

  if (!course) {
    return json({ sections: [], sourceStatus: "Enter a UCF course code." }, { status: 400 });
  }

  try {
    const sections = await fetchUcfClassSections(course, term, { includeSeatDetails: details });
    return json({
      course,
      sections,
      sourceStatus: details ? "Live myUCF seat and waitlist details." : "Live myUCF section rows."
    });
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
