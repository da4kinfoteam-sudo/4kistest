import { auditDriveAction, disconnectConnection, errorResponse, handleOptions, jsonResponse, requireSuperAdmin } from "../_shared/googleDrive.ts";

Deno.serve(async (request) => {
  const options = handleOptions(request);
  if (options) return options;

  try {
    const body = await request.json().catch(() => ({}));
    const user = await requireSuperAdmin(request, body.user_id);
    await disconnectConnection();
    await auditDriveAction(user, "Settings - Google Drive", "manage_settings", "google_drive_connection", null, null, { operation: "disconnect" });
    return jsonResponse({ message: "Google Drive storage disconnected." });
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "Unable to disconnect Google Drive.", 400);
  }
});
