import { supabase } from '../supabaseClient';
import { User } from '../constants';

export type DriveUploadSection = 'gallery' | 'files';

export interface DriveMediaFile {
    id: number;
    file_id: string;
    file_name: string;
    display_name?: string | null;
    caption?: string | null;
    upload_section: DriveUploadSection;
    mime_type: string | null;
    file_size: number | null;
    web_view_link: string | null;
    web_content_link: string | null;
    preview_url?: string | null;
    preview_supported?: boolean | null;
    uploaded_by: number | null;
    uploaded_by_name: string | null;
    uploaded_at: string;
}

export interface GoogleDriveStatus {
    isConfigured: boolean;
    isConnected: boolean;
    hasConnection?: boolean;
    tokenStatus?: 'valid' | 'expired' | 'not_connected';
    connectionMessage?: string | null;
    accountEmail: string | null;
    connectedAt: string | null;
    rootFolderId: string | null;
    rootFolderName: string;
    missingEnv: string[];
}

export interface IpoDriveFile {
    id: number;
    ipo_id: number;
    folder_id: string;
    module?: string | null;
    folder_year?: number | null;
    operating_unit?: string | null;
    module_folder_id?: string | null;
    year_folder_id?: string | null;
    operating_unit_folder_id?: string | null;
    file_id: string;
    file_name: string;
    display_name?: string | null;
    caption?: string | null;
    upload_section: DriveUploadSection;
    mime_type: string | null;
    file_size: number | null;
    web_view_link: string | null;
    web_content_link: string | null;
    preview_url?: string | null;
    preview_supported?: boolean | null;
    preview_permission_id?: string | null;
    preview_permission_type?: string | null;
    uploaded_by: number | null;
    uploaded_by_name: string | null;
    uploaded_at: string;
}

export interface SubprojectDriveFile {
    id: number;
    subproject_id: number;
    folder_id: string;
    folder_name: string;
    module?: string | null;
    folder_year?: number | null;
    operating_unit: string;
    ipo_name: string;
    subproject_name: string;
    module_folder_id?: string | null;
    year_folder_id?: string | null;
    operating_unit_folder_id?: string | null;
    ipo_folder_id?: string | null;
    file_id: string;
    file_name: string;
    display_name?: string | null;
    caption?: string | null;
    upload_section: DriveUploadSection;
    mime_type: string | null;
    file_size: number | null;
    web_view_link: string | null;
    web_content_link: string | null;
    preview_url?: string | null;
    preview_supported?: boolean | null;
    preview_permission_id?: string | null;
    preview_permission_type?: string | null;
    uploaded_by: number | null;
    uploaded_by_name: string | null;
    uploaded_at: string;
}

export interface ActivityDriveFile {
    id: number;
    activity_id: number;
    folder_id: string;
    folder_name: string;
    module?: string | null;
    folder_year?: number | null;
    operating_unit: string;
    component: string;
    activity_name: string;
    activity_type?: string | null;
    module_folder_id?: string | null;
    year_folder_id?: string | null;
    operating_unit_folder_id?: string | null;
    component_folder_id?: string | null;
    file_id: string;
    file_name: string;
    display_name?: string | null;
    caption?: string | null;
    upload_section: DriveUploadSection;
    mime_type: string | null;
    file_size: number | null;
    web_view_link: string | null;
    web_content_link: string | null;
    preview_url?: string | null;
    preview_supported?: boolean | null;
    preview_permission_id?: string | null;
    preview_permission_type?: string | null;
    uploaded_by: number | null;
    uploaded_by_name: string | null;
    uploaded_at: string;
}

export const ALLOWED_IPO_DRIVE_FILE_TYPES = [
    'application/pdf',
    'application/msword',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'image/gif',
    'image/jpeg',
    'image/png',
    'image/webp'
];

export const IPO_DRIVE_FILE_ACCEPT = [
    '.pdf',
    '.doc',
    '.docx',
    '.ppt',
    '.pptx',
    '.png',
    '.jpg',
    '.jpeg',
    '.webp',
    '.gif',
    ...ALLOWED_IPO_DRIVE_FILE_TYPES
].join(',');
export const SUBPROJECT_DRIVE_FILE_ACCEPT = IPO_DRIVE_FILE_ACCEPT;
export const ACTIVITY_DRIVE_FILE_ACCEPT = IPO_DRIVE_FILE_ACCEPT;
export const DRIVE_GALLERY_IMAGE_ACCEPT = '.png,.jpg,.jpeg,.webp,.gif,image/png,image/jpeg,image/webp,image/gif';

