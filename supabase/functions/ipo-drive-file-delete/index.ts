import { deleteIpoFile, errorResponse, handleOptions, jsonResponse, requireAdmin } from "../_shared/googleDrive.ts";

Deno.serve(async (request) => {
  const options = handleOptions(request);
  if (options) return options;

  try {
    const body = await request.json().catch(() => ({}));
    const user = await requireAdmin(request, body.user_id, "IPO Management");
    const fileId = Number(body.file_row_id);
    if (!Number.isFinite(fileId)) throw new Error("A valid file is required.");
    return jsonResponse({ file: await deleteIpoFile(fileId, user) });
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "Unable to delete IPO file.", 400);
  }
});
