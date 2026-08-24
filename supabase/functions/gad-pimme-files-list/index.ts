import { errorResponse, handleOptions, jsonResponse, listGadPimmeFiles, requireGadPimmeViewer } from "../_shared/googleDrive.ts";

Deno.serve(async (request) => {
  const options = handleOptions(request);
  if (options) return options;
  try {
    const body = await request.json().catch(() => ({}));
    const user = await requireGadPimmeViewer(body.user_id);
    return jsonResponse({ files: await listGadPimmeFiles(body.operating_unit, body.year, body.question_key, user) });
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "Unable to list GAD PIMME evidence files.", 400);
  }
});
