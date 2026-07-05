import { json } from "@sveltejs/kit";
import { fetchUcfSubjects } from "$lib/ucf/ucfSources";
import { loadServerUcfSectionIndex } from "$lib/server/ucfSectionIndex";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async () => {
  try {
    const index = await loadServerUcfSectionIndex();
    if (index?.complete && index.departments.length > 0) {
      return json({
        departments: index.departments,
        sourceStatus: `Indexed UCF catalog department list from ${new Date(index.generatedAt).toLocaleDateString()}.`
      });
    }
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
