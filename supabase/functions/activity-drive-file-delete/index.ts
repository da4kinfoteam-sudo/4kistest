import { deleteActivityFile, errorResponse, handleOptions, jsonResponse, requireAdmin } from "../_shared/googleDrive.ts";

Deno.serve(async (request) => {
  const options = handleOptions(request);
  if (options) return options;

  try {
    const body = await request.json();
    const user = await requireAdmin(request, body.user_id, "Activities");
    const fileRowId = Number(body.file_row_id);

    if (!Number.isFinite(fileRowId)) throw new Error("A valid file row is required.");

    return jsonResponse({
      file: await deleteActivityFile(fileRowId, user)
    });
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "Unable to delete Activity file.", 400);
  }
});
