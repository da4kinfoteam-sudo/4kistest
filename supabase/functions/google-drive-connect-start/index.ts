import { createAuthorizationUrl, errorResponse, handleOptions, jsonResponse, requireSuperAdmin } from "../_shared/googleDrive.ts";

Deno.serve(async (request) => {
  const options = handleOptions(request);
  if (options) return options;

  try {
    const body = await request.json().catch(() => ({}));
    const user = await requireSuperAdmin(request, body.user_id);
    return jsonResponse({ authUrl: await createAuthorizationUrl(user.id) });
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "Unable to start Google Drive connection.", 400);
  }
});
