import { deleteGadPimmeFile, errorResponse, handleOptions, jsonResponse, requireGadPimmeEditor } from "../_shared/googleDrive.ts";

Deno.serve(async (request) => {
  const options = handleOptions(request);
  if (options) return options;
  try {
    const body = await request.json().catch(() => ({}));
    const user = await requireGadPimmeEditor(body.user_id);
    const fileId = Number(body.file_row_id);
    if (!Number.isFinite(fileId)) throw new Error("A valid evidence file is required.");
    return jsonResponse({ file: await deleteGadPimmeFile(fileId, user) });
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "Unable to delete GAD PIMME evidence.", 400);
  }
});

