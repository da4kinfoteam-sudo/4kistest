import { User } from '../constants';
import { IPO_DRIVE_FILE_ACCEPT, formatFileSize, isAllowedIpoDriveFile } from './googleDriveStorage';
import { supabase } from '../supabaseClient';

export interface GadPimmeEvidenceFile {
    id: number;
    assessment_id: number;
    question_key: string;
    file_id: string;
    file_name: string;
    mime_type: string | null;
    file_size: number | null;
    web_view_link: string | null;
    web_content_link: string | null;
    preview_url: string | null;
    uploaded_by: number | null;
    uploaded_by_name: string | null;
    uploaded_at: string;
}

export const GAD_PIMME_EVIDENCE_ACCEPT = IPO_DRIVE_FILE_ACCEPT;
export const isAllowedGadPimmeEvidence = isAllowedIpoDriveFile;
export const formatGadPimmeFileSize = formatFileSize;

const requireClient = () => {
    if (!supabase) throw new Error('Supabase is not configured.');
    return supabase;
};

const userId = (user: User | null) => {
    if (!user?.id) throw new Error('A current user session is required.');
    return user.id;
};

const result = async <T>(data: T | null, error: any): Promise<T> => {
    if (error) {
        const response = error?.context;
        if (response?.clone) {
            try {
                const payload = await response.clone().json();
                throw new Error(payload?.error || payload?.message || error.message);
            } catch (parseError) {
                if (parseError instanceof Error && parseError.message !== 'Unexpected end of JSON input') throw parseError;
            }
        }
        throw new Error(error?.message || 'Evidence request failed.');
    }
    if (!data) throw new Error('Evidence request returned no data.');
    return data;
};

export const listGadPimmeEvidence = async (user: User | null, operatingUnit: string, year: number, questionKey: string) => {
    const { data, error } = await requireClient().functions.invoke<{ files: GadPimmeEvidenceFile[] }>('gad-pimme-files-list', {
        body: { user_id: userId(user), operating_unit: operatingUnit, year, question_key: questionKey },
    });
    return (await result(data, error)).files;
};

export const uploadGadPimmeEvidence = async (user: User | null, operatingUnit: string, year: number, questionKey: string, file: File) => {
    const form = new FormData();
    form.append('user_id', String(userId(user)));
    form.append('operating_unit', operatingUnit);
    form.append('year', String(year));
    form.append('question_key', questionKey);
    form.append('file', file);
    const { data, error } = await requireClient().functions.invoke<{ file: GadPimmeEvidenceFile }>('gad-pimme-file-upload', { body: form });
    return (await result(data, error)).file;
};

export const deleteGadPimmeEvidence = async (user: User | null, fileRowId: number) => {
    const { data, error } = await requireClient().functions.invoke<{ file: GadPimmeEvidenceFile }>('gad-pimme-file-delete', {
        body: { user_id: userId(user), file_row_id: fileRowId },
    });
    return (await result(data, error)).file;
};

