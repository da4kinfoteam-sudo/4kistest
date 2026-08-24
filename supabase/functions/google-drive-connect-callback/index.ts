import { auditDriveAction, completeConnection, readSignedState, requireDriveManagerFromSignedState, settingsRedirectUrl } from "../_shared/googleDrive.ts";

Deno.serve(async (request) => {
  try {
    const url = new URL(request.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const googleError = url.searchParams.get("error");

    if (googleError) {
      return Response.redirect(settingsRedirectUrl("error", googleError), 302);
    }
    if (!code || !state) {
      return Response.redirect(settingsRedirectUrl("error", "Google Drive callback is missing code or state."), 302);
    }

    const parsedState = await readSignedState(state);
    const user = await requireDriveManagerFromSignedState(parsedState.userId);
    await completeConnection(code, user.id);
    await auditDriveAction(user, "Settings - Google Drive", "manage_settings", "google_drive_connection", null, null, { operation: "connect" });
    return Response.redirect(settingsRedirectUrl("connected"), 302);
  } catch (error) {
    return Response.redirect(
      settingsRedirectUrl("error", error instanceof Error ? error.message : "Unable to complete Google Drive connection."),
      302
    );
  }
});
