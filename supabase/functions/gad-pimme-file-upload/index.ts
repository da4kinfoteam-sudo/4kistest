import { errorResponse, handleOptions, jsonResponse, requireGadPimmeEditor, uploadGadPimmeFile } from "../_shared/googleDrive.ts";

Deno.serve(async (request) => {
  const options = handleOptions(request);
  if (options) return options;
  try {
    const form = await request.formData();
    const user = await requireGadPimmeEditor(form.get("user_id"));
    const file = form.get("file");
    if (!(file instanceof File)) throw new Error("A file is required.");
    return jsonResponse({
      file: await uploadGadPimmeFile(form.get("operating_unit"), form.get("year"), form.get("question_key"), file, user)
    });
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "Unable to upload GAD PIMME evidence.", 400);
  }
});

