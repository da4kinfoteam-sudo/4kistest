import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";
const USERINFO_EMAIL_SCOPE = "https://www.googleapis.com/auth/userinfo.email";
const OPENID_SCOPE = "openid";
const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo";
const GOOGLE_DRIVE_FILES_URL = "https://www.googleapis.com/drive/v3/files";
const GOOGLE_DRIVE_UPLOAD_URL = "https://www.googleapis.com/upload/drive/v3/files";
const DRIVE_FOLDER_MIME_TYPE = "application/vnd.google-apps.folder";
const IPO_DRIVE_MODULE = "IPO Management";
const SUBPROJECT_DRIVE_MODULE = "Subprojects";
const ACTIVITY_DRIVE_MODULE = "Activities";
const ALLOWED_UPLOAD_MIME_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/webp"
]);
const ALLOWED_UPLOAD_EXTENSIONS = new Set([
  ".doc",
  ".docx",
  ".gif",
  ".jpeg",
  ".jpg",
  ".pdf",
  ".png",
  ".ppt",
  ".pptx",
  ".webp"
]);
const ALLOWED_IMAGE_UPLOAD_MIME_TYPES = new Set(["image/gif", "image/jpeg", "image/png", "image/webp"]);
const ALLOWED_IMAGE_UPLOAD_EXTENSIONS = new Set([".gif", ".jpeg", ".jpg", ".png", ".webp"]);

export type DriveUploadSection = "gallery" | "files";

type DriveFolderTable = "ipo_drive_folders" | "subproject_drive_folders" | "activity_drive_folders";

type DriveFolderRow = {
  id: number;
  connection_id: string | null;
  folder_id: string;
  folder_name?: string | null;
  folder_year?: number | null;
  operating_unit?: string | null;
  component?: string | null;
  ipo_name?: string | null;
  subproject_name?: string | null;
  activity_name?: string | null;
  activity_type?: string | null;
  module_folder_id?: string | null;
  year_folder_id?: string | null;
  operating_unit_folder_id?: string | null;
  ipo_folder_id?: string | null;
  component_folder_id?: string | null;
  gallery_folder_id?: string | null;
  files_folder_id?: string | null;
};

const FOLDER_PREPARATION_ERROR = "The upload folder could not be prepared. Refresh the section and try again.";
const UPLOAD_RECORD_ERROR = "The uploaded file could not be registered. The Drive copy was removed; please try again.";
const FOLDER_LOCK_TTL_MS = 120_000;
const FOLDER_LOCK_WAIT_MS = 250;
const FOLDER_LOCK_ATTEMPTS = 48;
const FOLDER_ROW_RETRY_ATTEMPTS = 8;

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
};

type UserRow = {
  id: number;
  role?: string | null;
  fullName?: string | null;
  username?: string | null;
  permissions_override?: Record<string, any> | null;
};

type IpoRow = {
  id: number;
  name: string;
  region?: string | null;
};

type SubprojectRow = {
  id: number;
  name: string;
  operatingUnit?: string | null;
  indigenousPeopleOrganization?: string | null;
};

type ActivityRow = {
  id: number;
  name: string;
  type?: string | null;
  operatingUnit?: string | null;
  component?: string | null;
};

type ConnectionRow = {
  id: string;
  encrypted_refresh_token: string;
  google_account_email: string;
  root_folder_id: string | null;
  root_folder_name: string;
  connected_at: string;
};

type TokenResponse = {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string;
  token_type: string;
};

type DriveFileResponse = {
  id: string;
  name?: string;
  mimeType?: string;
  size?: string;
  webViewLink?: string;
  webContentLink?: string;
};

type DrivePermissionResponse = {
  id: string;
  type?: string;
  role?: string;
};

type UserInfoResponse = {
  email?: string;
};

const REGION_ALIASES: Record<string, string> = {
  "Ilocos Region": "Region I (Ilocos Region)",
  "Cagayan Valley": "Region II (Cagayan Valley)",
  "Central Luzon": "Region III (Central Luzon)",
  "CALABARZON": "Region IV-A (CALABARZON)",
  "MIMAROPA": "MIMAROPA Region",
  "MIMAROPA Region": "MIMAROPA Region",
  "Bicol Region": "Region V (Bicol Region)",
  "Western Visayas": "Region VI (Western Visayas)",
  "Central Visayas": "Region VII (Central Visayas)",
  "Eastern Visayas": "Region VIII (Eastern Visayas)",
  "Zamboanga Peninsula": "Region IX (Zamboanga Peninsula)",
  "Northern Mindanao": "Region X (Northern Mindanao)",
  "Davao Region": "Region XI (Davao Region)",
  "SOCCSKSARGEN": "Region XII (SOCCSKSARGEN)",
  "Caraga": "Region XIII (Caraga)",
  "NCR": "National Capital Region (NCR)",
  "National Capital Region": "National Capital Region (NCR)",
  "CAR": "Cordillera Administrative Region (CAR)",
  "Cordillera Administrative Region": "Cordillera Administrative Region (CAR)",
  "BARMM": "Bangsamoro Autonomous Region in Muslim Mindanao (BARMM)",
  "Bangsamoro Autonomous Region in Muslim Mindanao": "Bangsamoro Autonomous Region in Muslim Mindanao (BARMM)",
  "Region 1": "Region I (Ilocos Region)",
  "Region 2": "Region II (Cagayan Valley)",
  "Region 3": "Region III (Central Luzon)",
  "Region 4A": "Region IV-A (CALABARZON)",
  "Region 4-A": "Region IV-A (CALABARZON)",
  "Region 5": "Region V (Bicol Region)",
  "Region 6": "Region VI (Western Visayas)",
  "Region 7": "Region VII (Central Visayas)",
  "Region 8": "Region VIII (Eastern Visayas)",
  "Region 9": "Region IX (Zamboanga Peninsula)",
  "Region 10": "Region X (Northern Mindanao)",
  "Region 11": "Region XI (Davao Region)",
  "Region 12": "Region XII (SOCCSKSARGEN)",
  "Region 13": "Region XIII (Caraga)",
  "Region I": "Region I (Ilocos Region)",
  "Region II": "Region II (Cagayan Valley)",
  "Region III": "Region III (Central Luzon)",
  "Region IV-A": "Region IV-A (CALABARZON)",
  "Region IV-B": "MIMAROPA Region",
  "Region V": "Region V (Bicol Region)",
  "Region VI": "Region VI (Western Visayas)",
  "Region VII": "Region VII (Central Visayas)",
  "Region VIII": "Region VIII (Eastern Visayas)",
  "Region IX": "Region IX (Zamboanga Peninsula)",
  "Region X": "Region X (Northern Mindanao)",
  "Region XI": "Region XI (Davao Region)",
  "Region XII": "Region XII (SOCCSKSARGEN)",
  "Region XIII": "Region XIII (Caraga)"
};

