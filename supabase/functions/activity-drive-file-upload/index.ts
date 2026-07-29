import { errorResponse, handleOptions, jsonResponse, parseDriveUploadSection, requireActivityEditor, uploadActivityFile } from "../_shared/googleDrive.ts";

Deno.serve(async (request) => {
  const options = handleOptions(request);
  if (options) return options;

  try {
    const form = await request.formData();
    const user = await requireActivityEditor(form.get("user_id"));
    const activityId = Number(form.get("activity_id"));
    const file = form.get("file");
    const uploadSection = parseDriveUploadSection(form.get("upload_section"));

    if (!Number.isFinite(activityId)) throw new Error("A valid activity is required.");
    if (!(file instanceof File)) throw new Error("A file is required.");

    return jsonResponse({
      file: await uploadActivityFile(activityId, file, user, uploadSection)
    });
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "Unable to upload Activity file.", 400);
  }
});
