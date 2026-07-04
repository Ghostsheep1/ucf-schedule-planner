import { json } from "@sveltejs/kit";
import { RMP_UCF_SCHOOL_ID } from "$lib/ucf/ucfSources";
import type { RequestHandler } from "./$types";

type RmpTeacher = {
  node?: {
    avgRating?: number;
    numRatings?: number;
    legacyId?: number;
  };
};

export const GET: RequestHandler = async ({ url }) => {
  const name = url.searchParams.get("name")?.trim();
  if (!name) return json({ rating: null });

  try {
    const rmp = await import("ratemyprofessor-api");
    const results = (await rmp.searchProfessorsAtSchoolId(name, RMP_UCF_SCHOOL_ID)) as RmpTeacher[];
    const best = results.find((result) => result.node?.avgRating && result.node.avgRating > 0)?.node;

    return json({
      rating: best?.avgRating ?? null,
      ratingCount: best?.numRatings ?? null,
      url: best?.legacyId ? `https://www.ratemyprofessors.com/professor/${best.legacyId}` : null
    });
  } catch (error) {
    return json({ rating: null, error: error instanceof Error ? error.message : "RMP unavailable" }, { status: 502 });
  }
};
