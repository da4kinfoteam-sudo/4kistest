import { errorResponse, handleOptions, jsonResponse, listSubprojectFiles, requireUser } from "../_shared/googleDrive.ts";

Deno.serve(async (request) => {
  const options = handleOptions(request);
  if (options) return options;

  try {
    const body = await request.json().catch(() => ({}));
    const user = await requireUser(request, body.user_id, "Subprojects");
    const subprojectId = Number(body.subproject_id);
    if (!Number.isFinite(subprojectId)) throw new Error("A valid subproject is required.");
    return jsonResponse({ files: await listSubprojectFiles(subprojectId, user) });
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "Unable to list Subproject files.", 400);
  }
});
