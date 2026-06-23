import { NextRequest, NextResponse } from "next/server";
import { RMP_UCF_SCHOOL_ID } from "@/lib/ucfSources";

type RmpTeacher = {
  node?: {
    avgRating?: number;
    numRatings?: number;
    legacyId?: number;
    firstName?: string;
    lastName?: string;
  };
};

export async function GET(request: NextRequest) {
  const name = request.nextUrl.searchParams.get("name")?.trim();
  if (!name) return NextResponse.json({ rating: null });

  try {
    const rmp = await import("ratemyprofessor-api");
    const results = (await rmp.searchProfessorsAtSchoolId(name, RMP_UCF_SCHOOL_ID)) as RmpTeacher[];
    const best = results.find((result) => result.node?.avgRating && result.node.avgRating > 0)?.node;
    return NextResponse.json({
      rating: best?.avgRating ?? null,
      ratingCount: best?.numRatings ?? null,
      url: best?.legacyId ? `https://www.ratemyprofessors.com/professor/${best.legacyId}` : null
    });
  } catch (error) {
    return NextResponse.json({ rating: null, error: error instanceof Error ? error.message : "RMP unavailable" }, { status: 502 });
  }
}
