import { errorResponse, handleOptions, jsonResponse, requireIpoEditor, updateIpoFileMetadata } from "../_shared/googleDrive.ts";

Deno.serve(async (request) => {
  const options = handleOptions(request);
  if (options) return options;

  try {
    const body = await request.json().catch(() => ({}));
    const user = await requireIpoEditor(body.user_id);
    const fileRowId = Number(body.file_row_id);
    if (!Number.isFinite(fileRowId)) throw new Error("A valid Gallery image is required.");
    return jsonResponse({
      file: await updateIpoFileMetadata(fileRowId, body.display_name, body.caption, user)
    });
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "Unable to update Gallery image.", 400);
  }
});
