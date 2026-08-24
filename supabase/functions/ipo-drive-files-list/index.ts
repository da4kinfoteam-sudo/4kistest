import { errorResponse, handleOptions, jsonResponse, listIpoFiles, requireUser } from "../_shared/googleDrive.ts";

Deno.serve(async (request) => {
  const options = handleOptions(request);
  if (options) return options;

  try {
    const body = await request.json().catch(() => ({}));
    const user = await requireUser(request, body.user_id, "IPO Management");
    const ipoId = Number(body.ipo_id);
    if (!Number.isFinite(ipoId)) throw new Error("A valid IPO is required.");
    return jsonResponse({ files: await listIpoFiles(ipoId, user) });
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "Unable to list IPO files.", 400);
  }
});