const ALLOWED_IPO_DRIVE_EXTENSIONS = ['.doc', '.docx', '.gif', '.jpeg', '.jpg', '.pdf', '.png', '.ppt', '.pptx', '.webp'];
const IMAGE_DRIVE_MIME_TYPES = ['image/gif', 'image/jpeg', 'image/png', 'image/webp'];
const IMAGE_DRIVE_EXTENSIONS = ['.gif', '.jpeg', '.jpg', '.png', '.webp'];

export const isAllowedIpoDriveFile = (file: File) => {
    const mimeType = file.type?.toLowerCase();
    if (mimeType && ALLOWED_IPO_DRIVE_FILE_TYPES.includes(mimeType)) return true;
    const name = file.name.toLowerCase();
    return ALLOWED_IPO_DRIVE_EXTENSIONS.some(extension => name.endsWith(extension));
};

export const isAllowedSubprojectDriveFile = isAllowedIpoDriveFile;
export const isAllowedActivityDriveFile = isAllowedIpoDriveFile;

export const isAllowedDriveGalleryImage = (file: File) => {
    const mimeType = file.type?.toLowerCase();
    if (mimeType && IMAGE_DRIVE_MIME_TYPES.includes(mimeType)) return true;
    const name = file.name.toLowerCase();
    return IMAGE_DRIVE_EXTENSIONS.some(extension => name.endsWith(extension));
};

export const getDriveFileDisplayName = (file: Pick<DriveMediaFile, 'display_name' | 'file_name'>) => {
    return file.display_name?.trim() || file.file_name;
};

export const canPreviewIpoDriveFile = (file: Pick<IpoDriveFile, 'mime_type' | 'file_name' | 'preview_supported'>) => {
    if (file.preview_supported === false) return false;
    const mimeType = file.mime_type?.toLowerCase() || '';
    const isOfficeDocument = /(?:msword|wordprocessingml|ms-powerpoint|presentationml)/.test(mimeType)
        || /\.(?:docx?|pptx?)$/i.test(file.file_name);
    if (isOfficeDocument) return file.preview_supported === true;
    if (ALLOWED_IPO_DRIVE_FILE_TYPES.includes(mimeType)) return true;
    const name = file.file_name.toLowerCase();
    return ALLOWED_IPO_DRIVE_EXTENSIONS.some(extension => name.endsWith(extension));
};

export const canPreviewSubprojectDriveFile = (file: Pick<SubprojectDriveFile, 'mime_type' | 'file_name' | 'preview_supported'>) => {
    return canPreviewIpoDriveFile(file);
};

export const canPreviewActivityDriveFile = (file: Pick<ActivityDriveFile, 'mime_type' | 'file_name' | 'preview_supported'>) => {
    return canPreviewIpoDriveFile(file);
};

export const getIpoDrivePreviewUrl = (file: Pick<IpoDriveFile, 'file_id' | 'preview_url'>) => {
    return file.preview_url || `https://drive.google.com/file/d/${encodeURIComponent(file.file_id)}/preview`;
};

export const isIpoDriveImageFile = (file: Pick<IpoDriveFile, 'mime_type' | 'file_name' | 'preview_supported'>) => {
    if (file.preview_supported === false) return false;
    const mimeType = file.mime_type?.toLowerCase() || '';
    if (IMAGE_DRIVE_MIME_TYPES.includes(mimeType)) return true;
    const name = file.file_name.toLowerCase();
    return IMAGE_DRIVE_EXTENSIONS.some(extension => name.endsWith(extension));
};

export const isSubprojectDriveImageFile = (file: Pick<SubprojectDriveFile, 'mime_type' | 'file_name' | 'preview_supported'>) => {
    return isIpoDriveImageFile(file);
};

export const isActivityDriveImageFile = (file: Pick<ActivityDriveFile, 'mime_type' | 'file_name' | 'preview_supported'>) => {
    return isIpoDriveImageFile(file);
};

