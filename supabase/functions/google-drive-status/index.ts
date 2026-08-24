import { errorResponse, getConnectionStatus, handleOptions, jsonResponse, requireUser } from "../_shared/googleDrive.ts";

Deno.serve(async (request) => {
  const options = handleOptions(request);
  if (options) return options;

  try {
    const body = await request.json().catch(() => ({}));
    await requireUser(request, body.user_id);
    return jsonResponse(await getConnectionStatus());
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "Unable to read Google Drive status.", 400);
  }
});
