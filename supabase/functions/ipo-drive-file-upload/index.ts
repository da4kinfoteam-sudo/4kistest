import { errorResponse, handleOptions, jsonResponse, parseDriveUploadSection, requireIpoEditor, uploadIpoFile } from "../_shared/googleDrive.ts";

Deno.serve(async (request) => {
  const options = handleOptions(request);
  if (options) return options;

  try {
    const form = await request.formData();
    const user = await requireIpoEditor(form.get("user_id"));
    const ipoId = Number(form.get("ipo_id"));
    const file = form.get("file");
    const uploadSection = parseDriveUploadSection(form.get("upload_section"));

    if (!Number.isFinite(ipoId)) throw new Error("A valid IPO is required.");
    if (!(file instanceof File)) throw new Error("A file is required.");

    return jsonResponse({ file: await uploadIpoFile(ipoId, file, user, uploadSection) });
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "Unable to upload IPO file.", 400);
  }
});