export const getIpoDriveImageUrl = (file: Pick<IpoDriveFile, 'file_id'>, size = 1000) => {
    return `https://drive.google.com/thumbnail?id=${encodeURIComponent(file.file_id)}&sz=w${size}`;
};

export const getSubprojectDriveImageUrl = (file: Pick<SubprojectDriveFile, 'file_id'>, size = 1000) => {
    return getIpoDriveImageUrl(file, size);
};

export const getSubprojectDrivePreviewUrl = (file: Pick<SubprojectDriveFile, 'file_id' | 'preview_url'>) => {
    return file.preview_url || `https://drive.google.com/file/d/${encodeURIComponent(file.file_id)}/preview`;
};

export const getActivityDriveImageUrl = (file: Pick<ActivityDriveFile, 'file_id'>, size = 1000) => {
    return getIpoDriveImageUrl(file, size);
};

export const getActivityDrivePreviewUrl = (file: Pick<ActivityDriveFile, 'file_id' | 'preview_url'>) => {
    return file.preview_url || `https://drive.google.com/file/d/${encodeURIComponent(file.file_id)}/preview`;
};

const requireSupabase = () => {
    if (!supabase) {
        throw new Error('Supabase is not configured.');
    }
    return supabase;
};

const currentUserPayload = (currentUser: User | null) => {
    if (!currentUser?.id) {
        throw new Error('A current user session is required.');
    }
    return { user_id: currentUser.id };
};

const readFunctionErrorMessage = async (error: any) => {
    const fallback = error?.message || 'Supabase Edge Function request failed.';
    const response = error?.context;

    if (response && typeof response.clone === 'function') {
        try {
            const payload = await response.clone().json();
            if (payload?.error && typeof payload.error === 'string') return payload.error;
            if (payload?.message && typeof payload.message === 'string') return payload.message;
        } catch {
            // Supabase function errors may not always contain a JSON body.
        }
    }

    return fallback;
};

const readFunctionResult = async <T>(data: T | null, error: any): Promise<T> => {
    if (error) {
        throw new Error(await readFunctionErrorMessage(error));
    }
    if (!data) {
        throw new Error('Supabase Edge Function returned no data.');
    }
    return data;
};

export const getGoogleDriveStatus = async (currentUser: User | null) => {
    const { data, error } = await requireSupabase().functions.invoke<GoogleDriveStatus>('google-drive-status', {
        body: currentUserPayload(currentUser)
    });
    return readFunctionResult(data, error);
};

export const startGoogleDriveConnection = async (currentUser: User | null) => {
    const { data, error } = await requireSupabase().functions.invoke<{ authUrl: string }>('google-drive-connect-start', {
        body: currentUserPayload(currentUser)
    });
    return (await readFunctionResult(data, error)).authUrl;
};

export const disconnectGoogleDrive = async (currentUser: User | null) => {
    const { data, error } = await requireSupabase().functions.invoke<{ message: string }>('google-drive-disconnect', {
        body: currentUserPayload(currentUser)
    });
    return readFunctionResult(data, error);
};

export const listIpoDriveFiles = async (currentUser: User | null, ipoId: number) => {
    const { data, error } = await requireSupabase().functions.invoke<{ files: IpoDriveFile[] }>('ipo-drive-files-list', {
        body: { ...currentUserPayload(currentUser), ipo_id: ipoId }
    });
    return (await readFunctionResult(data, error)).files;
};

export const uploadIpoDriveFile = async (currentUser: User | null, ipoId: number, file: File, uploadSection: DriveUploadSection = 'files') => {
    const formData = new FormData();
    formData.append('user_id', String(currentUserPayload(currentUser).user_id));
    formData.append('ipo_id', String(ipoId));
    formData.append('upload_section', uploadSection);
    formData.append('file', file);

    const { data, error } = await requireSupabase().functions.invoke<{ file: IpoDriveFile }>('ipo-drive-file-upload', {
        body: formData
    });
    return (await readFunctionResult(data, error)).file;
};

export const updateIpoDriveFileMetadata = async (currentUser: User | null, fileRowId: number, displayName: string, caption: string) => {
    const { data, error } = await requireSupabase().functions.invoke<{ file: IpoDriveFile }>('ipo-drive-file-update', {
        body: { ...currentUserPayload(currentUser), file_row_id: fileRowId, display_name: displayName, caption }
    });
    return (await readFunctionResult(data, error)).file;
};

