import { json } from "@sveltejs/kit";
import { fetchUcfSubjects } from "$lib/ucf/ucfSources";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async () => {
  try {
    const departments = await fetchUcfSubjects();
    return json({
      departments,
      sourceStatus: departments.length ? "Live UCF catalog department list." : "No departments returned by UCF catalog."
    });
  } catch (error) {
    return json(
      {
        departments: [],
        sourceStatus: error instanceof Error ? error.message : "UCF department source unavailable."
      },
      { status: 502 }
    );
  }
};