const REGION_TO_OPERATING_UNIT: Record<string, string> = {
  "National Capital Region (NCR)": "NPMO",
  "Cordillera Administrative Region (CAR)": "RPMO CAR",
  "Region I (Ilocos Region)": "RPMO 1",
  "Region II (Cagayan Valley)": "RPMO 2",
  "Region III (Central Luzon)": "RPMO 3",
  "Region IV-A (CALABARZON)": "RPMO 4A",
  "MIMAROPA Region": "RPMO 4B",
  "Region V (Bicol Region)": "RPMO 5",
  "Region VI (Western Visayas)": "RPMO 6",
  "Region VII (Central Visayas)": "RPMO 7",
  "Region VIII (Eastern Visayas)": "RPMO 8",
  "Region IX (Zamboanga Peninsula)": "RPMO 9",
  "Region X (Northern Mindanao)": "RPMO 10",
  "Region XI (Davao Region)": "RPMO 11",
  "Region XII (SOCCSKSARGEN)": "RPMO 12",
  "Region XIII (Caraga)": "RPMO 13",
  "Negros Island Region (NIR)": "RPMO NIR"
};

function env(name: string) {
  return Deno.env.get(name)?.trim() || "";
}

function googleConfig() {
  const rootFolderName = env("GOOGLE_DRIVE_ROOT_FOLDER_NAME") || "4KIS Master File Storage";
  const missingEnv = [
    "GOOGLE_CLIENT_ID",
    "GOOGLE_CLIENT_SECRET",
    "GOOGLE_REDIRECT_URI",
    "GOOGLE_TOKEN_ENCRYPTION_KEY",
    "SUPABASE_SERVICE_ROLE_KEY"
  ].filter((name) => !env(name));

  return {
    clientId: env("GOOGLE_CLIENT_ID"),
    clientSecret: env("GOOGLE_CLIENT_SECRET"),
    redirectUri: env("GOOGLE_REDIRECT_URI"),
    rootFolderName,
    tokenEncryptionKey: env("GOOGLE_TOKEN_ENCRYPTION_KEY"),
    appBaseUrl: env("APP_BASE_URL") || env("SITE_URL"),
    missingEnv,
    isConfigured: missingEnv.length === 0
  };
}

export function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
}

export function errorResponse(message: string, status = 400) {
  return jsonResponse({ error: message }, status);
}

export function handleOptions(request: Request) {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  return null;
}

export function adminClient() {
  const url = env("SUPABASE_URL") || env("VITE_SUPABASE_URL");
  const key = env("SUPABASE_SERVICE_ROLE_KEY");

  if (!url || !key) {
    throw new Error("Supabase Edge Function environment is missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  }

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}

async function fetchUser(userId: unknown): Promise<UserRow> {
  const numericId = Number(userId);
  if (!Number.isFinite(numericId)) {
    throw new Error("A valid current user is required.");
  }

  const { data, error } = await adminClient()
    .from("users")
    .select("*")
    .eq("id", numericId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error("Current user was not found.");

  return data as UserRow;
}

async function fetchIpo(ipoId: number): Promise<IpoRow> {
  const { data, error } = await adminClient()
    .from("ipos")
    .select("id,name,region")
    .eq("id", ipoId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error("IPO was not found.");
  return data as IpoRow;
}

async function fetchSubproject(subprojectId: number): Promise<SubprojectRow> {
  const { data, error } = await adminClient()
    .from("subprojects")
    .select("id,name,operatingUnit,indigenousPeopleOrganization")
    .eq("id", subprojectId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error("Subproject was not found.");
  return data as SubprojectRow;
}

async function fetchActivity(activityId: number): Promise<ActivityRow> {
  const { data, error } = await adminClient()
    .from("activities")
    .select("id,name,type,operatingUnit,component")
    .eq("id", activityId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error("Activity was not found.");
  return data as ActivityRow;
}

function normalizeRegionName(inputRegion?: string | null) {
  const trimmed = (inputRegion || "").trim();
  return REGION_ALIASES[trimmed] || trimmed;
}

function operatingUnitFromRegion(region?: string | null) {
  const normalizedRegion = normalizeRegionName(region);
  return REGION_TO_OPERATING_UNIT[normalizedRegion] || normalizedRegion || "Unassigned Operating Unit";
}

function isAdmin(user: UserRow) {
  return user.role === "Super Admin" || user.role === "Administrator";
}

function isSuperAdmin(user: UserRow) {
  return user.role === "Super Admin";
}

export function displayUserName(user: UserRow) {
  return user.fullName || user.username || `User ${user.id}`;
}

export async function requireUser(userId: unknown) {
  return fetchUser(userId);
}

export async function requireSuperAdmin(userId: unknown) {
  const user = await fetchUser(userId);
  if (!isSuperAdmin(user)) {
    throw new Error("Only Super Admin users can manage Google Drive storage.");
  }
  return user;
}

export async function requireAdmin(userId: unknown) {
  const user = await fetchUser(userId);
  if (!isAdmin(user)) {
    throw new Error("Only Super Admin and Administrator users can delete Drive files.");
  }
  return user;
}

export async function requireIpoEditor(userId: unknown) {
  const user = await fetchUser(userId);
  if (isAdmin(user)) return user;

  const override = user.permissions_override?.["IPO Management"];
  if (override && override.can_edit === true) return user;

  const { data, error } = await adminClient()
    .from("roles_config")
    .select("can_edit")
    .eq("role", user.role)
    .eq("module", "IPO Management")
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (data?.can_edit) return user;

  throw new Error("You do not have permission to upload IPO files.");
}

export async function requireSubprojectEditor(userId: unknown) {
  const user = await fetchUser(userId);
  if (isAdmin(user)) return user;

  const override = user.permissions_override?.["Subprojects"];
  if (override && override.can_edit === true) return user;

  const { data, error } = await adminClient()
    .from("roles_config")
    .select("can_edit")
    .eq("role", user.role)
    .eq("module", "Subprojects")
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (data?.can_edit) return user;

  throw new Error("You do not have permission to upload Subproject files.");
}

export async function requireActivityEditor(userId: unknown) {
  const user = await fetchUser(userId);
  if (isAdmin(user)) return user;

  const override = user.permissions_override?.["Activities"];
  if (override && override.can_edit === true) return user;

  const { data, error } = await adminClient()
    .from("roles_config")
    .select("can_edit")
    .eq("role", user.role)
    .eq("module", "Activities")
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (data?.can_edit) return user;

  throw new Error("You do not have permission to upload Activity files.");
}

export function getEnvironmentStatus() {
  const config = googleConfig();
  return {
    isConfigured: config.isConfigured,
    missingEnv: config.missingEnv,
    rootFolderName: config.rootFolderName
  };
}

function base64UrlEncode(bytes: Uint8Array) {
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlDecode(value: string) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function digestKey(secret: string, usages: KeyUsage[]) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  return crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, usages);
}

async function hmacKey(secret: string) {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

async function encryptSecret(value: string) {
  const config = googleConfig();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await digestKey(config.tokenEncryptionKey, ["encrypt"]);
  const encrypted = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(value)));
  return `${base64UrlEncode(iv)}.${base64UrlEncode(encrypted)}`;
}

async function decryptSecret(value: string) {
  const config = googleConfig();
  const [ivValue, encryptedValue] = value.split(".");
  if (!ivValue || !encryptedValue) throw new Error("Stored Google token is not readable.");
  const key = await digestKey(config.tokenEncryptionKey, ["decrypt"]);
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64UrlDecode(ivValue) },
    key,
    base64UrlDecode(encryptedValue)
  );
  return new TextDecoder().decode(decrypted);
}

export async function createSignedState(userId: number) {
  const config = googleConfig();
  const payload = base64UrlEncode(new TextEncoder().encode(JSON.stringify({
    userId,
    nonce: crypto.randomUUID(),
    createdAt: Date.now()
  })));
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", await hmacKey(config.tokenEncryptionKey), new TextEncoder().encode(payload)));
  return `${payload}.${base64UrlEncode(signature)}`;
}

export async function readSignedState(state: string) {
  const config = googleConfig();
  const [payload, signature] = state.split(".");
  if (!payload || !signature) throw new Error("Google Drive connection state is invalid.");
  const isValid = await crypto.subtle.verify(
    "HMAC",
    await hmacKey(config.tokenEncryptionKey),
    base64UrlDecode(signature),
    new TextEncoder().encode(payload)
  );
  if (!isValid) throw new Error("Google Drive connection state could not be verified.");

  const parsed = JSON.parse(new TextDecoder().decode(base64UrlDecode(payload))) as { userId: number; createdAt: number };
  if (!parsed.userId || Date.now() - parsed.createdAt > 10 * 60 * 1000) {
    throw new Error("Google Drive connection state has expired.");
  }
  return parsed;
}

async function readJsonResponse<T>(response: Response, fallbackMessage: string): Promise<T> {
  const text = await response.text();
  const payload = text ? JSON.parse(text) : {};

  if (!response.ok) {
    const message =
      payload && typeof payload === "object" && "error_description" in payload && typeof payload.error_description === "string"
        ? payload.error_description
        : fallbackMessage;
    throw new Error(message);
  }

  return payload as T;
}

async function readResponseErrorMessage(response: Response, fallbackMessage: string) {
  const text = await response.text().catch(() => "");
  if (!text) return fallbackMessage;

  try {
    const payload = JSON.parse(text);
    if (typeof payload?.error_description === "string") return payload.error_description;
    if (typeof payload?.error?.message === "string") return payload.error.message;
    if (typeof payload?.error === "string") return payload.error;
    if (typeof payload?.message === "string") return payload.message;
  } catch {
    return text;
  }

  return fallbackMessage;
}

async function refreshAccessToken(refreshToken: string) {
  const config = googleConfig();
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      grant_type: "refresh_token",
      refresh_token: refreshToken
    })
  });
  const tokens = await readJsonResponse<TokenResponse>(response, "Unable to refresh Google Drive access.");
  return tokens.access_token;
}

