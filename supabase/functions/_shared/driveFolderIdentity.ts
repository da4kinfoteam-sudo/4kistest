export type DriveEntityFolderKind = "ipo" | "subproject" | "activity";
export type DriveFolderMappingAction = "create" | "reuse" | "isolate";

const DRIVE_ENTITY_PREFIX: Record<DriveEntityFolderKind, string> = {
  ipo: "IPO",
  subproject: "SP",
  activity: "ACT"
};

export function buildDriveEntityFolderName(
  kind: DriveEntityFolderKind,
  entityIdValue: number,
  displayNameValue: string
) {
  const entityId = Number(entityIdValue);
  if (!Number.isInteger(entityId) || entityId <= 0) {
    throw new Error("A valid entity ID is required for the Drive folder.");
  }

  const displayName = String(displayNameValue || "").trim() || `${DRIVE_ENTITY_PREFIX[kind]} ${entityId}`;
  return `${DRIVE_ENTITY_PREFIX[kind]}-${entityId} - ${displayName}`;
}

export function getDriveFolderMappingAction({
  hasMapping,
  isSharedWithDifferentEntity
}: {
  hasMapping: boolean;
  isSharedWithDifferentEntity: boolean;
}): DriveFolderMappingAction {
  if (!hasMapping) return "create";
  return isSharedWithDifferentEntity ? "isolate" : "reuse";
}

export function buildIsolatedDriveFolderMappingUpdate({
  folderId,
  folderName,
  hierarchy
}: {
  folderId: string;
  folderName: string;
  hierarchy: Record<string, string | null>;
}) {
  return {
    folder_id: folderId,
    folder_name: folderName,
    gallery_folder_id: null,
    files_folder_id: null,
    ...hierarchy
  };
}