export const deleteIpoDriveFile = async (currentUser: User | null, fileRowId: number) => {
    const { data, error } = await requireSupabase().functions.invoke<{ file: IpoDriveFile }>('ipo-drive-file-delete', {
        body: { ...currentUserPayload(currentUser), file_row_id: fileRowId }
    });
    return (await readFunctionResult(data, error)).file;
};

export const listSubprojectDriveFiles = async (currentUser: User | null, subprojectId: number) => {
    const { data, error } = await requireSupabase().functions.invoke<{ files: SubprojectDriveFile[] }>('subproject-drive-files-list', {
        body: { ...currentUserPayload(currentUser), subproject_id: subprojectId }
    });
    return (await readFunctionResult(data, error)).files;
};

export const uploadSubprojectDriveFile = async (currentUser: User | null, subprojectId: number, file: File, uploadSection: DriveUploadSection = 'files') => {
    const formData = new FormData();
    formData.append('user_id', String(currentUserPayload(currentUser).user_id));
    formData.append('subproject_id', String(subprojectId));
    formData.append('upload_section', uploadSection);
    formData.append('file', file);

    const { data, error } = await requireSupabase().functions.invoke<{ file: SubprojectDriveFile }>('subproject-drive-file-upload', {
        body: formData
    });
    return (await readFunctionResult(data, error)).file;
};

export const updateSubprojectDriveFileMetadata = async (currentUser: User | null, fileRowId: number, displayName: string, caption: string) => {
    const { data, error } = await requireSupabase().functions.invoke<{ file: SubprojectDriveFile }>('subproject-drive-file-update', {
        body: { ...currentUserPayload(currentUser), file_row_id: fileRowId, display_name: displayName, caption }
    });
    return (await readFunctionResult(data, error)).file;
};

export const deleteSubprojectDriveFile = async (currentUser: User | null, fileRowId: number) => {
    const { data, error } = await requireSupabase().functions.invoke<{ file: SubprojectDriveFile }>('subproject-drive-file-delete', {
        body: { ...currentUserPayload(currentUser), file_row_id: fileRowId }
    });
    return (await readFunctionResult(data, error)).file;
};

export const listActivityDriveFiles = async (currentUser: User | null, activityId: number) => {
    const { data, error } = await requireSupabase().functions.invoke<{ files: ActivityDriveFile[] }>('activity-drive-files-list', {
        body: { ...currentUserPayload(currentUser), activity_id: activityId }
    });
    return (await readFunctionResult(data, error)).files;
};

export const uploadActivityDriveFile = async (currentUser: User | null, activityId: number, file: File, uploadSection: DriveUploadSection = 'files') => {
    const formData = new FormData();
    formData.append('user_id', String(currentUserPayload(currentUser).user_id));
    formData.append('activity_id', String(activityId));
    formData.append('upload_section', uploadSection);
    formData.append('file', file);

    const { data, error } = await requireSupabase().functions.invoke<{ file: ActivityDriveFile }>('activity-drive-file-upload', {
        body: formData
    });
    return (await readFunctionResult(data, error)).file;
};

export const updateActivityDriveFileMetadata = async (currentUser: User | null, fileRowId: number, displayName: string, caption: string) => {
    const { data, error } = await requireSupabase().functions.invoke<{ file: ActivityDriveFile }>('activity-drive-file-update', {
        body: { ...currentUserPayload(currentUser), file_row_id: fileRowId, display_name: displayName, caption }
    });
    return (await readFunctionResult(data, error)).file;
};

export const deleteActivityDriveFile = async (currentUser: User | null, fileRowId: number) => {
    const { data, error } = await requireSupabase().functions.invoke<{ file: ActivityDriveFile }>('activity-drive-file-delete', {
        body: { ...currentUserPayload(currentUser), file_row_id: fileRowId }
    });
    return (await readFunctionResult(data, error)).file;
};

export const formatFileSize = (size?: number | null) => {
    const bytes = Number(size || 0);
    if (!bytes) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    return `${(bytes / Math.pow(1024, index)).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
};
