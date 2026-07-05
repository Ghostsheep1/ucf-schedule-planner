import { json } from "@sveltejs/kit";
import { loadServerUcfSectionIndex } from "$lib/server/ucfSectionIndex";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async ({ url }) => {
  const name = url.searchParams.get("name")?.trim();
  if (!name) return json({ rating: null });

  try {
    const index = await loadServerUcfSectionIndex();
    const normalized = normalizeInstructor(name);
    const instructor = index?.instructors?.find((candidate) => normalizeInstructor(candidate.name) === normalized);

    return json({
      rating: instructor?.average_rating ? Number(instructor.average_rating) : null,
      ratingCount: instructor?.rating_count ?? null,
      url: instructor?.slug ? `https://www.ratemyprofessors.com/professor/${instructor.slug}` : null
    });
  } catch (error) {
    return json({ rating: null, error: error instanceof Error ? error.message : "Nightly rating index unavailable" }, { status: 502 });
  }
};

function normalizeInstructor(name: string) {
  return name.toLowerCase().replace(/[^a-z]+/g, " ").replace(/\s+/g, " ").trim();
}
