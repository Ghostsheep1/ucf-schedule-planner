import { NextRequest, NextResponse } from "next/server";
import { searchUcfCatalog, fetchUcfClassSections } from "@/lib/ucfSources";

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  const term = request.nextUrl.searchParams.get("term") ?? "Fall 2026";
  if (query.length < 2) {
    return NextResponse.json({ courses: [], sourceStatus: "Enter at least 2 characters." });
  }
  if (query.startsWith("@")) {
    return NextResponse.json({
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
    return NextResponse.json({
      courses,
      sourceStatus: "Live UCF catalog and myUCF section results."
    });
  } catch (error) {
    return NextResponse.json(
      {
        courses: [],
        sourceStatus: error instanceof Error ? error.message : "UCF source unavailable."
      },
      { status: 502 }
    );
  }
}