async function exchangeCodeForTokens(code: string) {
  const config = googleConfig();
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code,
      grant_type: "authorization_code",
      redirect_uri: config.redirectUri
    })
  });
  return readJsonResponse<TokenResponse>(response, "Unable to connect Google Drive.");
}

async function getGoogleAccountEmail(accessToken: string) {
  const response = await fetch(GOOGLE_USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  const data = await readJsonResponse<UserInfoResponse>(response, "Unable to read Google account profile.");
  if (!data.email) throw new Error("Google account email was not returned.");
  return data.email;
}

function escapeDriveQuery(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function cleanDriveName(value: string, fallback = "Document") {
  return value.replace(/[<>:"/\\|?*\u0000-\u001F]/g, "-").replace(/\s+/g, " ").trim().slice(0, 180) || fallback;
}

function getUploadYear() {
  return new Date().getFullYear();
}

function getFileExtension(fileName: string) {
  const match = fileName.toLowerCase().match(/\.[^.]+$/);
  return match?.[0] || "";
}

function isAllowedUploadFile(file: File) {
  const mimeType = (file.type || "").toLowerCase();
  if (mimeType && ALLOWED_UPLOAD_MIME_TYPES.has(mimeType)) return true;
  return ALLOWED_UPLOAD_EXTENSIONS.has(getFileExtension(file.name));
}

function getPreviewUrl(fileId: string) {
  return `https://drive.google.com/file/d/${encodeURIComponent(fileId)}/preview`;
}

export function parseDriveUploadSection(value: unknown): DriveUploadSection {
  if (value === "gallery" || value === "files") return value;
  if (value === null || value === undefined || value === "") return "files";
  throw new Error("Upload destination must be Gallery or Files.");
}

function isAllowedGalleryFile(file: File) {
  const mimeType = (file.type || "").toLowerCase();
  if (mimeType && ALLOWED_IMAGE_UPLOAD_MIME_TYPES.has(mimeType)) return true;
  return ALLOWED_IMAGE_UPLOAD_EXTENSIONS.has(getFileExtension(file.name));
}

function assertAllowedUploadFile(file: File, uploadSection: DriveUploadSection) {
  if (uploadSection === "gallery") {
    if (isAllowedGalleryFile(file)) return;
    throw new Error("Gallery accepts PNG, JPG, JPEG, WEBP, and GIF images only.");
  }
  if (isAllowedUploadFile(file)) return;
  throw new Error("Files accepts images, PDF, Word, and PowerPoint documents only.");
}

async function findFolder(accessToken: string, name: string, parentFolderId?: string | null) {
  const queryParts = [
    "mimeType = 'application/vnd.google-apps.folder'",
    "trashed = false",
    `name = '${escapeDriveQuery(name)}'`
  ];
  if (parentFolderId) {
    queryParts.push(`'${escapeDriveQuery(parentFolderId)}' in parents`);
  }
  const params = new URLSearchParams({
    q: queryParts.join(" and "),
    fields: "files(id,name,webViewLink)",
    pageSize: "1",
    spaces: "drive"
  });
  const response = await fetch(`${GOOGLE_DRIVE_FILES_URL}?${params.toString()}`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  const data = await readJsonResponse<{ files?: DriveFileResponse[] }>(response, "Unable to search Google Drive folders.");
  return data.files?.[0] || null;
}

async function createFolder(accessToken: string, name: string, parentFolderId?: string | null) {
  const response = await fetch(`${GOOGLE_DRIVE_FILES_URL}?fields=id,name,webViewLink`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      mimeType: DRIVE_FOLDER_MIME_TYPE,
      name: cleanDriveName(name, "Folder"),
      ...(parentFolderId ? { parents: [parentFolderId] } : {})
    })
  });
  return readJsonResponse<DriveFileResponse>(response, "Unable to create Google Drive folder.");
}

async function ensureFolder(accessToken: string, name: string, parentFolderId?: string | null) {
  return await findFolder(accessToken, name, parentFolderId) || await createFolder(accessToken, name, parentFolderId);
}

function wait(milliseconds: number) {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

function isUniqueViolation(error: any) {
  return error?.code === "23505" || /duplicate key|unique constraint/i.test(String(error?.message || ""));
}

async function tryAcquireFolderLock(lockKey: string, ownerToken: string) {
  const supabase = adminClient();
  const now = new Date();
  await supabase
    .from("drive_folder_initialization_locks")
    .delete()
    .eq("lock_key", lockKey)
    .lt("expires_at", now.toISOString());

  const { error } = await supabase.from("drive_folder_initialization_locks").insert({
    lock_key: lockKey,
    owner_token: ownerToken,
    expires_at: new Date(now.getTime() + FOLDER_LOCK_TTL_MS).toISOString()
  });
  if (!error) return true;
  if (isUniqueViolation(error)) return false;
  throw new Error(FOLDER_PREPARATION_ERROR);
}

async function releaseFolderLock(lockKey: string, ownerToken: string) {
  await adminClient()
    .from("drive_folder_initialization_locks")
    .delete()
    .eq("lock_key", lockKey)
    .eq("owner_token", ownerToken);
}

async function withDriveFolderInitializationLock<T>(
  lockKey: string,
  findExisting: () => Promise<T | null>,
  initialize: () => Promise<T>
) {
  const existing = await findExisting();
  if (existing) return existing;

  const ownerToken = crypto.randomUUID();
  for (let attempt = 0; attempt < FOLDER_LOCK_ATTEMPTS; attempt += 1) {
    const acquired = await tryAcquireFolderLock(lockKey, ownerToken);
    if (acquired) {
      try {
        const current = await findExisting();
        return current || await initialize();
      } finally {
        await releaseFolderLock(lockKey, ownerToken);
      }
    }

    await wait(FOLDER_LOCK_WAIT_MS);
    const current = await findExisting();
    if (current) return current;
  }

  throw new Error(FOLDER_PREPARATION_ERROR);
}

async function findCanonicalFolderWithRetry(findFolderRow: () => Promise<DriveFolderRow | null>) {
  for (let attempt = 0; attempt < FOLDER_ROW_RETRY_ATTEMPTS; attempt += 1) {
    const row = await findFolderRow();
    if (row?.folder_id) return row;
    await wait(FOLDER_LOCK_WAIT_MS * (attempt + 1));
  }
  throw new Error(FOLDER_PREPARATION_ERROR);
}

async function registerCanonicalFolder(
  table: DriveFolderTable,
  folderRow: Record<string, unknown>,
  findFolderRow: () => Promise<DriveFolderRow | null>
) {
  const { error } = await adminClient().from(table).insert(folderRow);
  if (error && !isUniqueViolation(error)) {
    throw new Error(FOLDER_PREPARATION_ERROR);
  }
  return findCanonicalFolderWithRetry(findFolderRow);
}

async function ensureUploadSectionFolder(
  accessToken: string,
  table: DriveFolderTable,
  folderRowId: number,
  parentFolderId: string,
  uploadSection: DriveUploadSection
) {
  const column = uploadSection === "gallery" ? "gallery_folder_id" : "files_folder_id";
  const folderName = uploadSection === "gallery" ? "Gallery" : "Files";

  const findPersistedFolder = async (): Promise<DriveFileResponse | null> => {
    const { data, error } = await adminClient()
      .from(table)
      .select(`id,${column}`)
      .eq("id", folderRowId)
      .maybeSingle();
    if (error) throw new Error(FOLDER_PREPARATION_ERROR);
    const folderId = data?.[column];
    return typeof folderId === "string" && folderId
      ? { id: folderId, name: folderName }
      : null;
  };

  return withDriveFolderInitializationLock(
    `section:${table}:${folderRowId}:${uploadSection}`,
    findPersistedFolder,
    async () => {
      const folder = await ensureFolder(accessToken, folderName, parentFolderId);
      const { error } = await adminClient()
        .from(table)
        .update({ [column]: folder.id })
        .eq("id", folderRowId)
        .is(column, null);
      if (error) throw new Error(FOLDER_PREPARATION_ERROR);
      return await findPersistedFolder() || folder;
    }
  );
}

async function getActiveConnection(): Promise<ConnectionRow | null> {
  const { data, error } = await adminClient()
    .from("google_drive_connections")
    .select("*")
    .eq("status", "active")
    .order("connected_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as ConnectionRow | null;
}

export async function getConnectionStatus() {
  const environment = getEnvironmentStatus();
  if (!environment.isConfigured) {
    return {
      ...environment,
      isConnected: false,
      hasConnection: false,
      tokenStatus: "not_connected",
      connectionMessage: null,
      accountEmail: null,
      connectedAt: null,
      rootFolderId: null
    };
  }

  const connection = await getActiveConnection();
  let tokenStatus = connection ? "valid" : "not_connected";
  let connectionMessage: string | null = null;

  if (connection) {
    try {
      await refreshAccessToken(await decryptSecret(connection.encrypted_refresh_token));
    } catch (error) {
      tokenStatus = "expired";
      connectionMessage = "Google Drive connection expired. Ask an Admin to reconnect Google Drive storage.";
    }
  }

  return {
    ...environment,
    isConnected: Boolean(connection) && tokenStatus === "valid",
    hasConnection: Boolean(connection),
    tokenStatus,
    connectionMessage,
    accountEmail: connection?.google_account_email ?? null,
    connectedAt: connection?.connected_at ?? null,
    rootFolderId: connection?.root_folder_id ?? null,
    rootFolderName: connection?.root_folder_name ?? environment.rootFolderName
  };
}

export async function createAuthorizationUrl(userId: number) {
  const config = googleConfig();
  if (!config.isConfigured) throw new Error(`Google Drive integration is missing: ${config.missingEnv.join(", ")}.`);
  const state = await createSignedState(userId);
  const params = new URLSearchParams({
    access_type: "offline",
    client_id: config.clientId,
    include_granted_scopes: "true",
    prompt: "consent",
    redirect_uri: config.redirectUri,
    response_type: "code",
    scope: [OPENID_SCOPE, USERINFO_EMAIL_SCOPE, DRIVE_SCOPE].join(" "),
    state
  });
  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

export async function completeConnection(code: string, connectedBy: number) {
  const config = googleConfig();
  if (!config.isConfigured) throw new Error(`Google Drive integration is missing: ${config.missingEnv.join(", ")}.`);

  const tokens = await exchangeCodeForTokens(code);
  if (!tokens.refresh_token) {
    throw new Error("Google did not return a refresh token. Reconnect and approve offline access.");
  }

  const accountEmail = await getGoogleAccountEmail(tokens.access_token);
  const existingRoot = await findFolder(tokens.access_token, config.rootFolderName);
  const rootFolder = existingRoot || await createFolder(tokens.access_token, config.rootFolderName);
  const supabase = adminClient();

  const { error: deactivateError } = await supabase
    .from("google_drive_connections")
    .update({ status: "disconnected", disconnected_at: new Date().toISOString() })
    .eq("status", "active");
  if (deactivateError) throw new Error(deactivateError.message);

  const { error } = await supabase.from("google_drive_connections").insert({
    connected_by: connectedBy,
    encrypted_refresh_token: await encryptSecret(tokens.refresh_token),
    google_account_email: accountEmail,
    root_folder_id: rootFolder.id,
    root_folder_name: config.rootFolderName,
    scopes: tokens.scope?.split(" ").filter(Boolean) ?? [DRIVE_SCOPE],
    status: "active"
  });
  if (error) throw new Error(error.message);
}

export async function disconnectConnection() {
  const { error } = await adminClient()
    .from("google_drive_connections")
    .update({ status: "disconnected", disconnected_at: new Date().toISOString() })
    .eq("status", "active");
  if (error) throw new Error(error.message);
}

export function settingsRedirectUrl(status: "connected" | "error", message?: string) {
  const base = googleConfig().appBaseUrl || "http://127.0.0.1:3000";
  const url = new URL(base);
  url.hash = `/settings?drive=${status}${message ? `&message=${encodeURIComponent(message)}` : ""}`;
  return url.toString();
}

async function connectedDrive() {
  const connection = await getActiveConnection();
  if (!connection) throw new Error("Google Drive storage is not connected. Ask an Admin to reconnect Google Drive storage.");
  let accessToken: string;
  try {
    accessToken = await refreshAccessToken(await decryptSecret(connection.encrypted_refresh_token));
  } catch {
    throw new Error("Google Drive connection expired. Ask an Admin to reconnect Google Drive storage.");
  }
  return { connection, accessToken };
}

async function grantPreviewPermission(accessToken: string, fileId: string) {
  const response = await fetch(`${GOOGLE_DRIVE_FILES_URL}/${encodeURIComponent(fileId)}/permissions?fields=id,type,role`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      type: "anyone",
      role: "reader",
      allowFileDiscovery: false
    })
  });
  return readJsonResponse<DrivePermissionResponse>(response, "Unable to create a preview permission for this Drive file.");
}

async function ensureIpoFolder(ipoId: number, ipoName: string, operatingUnit: string, user: UserRow) {
  const { connection, accessToken } = await connectedDrive();
  const folderYear = getUploadYear();
  const folderOperatingUnit = operatingUnit.trim() || "Unassigned Operating Unit";

  const findFolderRow = async (): Promise<DriveFolderRow | null> => {
    const { data, error } = await adminClient()
      .from("ipo_drive_folders")
      .select("*")
      .eq("ipo_id", ipoId)
      .eq("connection_id", connection.id)
      .eq("module", IPO_DRIVE_MODULE)
      .eq("folder_year", folderYear)
      .eq("operating_unit", folderOperatingUnit)
      .maybeSingle();
    if (error) throw new Error(FOLDER_PREPARATION_ERROR);
    return data as DriveFolderRow | null;
  };

  const resultFromRow = (row: DriveFolderRow) => {
    return {
      connection,
      accessToken,
      folderRowId: Number(row.id),
      folderId: row.folder_id,
      folderYear,
      moduleFolderId: row.module_folder_id ?? null,
      yearFolderId: row.year_folder_id ?? null,
      operatingUnit: folderOperatingUnit,
      operatingUnitFolderId: row.operating_unit_folder_id ?? null
    };
  };

  return withDriveFolderInitializationLock(
    `entity:ipo:${connection.id}:${ipoId}:${IPO_DRIVE_MODULE}:${folderYear}:${folderOperatingUnit}`,
    async () => {
      const row = await findFolderRow();
      return row?.folder_id ? resultFromRow(row) : null;
    },
    async () => {
      if (!connection.root_folder_id) {
        throw new Error("Google Drive master folder is not configured. Reconnect Google Drive storage in User Settings.");
      }

      const moduleFolder = await ensureFolder(accessToken, IPO_DRIVE_MODULE, connection.root_folder_id);
      const yearFolder = await ensureFolder(accessToken, String(folderYear), moduleFolder.id);
      const operatingUnitFolder = await ensureFolder(accessToken, cleanDriveName(folderOperatingUnit, "Operating Unit"), yearFolder.id);
      const folderName = cleanDriveName(ipoName, `IPO ${ipoId}`);
      const folder = await ensureFolder(accessToken, folderName, operatingUnitFolder.id);
      const canonical = await registerCanonicalFolder(
        "ipo_drive_folders",
        {
          ipo_id: ipoId,
          connection_id: connection.id,
          folder_id: folder.id,
          folder_name: folderName,
          module: IPO_DRIVE_MODULE,
          folder_year: folderYear,
          operating_unit: folderOperatingUnit,
          module_folder_id: moduleFolder.id,
          year_folder_id: yearFolder.id,
          operating_unit_folder_id: operatingUnitFolder.id,
          created_by: user.id
        },
        findFolderRow
      );
      return resultFromRow(canonical);
    }
  );
}

async function ensureSubprojectFolder(subprojectIdValue: number, user: UserRow) {
  const subprojectId = Number(subprojectIdValue);

  if (!Number.isFinite(subprojectId)) throw new Error("A valid subproject is required.");
  const subproject = await fetchSubproject(subprojectId);
  const subprojectName = (subproject.name || "").trim();
  const operatingUnit = (subproject.operatingUnit || "").trim();
  const ipoName = (subproject.indigenousPeopleOrganization || "").trim();

  if (!subprojectName) throw new Error("Subproject name is required.");
  if (!operatingUnit) throw new Error("This subproject needs an operating unit before files can be uploaded.");
  if (!ipoName) throw new Error("This subproject needs a linked IPO before files can be uploaded.");

  const { connection, accessToken } = await connectedDrive();
  const folderYear = getUploadYear();

  const findFolderRow = async (): Promise<DriveFolderRow | null> => {
    const { data, error } = await adminClient()
      .from("subproject_drive_folders")
      .select("*")
      .eq("subproject_id", subprojectId)
      .eq("connection_id", connection.id)
      .eq("module", SUBPROJECT_DRIVE_MODULE)
      .eq("folder_year", folderYear)
      .maybeSingle();
    if (error) throw new Error(FOLDER_PREPARATION_ERROR);
    return data as DriveFolderRow | null;
  };

  const resultFromRow = (row: DriveFolderRow) => {
    return {
      connection,
      accessToken,
      folderRowId: Number(row.id),
      folderId: row.folder_id,
      folderName: row.folder_name || cleanDriveName(subprojectName, `Subproject ${subprojectId}`),
      folderYear,
      operatingUnit: row.operating_unit || operatingUnit,
      ipoName: row.ipo_name || ipoName,
      subprojectName: row.subproject_name || subprojectName,
      moduleFolderId: row.module_folder_id ?? null,
      yearFolderId: row.year_folder_id ?? null,
      operatingUnitFolderId: row.operating_unit_folder_id ?? null,
      ipoFolderId: row.ipo_folder_id ?? null
    };
  };

  return withDriveFolderInitializationLock(
    `entity:subproject:${connection.id}:${subprojectId}:${SUBPROJECT_DRIVE_MODULE}:${folderYear}`,
    async () => {
      const row = await findFolderRow();
      return row?.folder_id ? resultFromRow(row) : null;
    },
    async () => {
      if (!connection.root_folder_id) {
        throw new Error("Google Drive master folder is not configured. Reconnect Google Drive storage in User Settings.");
      }

      const moduleFolder = await ensureFolder(accessToken, SUBPROJECT_DRIVE_MODULE, connection.root_folder_id);
      const yearFolder = await ensureFolder(accessToken, String(folderYear), moduleFolder.id);
      const operatingUnitFolder = await ensureFolder(accessToken, cleanDriveName(operatingUnit, "Operating Unit"), yearFolder.id);
      const ipoFolder = await ensureFolder(accessToken, cleanDriveName(ipoName, `IPO ${subprojectId}`), operatingUnitFolder.id);
      const folderName = cleanDriveName(subprojectName, `Subproject ${subprojectId}`);
      const folder = await ensureFolder(accessToken, folderName, ipoFolder.id);
      const canonical = await registerCanonicalFolder(
        "subproject_drive_folders",
        {
          subproject_id: subprojectId,
          connection_id: connection.id,
          folder_id: folder.id,
          folder_name: folderName,
          module: SUBPROJECT_DRIVE_MODULE,
          folder_year: folderYear,
          operating_unit: operatingUnit,
          ipo_name: ipoName,
          subproject_name: subprojectName,
          module_folder_id: moduleFolder.id,
          year_folder_id: yearFolder.id,
          operating_unit_folder_id: operatingUnitFolder.id,
          ipo_folder_id: ipoFolder.id,
          created_by: user.id
        },
        findFolderRow
      );
      return resultFromRow(canonical);
    }
  );
}

async function ensureActivityFolder(activityIdValue: number, user: UserRow) {
  const activityId = Number(activityIdValue);

  if (!Number.isFinite(activityId)) throw new Error("A valid activity is required.");
  const activity = await fetchActivity(activityId);
  const activityName = (activity.name || "").trim();
  const operatingUnit = (activity.operatingUnit || "").trim();
  const component = (activity.component || "").trim();
  const activityType = (activity.type || "Activity").trim();

  if (!activityName) throw new Error("Activity name is required.");
  if (!operatingUnit) throw new Error("This activity needs an operating unit before files can be uploaded.");
  if (!component) throw new Error("This activity needs a component before files can be uploaded.");

  const { connection, accessToken } = await connectedDrive();
  const folderYear = getUploadYear();

  const findFolderRow = async (): Promise<DriveFolderRow | null> => {
    const { data, error } = await adminClient()
      .from("activity_drive_folders")
      .select("*")
      .eq("activity_id", activityId)
      .eq("connection_id", connection.id)
      .eq("module", ACTIVITY_DRIVE_MODULE)
      .eq("folder_year", folderYear)
      .maybeSingle();
    if (error) throw new Error(FOLDER_PREPARATION_ERROR);
    return data as DriveFolderRow | null;
  };

  const resultFromRow = (row: DriveFolderRow) => {
    return {
      connection,
      accessToken,
      folderRowId: Number(row.id),
      folderId: row.folder_id,
      folderName: row.folder_name || cleanDriveName(activityName, `Activity ${activityId}`),
      folderYear,
      operatingUnit: row.operating_unit || operatingUnit,
      component: row.component || component,
      activityName: row.activity_name || activityName,
      activityType: row.activity_type || activityType,
      moduleFolderId: row.module_folder_id ?? null,
      yearFolderId: row.year_folder_id ?? null,
      operatingUnitFolderId: row.operating_unit_folder_id ?? null,
      componentFolderId: row.component_folder_id ?? null
    };
  };

  return withDriveFolderInitializationLock(
    `entity:activity:${connection.id}:${activityId}:${ACTIVITY_DRIVE_MODULE}:${folderYear}`,
    async () => {
      const row = await findFolderRow();
      return row?.folder_id ? resultFromRow(row) : null;
    },
    async () => {
      if (!connection.root_folder_id) {
        throw new Error("Google Drive master folder is not configured. Reconnect Google Drive storage in User Settings.");
      }

      const moduleFolder = await ensureFolder(accessToken, ACTIVITY_DRIVE_MODULE, connection.root_folder_id);
      const yearFolder = await ensureFolder(accessToken, String(folderYear), moduleFolder.id);
      const operatingUnitFolder = await ensureFolder(accessToken, cleanDriveName(operatingUnit, "Operating Unit"), yearFolder.id);
      const componentFolder = await ensureFolder(accessToken, cleanDriveName(component, "Component"), operatingUnitFolder.id);
      const folderName = cleanDriveName(activityName, `Activity ${activityId}`);
      const folder = await ensureFolder(accessToken, folderName, componentFolder.id);
      const canonical = await registerCanonicalFolder(
        "activity_drive_folders",
        {
          activity_id: activityId,
          connection_id: connection.id,
          folder_id: folder.id,
          folder_name: folderName,
          module: ACTIVITY_DRIVE_MODULE,
          folder_year: folderYear,
          operating_unit: operatingUnit,
          component,
          activity_name: activityName,
          activity_type: activityType,
          module_folder_id: moduleFolder.id,
          year_folder_id: yearFolder.id,
          operating_unit_folder_id: operatingUnitFolder.id,
          component_folder_id: componentFolder.id,
          created_by: user.id
        },
        findFolderRow
      );
      return resultFromRow(canonical);
    }
  );
}

function concatBytes(chunks: Uint8Array[]) {
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

async function uploadMultipartFile(accessToken: string, file: File, parentFolderId: string) {
  const boundary = `4kis-boundary-${crypto.randomUUID()}`;
  const encoder = new TextEncoder();
  const metadata = {
    name: cleanDriveName(file.name, "Uploaded file"),
    parents: [parentFolderId]
  };
  const fileBytes = new Uint8Array(await file.arrayBuffer());
  const body = concatBytes([
    encoder.encode(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`),
    encoder.encode(`--${boundary}\r\nContent-Type: ${file.type || "application/octet-stream"}\r\n\r\n`),
    fileBytes,
    encoder.encode(`\r\n--${boundary}--`)
  ]);
  const fields = "id,name,mimeType,size,webViewLink,webContentLink";
  const response = await fetch(`${GOOGLE_DRIVE_UPLOAD_URL}?uploadType=multipart&fields=${fields}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": `multipart/related; boundary=${boundary}`
    },
    body
  });
  return readJsonResponse<DriveFileResponse>(response, "Unable to upload file to Google Drive.");
}

async function deleteDriveFile(accessToken: string, fileId: string) {
  const response = await fetch(`${GOOGLE_DRIVE_FILES_URL}/${encodeURIComponent(fileId)}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (response.ok || response.status === 400 || response.status === 404 || response.status === 410) {
    return;
  }

  const message = await readResponseErrorMessage(response, "Unable to delete the Google Drive file.");
  if (response.status === 401 || response.status === 403) {
    throw new Error(`Google Drive refused the delete request: ${message}. Reconnect Google Drive storage or confirm the connected account owns this file.`);
  }

  throw new Error(`Unable to delete the Google Drive file: ${message}`);
}

export async function listIpoFiles(ipoId: number) {
  const { data, error } = await adminClient()
    .from("ipo_drive_files")
    .select("*")
    .eq("ipo_id", ipoId)
    .is("deleted_at", null)
    .order("uploaded_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data || [];
}

function normalizeDriveFileMetadata(displayName: unknown, caption: unknown) {
  const normalizedName = typeof displayName === "string" ? displayName.trim() : "";
  const normalizedCaption = typeof caption === "string" ? caption.trim() : "";
  if (normalizedName.length > 255) throw new Error("Image name must be 255 characters or fewer.");
  if (normalizedCaption.length > 4000) throw new Error("Caption must be 4,000 characters or fewer.");
  return {
    display_name: normalizedName || null,
    caption: normalizedCaption || null
  };
}

async function updateDriveFileMetadata(
  table: "ipo_drive_files" | "subproject_drive_files" | "activity_drive_files",
  fileRowId: number,
  displayName: unknown,
  caption: unknown
) {
  const supabase = adminClient();
  const { data: existing, error: existingError } = await supabase
    .from(table)
    .select("*")
    .eq("id", fileRowId)
    .is("deleted_at", null)
    .maybeSingle();
  if (existingError) throw new Error(existingError.message);
  if (!existing) throw new Error("Drive file was not found.");
  if (existing.upload_section !== "gallery") {
    throw new Error("Only Gallery image metadata can be edited.");
  }

  const { data, error } = await supabase
    .from(table)
    .update(normalizeDriveFileMetadata(displayName, caption))
    .eq("id", fileRowId)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return { data, existing };
}

export async function updateIpoFileMetadata(
  fileRowId: number,
  displayName: unknown,
  caption: unknown,
  user: UserRow
) {
  const { data, existing } = await updateDriveFileMetadata("ipo_drive_files", fileRowId, displayName, caption);
  await adminClient().from("ipo_history").insert({
    ipo_id: existing.ipo_id,
    event: `Updated gallery image details: ${data.display_name || data.file_name}`,
    user: displayUserName(user),
    date: new Date().toISOString()
  });
  return data;
}

export async function updateSubprojectFileMetadata(fileRowId: number, displayName: unknown, caption: unknown) {
  return (await updateDriveFileMetadata("subproject_drive_files", fileRowId, displayName, caption)).data;
}

export async function updateActivityFileMetadata(fileRowId: number, displayName: unknown, caption: unknown) {
  return (await updateDriveFileMetadata("activity_drive_files", fileRowId, displayName, caption)).data;
}

export async function uploadIpoFile(ipoId: number, file: File, user: UserRow, uploadSection: DriveUploadSection = "files") {
  const supabase = adminClient();
  assertAllowedUploadFile(file, uploadSection);
  const ipo = await fetchIpo(ipoId);
  const operatingUnit = operatingUnitFromRegion(ipo.region);
  const {
    connection,
    accessToken,
    folderRowId,
    folderId,
    folderYear,
    moduleFolderId,
    yearFolderId,
    operatingUnitFolderId
  } = await ensureIpoFolder(ipoId, ipo.name, operatingUnit, user);
  const uploadFolder = await ensureUploadSectionFolder(
    accessToken,
    "ipo_drive_folders",
    folderRowId,
    folderId,
    uploadSection
  );
  const uploadedFile = await uploadMultipartFile(accessToken, file, uploadFolder.id);
  let previewPermission: DrivePermissionResponse | null = null;
  try {
    previewPermission = await grantPreviewPermission(accessToken, uploadedFile.id);
  } catch (error) {
    await deleteDriveFile(accessToken, uploadedFile.id);
    throw error;
  }

  const row = {
    ipo_id: ipoId,
    connection_id: connection.id,
    folder_id: uploadFolder.id,
    module: IPO_DRIVE_MODULE,
    folder_year: folderYear,
    operating_unit: operatingUnit,
    module_folder_id: moduleFolderId,
    year_folder_id: yearFolderId,
    operating_unit_folder_id: operatingUnitFolderId,
    upload_section: uploadSection,
    file_id: uploadedFile.id,
    file_name: uploadedFile.name || file.name,
    mime_type: uploadedFile.mimeType || file.type || "application/octet-stream",
    file_size: Number(uploadedFile.size || file.size || 0),
    web_view_link: uploadedFile.webViewLink ?? null,
    web_content_link: uploadedFile.webContentLink ?? null,
    preview_url: getPreviewUrl(uploadedFile.id),
    preview_supported: true,
    preview_permission_id: previewPermission?.id ?? null,
    preview_permission_type: previewPermission?.type ?? "anyone",
    uploaded_by: user.id,
    uploaded_by_name: displayUserName(user)
  };

  const { data, error } = await supabase.from("ipo_drive_files").insert(row).select("*").single();
  if (error) {
    await deleteDriveFile(accessToken, uploadedFile.id);
    throw new Error(UPLOAD_RECORD_ERROR);
  }

  await supabase.from("ipo_history").insert({
    ipo_id: ipoId,
    event: `Uploaded ${uploadSection === "gallery" ? "gallery image" : "file"}: ${row.file_name}`,
    user: displayUserName(user),
    date: new Date().toISOString()
  });

  return data;
}

export async function deleteIpoFile(fileRowId: number, user: UserRow) {
  const supabase = adminClient();
  const { data: fileRow, error: fileError } = await supabase
    .from("ipo_drive_files")
    .select("*")
    .eq("id", fileRowId)
    .is("deleted_at", null)
    .maybeSingle();
  if (fileError) throw new Error(fileError.message);
  if (!fileRow) throw new Error("IPO Drive file was not found.");

  const { accessToken } = await connectedDrive();
  await deleteDriveFile(accessToken, fileRow.file_id);

  const deletedAt = new Date().toISOString();
  const { data, error } = await supabase
    .from("ipo_drive_files")
    .update({
      deleted_at: deletedAt,
      deleted_by: user.id,
      deleted_by_name: displayUserName(user)
    })
    .eq("id", fileRowId)
    .select("*")
    .single();
  if (error) throw new Error(error.message);

  await supabase.from("ipo_history").insert({
    ipo_id: fileRow.ipo_id,
    event: `Deleted file: ${fileRow.file_name}`,
    user: displayUserName(user),
    date: deletedAt
  });

  return data;
}

export async function listSubprojectFiles(subprojectId: number) {
  const { data, error } = await adminClient()
    .from("subproject_drive_files")
    .select("*")
    .eq("subproject_id", subprojectId)
    .is("deleted_at", null)
    .order("uploaded_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data || [];
}

export async function uploadSubprojectFile(subprojectId: number, file: File, user: UserRow, uploadSection: DriveUploadSection = "files") {
  const supabase = adminClient();
  assertAllowedUploadFile(file, uploadSection);

  const {
    connection,
    accessToken,
    folderRowId,
    folderId,
    folderName,
    folderYear,
    operatingUnit,
    ipoName,
    subprojectName,
    moduleFolderId,
    yearFolderId,
    operatingUnitFolderId,
    ipoFolderId
  } = await ensureSubprojectFolder(subprojectId, user);

  const uploadFolder = await ensureUploadSectionFolder(
    accessToken,
    "subproject_drive_folders",
    folderRowId,
    folderId,
    uploadSection
  );
  const uploadedFile = await uploadMultipartFile(accessToken, file, uploadFolder.id);
  let previewPermission: DrivePermissionResponse | null = null;
  try {
    previewPermission = await grantPreviewPermission(accessToken, uploadedFile.id);
  } catch (error) {
    await deleteDriveFile(accessToken, uploadedFile.id);
    throw error;
  }

  const row = {
    subproject_id: subprojectId,
    connection_id: connection.id,
    folder_id: uploadFolder.id,
    folder_name: folderName,
    module: SUBPROJECT_DRIVE_MODULE,
    folder_year: folderYear,
    operating_unit: operatingUnit,
    ipo_name: ipoName,
    subproject_name: subprojectName,
    module_folder_id: moduleFolderId,
    year_folder_id: yearFolderId,
    operating_unit_folder_id: operatingUnitFolderId,
    ipo_folder_id: ipoFolderId,
    upload_section: uploadSection,
    file_id: uploadedFile.id,
    file_name: uploadedFile.name || file.name,
    mime_type: uploadedFile.mimeType || file.type || "application/octet-stream",
    file_size: Number(uploadedFile.size || file.size || 0),
    web_view_link: uploadedFile.webViewLink ?? null,
    web_content_link: uploadedFile.webContentLink ?? null,
    preview_url: getPreviewUrl(uploadedFile.id),
    preview_supported: true,
    preview_permission_id: previewPermission?.id ?? null,
    preview_permission_type: previewPermission?.type ?? "anyone",
    uploaded_by: user.id,
    uploaded_by_name: displayUserName(user)
  };

  const { data, error } = await supabase.from("subproject_drive_files").insert(row).select("*").single();
  if (error) {
    await deleteDriveFile(accessToken, uploadedFile.id);
    throw new Error(UPLOAD_RECORD_ERROR);
  }

  return data;
}

export async function deleteSubprojectFile(fileRowId: number, user: UserRow) {
  const supabase = adminClient();
  const { data: fileRow, error: fileError } = await supabase
    .from("subproject_drive_files")
    .select("*")
    .eq("id", fileRowId)
    .is("deleted_at", null)
    .maybeSingle();
  if (fileError) throw new Error(fileError.message);
  if (!fileRow) throw new Error("Subproject Drive file was not found.");

  const { accessToken } = await connectedDrive();
  await deleteDriveFile(accessToken, fileRow.file_id);

  const deletedAt = new Date().toISOString();
  const { data, error } = await supabase
    .from("subproject_drive_files")
    .update({
      deleted_at: deletedAt,
      deleted_by: user.id,
      deleted_by_name: displayUserName(user)
    })
    .eq("id", fileRowId)
    .select("*")
    .single();
  if (error) throw new Error(error.message);

  return data;
}

export async function listActivityFiles(activityId: number) {
  const { data, error } = await adminClient()
    .from("activity_drive_files")
    .select("*")
    .eq("activity_id", activityId)
    .is("deleted_at", null)
    .order("uploaded_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data || [];
}

export async function uploadActivityFile(activityId: number, file: File, user: UserRow, uploadSection: DriveUploadSection = "files") {
  const supabase = adminClient();
  assertAllowedUploadFile(file, uploadSection);

  const {
    connection,
    accessToken,
    folderRowId,
    folderId,
    folderName,
    folderYear,
    operatingUnit,
    component,
    activityName,
    activityType,
    moduleFolderId,
    yearFolderId,
    operatingUnitFolderId,
    componentFolderId
  } = await ensureActivityFolder(activityId, user);

  const uploadFolder = await ensureUploadSectionFolder(
    accessToken,
    "activity_drive_folders",
    folderRowId,
    folderId,
    uploadSection
  );
  const uploadedFile = await uploadMultipartFile(accessToken, file, uploadFolder.id);
  let previewPermission: DrivePermissionResponse | null = null;
  try {
    previewPermission = await grantPreviewPermission(accessToken, uploadedFile.id);
  } catch (error) {
    await deleteDriveFile(accessToken, uploadedFile.id);
    throw error;
  }

  const row = {
    activity_id: activityId,
    connection_id: connection.id,
    folder_id: uploadFolder.id,
    folder_name: folderName,
    module: ACTIVITY_DRIVE_MODULE,
    folder_year: folderYear,
    operating_unit: operatingUnit,
    component,
    activity_name: activityName,
    activity_type: activityType,
    module_folder_id: moduleFolderId,
    year_folder_id: yearFolderId,
    operating_unit_folder_id: operatingUnitFolderId,
    component_folder_id: componentFolderId,
    upload_section: uploadSection,
    file_id: uploadedFile.id,
    file_name: uploadedFile.name || file.name,
    mime_type: uploadedFile.mimeType || file.type || "application/octet-stream",
    file_size: Number(uploadedFile.size || file.size || 0),
    web_view_link: uploadedFile.webViewLink ?? null,
    web_content_link: uploadedFile.webContentLink ?? null,
    preview_url: getPreviewUrl(uploadedFile.id),
    preview_supported: true,
    preview_permission_id: previewPermission?.id ?? null,
    preview_permission_type: previewPermission?.type ?? "anyone",
    uploaded_by: user.id,
    uploaded_by_name: displayUserName(user)
  };

  const { data, error } = await supabase.from("activity_drive_files").insert(row).select("*").single();
  if (error) {
    await deleteDriveFile(accessToken, uploadedFile.id);
    throw new Error(UPLOAD_RECORD_ERROR);
  }

  return data;
}

export async function deleteActivityFile(fileRowId: number, user: UserRow) {
  const supabase = adminClient();
  const { data: fileRow, error: fileError } = await supabase
    .from("activity_drive_files")
    .select("*")
    .eq("id", fileRowId)
    .is("deleted_at", null)
    .maybeSingle();
  if (fileError) throw new Error(fileError.message);
  if (!fileRow) throw new Error("Activity Drive file was not found.");

  const { accessToken } = await connectedDrive();
  await deleteDriveFile(accessToken, fileRow.file_id);

  const deletedAt = new Date().toISOString();
  const { data, error } = await supabase
    .from("activity_drive_files")
    .update({
      deleted_at: deletedAt,
      deleted_by: user.id,
      deleted_by_name: displayUserName(user)
    })
    .eq("id", fileRowId)
    .select("*")
    .single();
  if (error) throw new Error(error.message);

  return data;
}
