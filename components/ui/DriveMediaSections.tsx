import React, {
    DragEvent,
    ForwardedRef,
    forwardRef,
    useEffect,
    useImperativeHandle,
    useMemo,
    useRef,
    useState
} from 'react';
import {
    Check,
    ChevronLeft,
    ChevronRight,
    Download,
    ExternalLink,
    Eye,
    FileText,
    GalleryHorizontal,
    Image as ImageIcon,
    LayoutGrid,
    List,
    Loader2,
    Pencil,
    RefreshCw,
    Trash2,
    UploadCloud,
    X
} from 'lucide-react';
import {
    DRIVE_GALLERY_IMAGE_ACCEPT,
    DriveMediaFile,
    DriveUploadSection,
    formatFileSize,
    getDriveFileDisplayName,
    IPO_DRIVE_FILE_ACCEPT,
    isAllowedDriveGalleryImage,
    isAllowedIpoDriveFile
} from '../../lib/googleDriveStorage';

export type GalleryViewMode = 'thumbnail' | 'list' | 'carousel';
type UploadStatus = 'queued' | 'uploading' | 'completed' | 'failed';

interface UploadQueueItem {
    id: string;
    file: File;
    status: UploadStatus;
    error?: string;
}

interface DriveUploadState {
    hasQueuedFiles: boolean;
    hasFiles: boolean;
    isUploading: boolean;
}

export interface DriveUploadDropzoneHandle {
    clearQueue: () => void;
    uploadQueued: () => Promise<void>;
}

interface DriveUploadDropzoneProps<TFile extends DriveMediaFile> {
    section: DriveUploadSection;
    canUpload: boolean;
    isConnected: boolean;
    uploadFile: (file: File, section: DriveUploadSection) => Promise<TFile>;
    onUploaded: (file: TFile) => void;
    onBatchComplete?: (message: string, hasErrors: boolean) => void;
    onStateChange?: (state: DriveUploadState) => void;
    autoUpload?: boolean;
}

interface DriveUploadModalProps<TFile extends DriveMediaFile> {
    section: DriveUploadSection;
    title: string;
    description: string;
    canUpload: boolean;
    isConnected: boolean;
    uploadFile: (file: File, section: DriveUploadSection) => Promise<TFile>;
    onUploaded: (file: TFile) => void;
    onBatchComplete?: (message: string, hasErrors: boolean) => void;
    onClose: () => void;
}

const fileFingerprint = (file: File) => `${file.name.toLowerCase()}::${file.size}::${file.lastModified}`;

const getSafeUploadErrorMessage = (error: unknown) => {
    const message = error instanceof Error ? error.message : String(error || '');
    if (/duplicate key|unique constraint|sqlstate|postgres|postgrest|pgrst\d*/i.test(message)) {
        return 'The upload folder could not be prepared. Refresh the section and try again.';
    }
    return message || 'Upload failed.';
};

const formatUploadedAt = (value?: string | null) => {
    if (!value) return 'Unknown date';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
};

const DriveUploadDropzoneInner = <TFile extends DriveMediaFile>(
    {
        section,
        canUpload,
        isConnected,
        uploadFile,
        onUploaded,
        onBatchComplete,
        onStateChange,
        autoUpload = true
    }: DriveUploadDropzoneProps<TFile>,
    ref: ForwardedRef<DriveUploadDropzoneHandle>
) => {
    const inputRef = useRef<HTMLInputElement>(null);
    const queueRef = useRef<UploadQueueItem[]>([]);
    const [isDragging, setIsDragging] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const [queue, setQueue] = useState<UploadQueueItem[]>([]);
    const [summary, setSummary] = useState<{ message: string; hasErrors: boolean } | null>(null);
    const isGallery = section === 'gallery';
    const disabled = !canUpload || !isConnected || isUploading;

    const replaceQueue = (updater: UploadQueueItem[] | ((current: UploadQueueItem[]) => UploadQueueItem[])) => {
        setQueue(current => {
            const next = typeof updater === 'function' ? updater(current) : updater;
            queueRef.current = next;
            return next;
        });
    };

    const updateQueueItem = (id: string, patch: Partial<UploadQueueItem>) => {
        replaceQueue(current => current.map(item => item.id === id ? { ...item, ...patch } : item));
    };

    const uploadQueueItems = async (items: UploadQueueItem[], initialFailed = 0) => {
        if (disabled || items.length === 0) return;
        setIsUploading(true);
        setSummary(null);

        let cursor = 0;
        let completed = 0;
        let failed = initialFailed;

        const uploadQueueItem = async (item: UploadQueueItem) => {
            updateQueueItem(item.id, { status: 'uploading', error: undefined });
            try {
                const uploaded = await uploadFile(item.file, section);
                onUploaded(uploaded);
                completed += 1;
                updateQueueItem(item.id, { status: 'completed' });
                return true;
            } catch (error) {
                failed += 1;
                updateQueueItem(item.id, { status: 'failed', error: getSafeUploadErrorMessage(error) });
                return false;
            }
        };

        // The first successful request establishes the entity section folders.
        let firstSuccessfulIndex = -1;
        for (let index = 0; index < items.length; index += 1) {
            if (await uploadQueueItem(items[index])) {
                firstSuccessfulIndex = index;
                break;
            }
        }

        const remainingItems = firstSuccessfulIndex >= 0 ? items.slice(firstSuccessfulIndex + 1) : [];
        const worker = async () => {
            while (cursor < remainingItems.length) {
                const item = remainingItems[cursor++];
                await uploadQueueItem(item);
            }
        };

        await Promise.all(Array.from({ length: Math.min(2, remainingItems.length) }, () => worker()));
        setIsUploading(false);
        const result = `${completed} file${completed === 1 ? '' : 's'} uploaded${failed ? `; ${failed} failed or skipped` : ''}.`;
        setSummary({ message: result, hasErrors: failed > 0 });
        onBatchComplete?.(result, failed > 0);
    };

    const stageFiles = (selectedFiles: File[]) => {
        if (disabled || selectedFiles.length === 0) return;
        setSummary(null);

        const queuedFingerprints = new Set(
            queueRef.current
                .filter(item => item.status === 'queued' || item.status === 'uploading')
                .map(item => fileFingerprint(item.file))
        );
        const batchFingerprints = new Set<string>();
        const invalidItems: UploadQueueItem[] = [];
        const validItems: UploadQueueItem[] = [];
        const now = Date.now();

        selectedFiles.forEach((file, index) => {
            const fingerprint = fileFingerprint(file);
            const id = `${fingerprint}::${index}::${now}`;
            if (queuedFingerprints.has(fingerprint) || batchFingerprints.has(fingerprint)) {
                invalidItems.push({ id, file, status: 'failed', error: 'Duplicate ignored in this upload batch.' });
                return;
            }
            batchFingerprints.add(fingerprint);
            const valid = isGallery ? isAllowedDriveGalleryImage(file) : isAllowedIpoDriveFile(file);
            if (!valid) {
                invalidItems.push({
                    id,
                    file,
                    status: 'failed',
                    error: isGallery
                        ? 'Gallery accepts JPG, PNG, WEBP, and GIF images only.'
                        : 'Files accepts images, PDF, Word, and PowerPoint documents only.'
                });
                return;
            }
            validItems.push({ id, file, status: 'queued' });
        });

        replaceQueue(current => [...current.filter(item => item.status === 'uploading'), ...validItems, ...invalidItems]);

        if (validItems.length === 0) {
            const message = `No files added. ${invalidItems.length} file${invalidItems.length === 1 ? '' : 's'} could not be queued.`;
            setSummary({ message, hasErrors: true });
            onBatchComplete?.(message, true);
            return;
        }

        if (autoUpload) void uploadQueueItems(validItems, invalidItems.length);
    };

    useImperativeHandle(ref, () => ({
        clearQueue: () => {
            if (!isUploading) {
                replaceQueue([]);
                setSummary(null);
            }
        },
        uploadQueued: async () => {
            const queuedItems = queueRef.current.filter(item => item.status === 'queued');
            const failedItems = queueRef.current.filter(item => item.status === 'failed');
            await uploadQueueItems(queuedItems, failedItems.length);
        }
    }));

    useEffect(() => {
        onStateChange?.({
            hasQueuedFiles: queue.some(item => item.status === 'queued'),
            hasFiles: queue.length > 0,
            isUploading
        });
    }, [isUploading, onStateChange, queue]);

    const handleDrop = (event: DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        setIsDragging(false);
        if (!disabled) stageFiles(Array.from(event.dataTransfer.files));
    };

    const openFilePicker = () => {
        if (!disabled) inputRef.current?.click();
    };

    return (
        <div className="drive-upload-panel">
            <div
                className={`drive-upload-dropzone${isDragging ? ' drive-upload-dropzone--active' : ''}${disabled ? ' drive-upload-dropzone--disabled' : ''}`}
                onClick={openFilePicker}
                onKeyDown={event => {
                    if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        openFilePicker();
                    }
                }}
                onDragEnter={event => { event.preventDefault(); if (!disabled) setIsDragging(true); }}
                onDragOver={event => event.preventDefault()}
                onDragLeave={event => {
                    const relatedTarget = event.relatedTarget;
                    if (!(relatedTarget instanceof Node) || !event.currentTarget.contains(relatedTarget)) setIsDragging(false);
                }}
                onDrop={handleDrop}
                role="button"
                tabIndex={disabled ? -1 : 0}
                aria-disabled={disabled}
            >
                <span className="drive-upload-dropzone__icon">
                    {isUploading ? <Loader2 className="animate-spin" aria-hidden="true" /> : <UploadCloud aria-hidden="true" />}
                </span>
                <strong>{isGallery ? 'Drop gallery images here, or click to choose' : 'Drop files here, or click to choose'}</strong>
                <span>
                    {!isConnected
                        ? 'Google Drive must be connected before uploading.'
                        : isGallery
                            ? 'JPG, PNG, WEBP, or GIF images'
                            : 'Images, PDF, DOC, DOCX, PPT, or PPTX'}
                </span>
                <input
                    ref={inputRef}
                    type="file"
                    className="hidden"
                    multiple
                    accept={isGallery ? DRIVE_GALLERY_IMAGE_ACCEPT : IPO_DRIVE_FILE_ACCEPT}
                    disabled={disabled}
                    onChange={event => {
                        const selected = Array.from(event.currentTarget.files ?? []) as File[];
                        event.currentTarget.value = '';
                        stageFiles(selected);
                    }}
                />
            </div>
            {queue.length > 0 && (
                <div className="drive-upload-queue custom-scrollbar" aria-live="polite">
                    <div className="drive-upload-queue__header">
                        <span>Upload queue</span>
                        {!isUploading && (
                            <button type="button" className="drive-upload-queue__clear" onClick={() => {
                                replaceQueue([]);
                                setSummary(null);
                            }}>
                                Clear
                            </button>
                        )}
                    </div>
                    {queue.map(item => (
                        <div key={item.id} className={`drive-upload-queue__item drive-upload-queue__item--${item.status}`}>
                            {item.status === 'uploading' && <Loader2 className="animate-spin" aria-hidden="true" />}
                            {item.status === 'completed' && <Check aria-hidden="true" />}
                            {item.status === 'failed' && <X aria-hidden="true" />}
                            {item.status === 'queued' && <FileText aria-hidden="true" />}
                            <div>
                                <strong>{item.file.name}</strong>
                                <span>{item.error || `${formatFileSize(item.file.size)} · ${item.status}`}</span>
                            </div>
                        </div>
                    ))}
                </div>
            )}
            {summary && (
                <p className={`drive-upload-summary${summary.hasErrors ? ' drive-upload-summary--warning' : ''}`} role="status">
                    {summary.message}
                </p>
            )}
        </div>
    );
};

export const DriveUploadDropzone = forwardRef(DriveUploadDropzoneInner) as <TFile extends DriveMediaFile>(
    props: DriveUploadDropzoneProps<TFile> & React.RefAttributes<DriveUploadDropzoneHandle>
) => React.ReactElement;

export function DriveUploadModal<TFile extends DriveMediaFile>({
    section,
    title,
    description,
    canUpload,
    isConnected,
    uploadFile,
    onUploaded,
    onBatchComplete,
    onClose
}: DriveUploadModalProps<TFile>) {
    const uploadRef = useRef<DriveUploadDropzoneHandle>(null);
    const [uploadState, setUploadState] = useState<DriveUploadState>({
        hasQueuedFiles: false,
        hasFiles: false,
        isUploading: false
    });
    const isGallery = section === 'gallery';

    const closeModal = () => {
        if (!uploadState.isUploading) onClose();
    };

    return (
        <div className="drive-media-modal-backdrop" onClick={closeModal}>
            <section
                className="drive-media-modal drive-upload-modal"
                role="dialog"
                aria-modal="true"
                aria-labelledby="drive-upload-modal-title"
                onClick={event => event.stopPropagation()}
            >
                <header className="drive-media-modal__header">
                    <div>
                        <h3 id="drive-upload-modal-title">{title}</h3>
                        <p>{description}</p>
                    </div>
                    <button type="button" className="drive-media-modal__close" onClick={closeModal} disabled={uploadState.isUploading} aria-label="Close upload">
                        <X aria-hidden="true" />
                    </button>
                </header>
                <div className="drive-media-modal__body">
                    <DriveUploadDropzone
                        ref={uploadRef}
                        section={section}
                        canUpload={canUpload}
                        isConnected={isConnected}
                        uploadFile={uploadFile}
                        onUploaded={onUploaded}
                        onBatchComplete={onBatchComplete}
                        onStateChange={setUploadState}
                        autoUpload={false}
                    />
                    <div className="drive-upload-modal__note">
                        <FileText aria-hidden="true" />
                        <p>
                            {isGallery
                                ? 'Gallery accepts supported image files only. You may select or drop multiple images.'
                                : 'Files accepts images, PDF, Word, and PowerPoint documents. You may select or drop multiple files.'}
                        </p>
                    </div>
                </div>
                <footer className="drive-media-modal__footer">
                    <button type="button" className="btn btn-secondary" onClick={closeModal} disabled={uploadState.isUploading}>
                        {uploadState.hasFiles && !uploadState.hasQueuedFiles ? 'Close' : 'Cancel'}
                    </button>
                    <button
                        type="button"
                        className="btn btn-primary"
                        onClick={() => void uploadRef.current?.uploadQueued()}
                        disabled={!uploadState.hasQueuedFiles || uploadState.isUploading || !canUpload || !isConnected}
                    >
                        {uploadState.isUploading ? <Loader2 className="animate-spin" aria-hidden="true" /> : <UploadCloud aria-hidden="true" />}
                        {uploadState.isUploading ? 'Uploading' : 'Upload'}
                    </button>
                </footer>
            </section>
        </div>
    );
}

interface EntityGalleryProps<TFile extends DriveMediaFile> {
    storageKey: string;
    files: TFile[];
    isLoading: boolean;
    canEdit: boolean;
    canDelete: boolean;
    isConnected: boolean;
    getImageUrl: (file: TFile, size?: number) => string;
    uploadFile: (file: File, section: DriveUploadSection) => Promise<TFile>;
    updateMetadata: (file: TFile, displayName: string, caption: string) => Promise<TFile>;
    onFileAdded: (file: TFile) => void;
    onFileUpdated: (file: TFile) => void;
    onRequestDelete: (file: TFile) => void;
    onRefresh: () => void;
    onMessage?: (message: string, hasErrors: boolean) => void;
    showUploader?: boolean;
    showToolbar?: boolean;
    view?: GalleryViewMode;
    onViewChange?: (view: GalleryViewMode) => void;
    itemLimit?: number;
    onViewAll?: () => void;
}

export function GalleryViewToggle({
    view,
    onChange
}: {
    view: GalleryViewMode;
    onChange: (view: GalleryViewMode) => void;
}) {
    return (
        <div className="drive-gallery-view-toggle" role="group" aria-label="Gallery view">
            <button type="button" className={view === 'thumbnail' ? 'is-active' : ''} onClick={() => onChange('thumbnail')} title="Thumbnail view" aria-label="Thumbnail view"><LayoutGrid aria-hidden="true" /></button>
            <button type="button" className={view === 'list' ? 'is-active' : ''} onClick={() => onChange('list')} title="List view" aria-label="List view"><List aria-hidden="true" /></button>
            <button type="button" className={view === 'carousel' ? 'is-active' : ''} onClick={() => onChange('carousel')} title="Carousel view" aria-label="Carousel view"><GalleryHorizontal aria-hidden="true" /></button>
        </div>
    );
}

export function EntityGallery<TFile extends DriveMediaFile>({
    storageKey,
    files,
    isLoading,
    canEdit,
    canDelete,
    isConnected,
    getImageUrl,
    uploadFile,
    updateMetadata,
    onFileAdded,
    onFileUpdated,
    onRequestDelete,
    onRefresh,
    onMessage,
    showUploader = true,
    showToolbar = true,
    view: controlledView,
    onViewChange,
    itemLimit,
    onViewAll
}: EntityGalleryProps<TFile>) {
    const [internalView, setInternalView] = useState<GalleryViewMode>(() => {
        const saved = window.localStorage.getItem(`4kis-gallery-view:${storageKey}`);
        return saved === 'list' || saved === 'carousel' ? saved : 'thumbnail';
    });
    const view = controlledView ?? internalView;
    const setView = (nextView: GalleryViewMode) => {
        setInternalView(nextView);
        onViewChange?.(nextView);
    };
    const [carouselIndex, setCarouselIndex] = useState(0);
    const [previewIndex, setPreviewIndex] = useState<number | null>(null);
    const [displayName, setDisplayName] = useState('');
    const [caption, setCaption] = useState('');
    const [isSavingMetadata, setIsSavingMetadata] = useState(false);
    const [metadataError, setMetadataError] = useState<string | null>(null);
    const [imageFailures, setImageFailures] = useState<Set<number>>(new Set());

    useEffect(() => {
        window.localStorage.setItem(`4kis-gallery-view:${storageKey}`, view);
    }, [storageKey, view]);

    const displayedFiles = useMemo(
        () => typeof itemLimit === 'number' ? files.slice(0, Math.max(0, itemLimit)) : files,
        [files, itemLimit]
    );

    useEffect(() => {
        if (carouselIndex >= displayedFiles.length) setCarouselIndex(Math.max(0, displayedFiles.length - 1));
        if (previewIndex !== null && previewIndex >= displayedFiles.length) {
            setPreviewIndex(displayedFiles.length ? displayedFiles.length - 1 : null);
        }
    }, [carouselIndex, displayedFiles.length, previewIndex]);

    const previous = (index: number) => displayedFiles.length ? (index - 1 + displayedFiles.length) % displayedFiles.length : 0;
    const next = (index: number) => displayedFiles.length ? (index + 1) % displayedFiles.length : 0;
    const carouselFile = displayedFiles[carouselIndex];
    const previewFile = previewIndex === null ? null : displayedFiles[previewIndex];

    const openPreview = (index: number) => {
        const file = displayedFiles[index];
        if (!file) return;
        setPreviewIndex(index);
        setDisplayName(getDriveFileDisplayName(file));
        setCaption(file.caption || '');
        setMetadataError(null);
    };

    const changePreview = (index: number) => {
        const file = displayedFiles[index];
        if (!file) return;
        setPreviewIndex(index);
        setDisplayName(getDriveFileDisplayName(file));
        setCaption(file.caption || '');
        setMetadataError(null);
    };

    const closePreview = () => {
        if (isSavingMetadata) return;
        setPreviewIndex(null);
        setMetadataError(null);
    };

    const saveMetadata = async () => {
        if (!previewFile || !canEdit) return;
        setIsSavingMetadata(true);
        setMetadataError(null);
        try {
            const updated = await updateMetadata(previewFile, displayName, caption);
            onFileUpdated(updated);
            setDisplayName(getDriveFileDisplayName(updated));
            setCaption(updated.caption || '');
            onMessage?.('Gallery image details updated.', false);
        } catch (error: any) {
            const message = error?.message || 'Unable to update Gallery image details.';
            setMetadataError(message);
            onMessage?.(message, true);
        } finally {
            setIsSavingMetadata(false);
        }
    };

    const requestPreviewDelete = () => {
        if (!previewFile || !canDelete) return;
        const file = previewFile;
        setPreviewIndex(null);
        onRequestDelete(file);
    };

    const markImageFailure = (fileId: number) => {
        setImageFailures(current => new Set(current).add(fileId));
    };

    return (
        <div className="drive-media-section">
            {showToolbar && (
                <div className="drive-media-toolbar">
                    <GalleryViewToggle view={view} onChange={setView} />
                    <button type="button" className="btn btn-secondary btn-compact" onClick={onRefresh} disabled={isLoading}>
                        <RefreshCw className={isLoading ? 'animate-spin' : ''} aria-hidden="true" />
                        Refresh
                    </button>
                </div>
            )}

            {canEdit && showUploader && (
                <DriveUploadDropzone
                    section="gallery"
                    canUpload={canEdit}
                    isConnected={isConnected}
                    uploadFile={uploadFile}
                    onUploaded={onFileAdded}
                    onBatchComplete={onMessage}
                />
            )}

            {isLoading ? (
                <div className="drive-file-card__loading"><Loader2 className="animate-spin" aria-hidden="true" /><span>Loading Gallery...</span></div>
            ) : files.length === 0 ? (
                <p className="detail-empty">No Gallery images have been uploaded yet.</p>
            ) : (
                <div className={`drive-media-scroll custom-scrollbar${view === 'carousel' ? ' drive-media-scroll--carousel' : ''}`}>
                    {view === 'thumbnail' && (
                        <div className="drive-gallery-grid">
                            {displayedFiles.map((file, index) => (
                                <button
                                    key={file.id}
                                    type="button"
                                    className="drive-gallery-tile"
                                    onClick={() => openPreview(index)}
                                    title={getDriveFileDisplayName(file)}
                                    aria-label={`Open ${getDriveFileDisplayName(file)}`}
                                >
                                    {!imageFailures.has(file.id) && (
                                        <img
                                            src={getImageUrl(file, 520)}
                                            alt={getDriveFileDisplayName(file)}
                                            loading="lazy"
                                            onError={() => markImageFailure(file.id)}
                                        />
                                    )}
                                    <span className="drive-gallery-tile__fallback"><ImageIcon aria-hidden="true" /></span>
                                    <span className="drive-gallery-tile__overlay">{getDriveFileDisplayName(file)}</span>
                                </button>
                            ))}
                        </div>
                    )}

                    {view === 'list' && (
                        <div className="drive-gallery-list">
                            {displayedFiles.map((file, index) => (
                                <article key={file.id} className="drive-gallery-list__item">
                                    <button type="button" className="drive-gallery-list__open" onClick={() => openPreview(index)} aria-label={`Open ${getDriveFileDisplayName(file)}`}>
                                        <span className="drive-gallery-list__thumb">
                                            {!imageFailures.has(file.id) && (
                                                <img src={getImageUrl(file, 240)} alt="" loading="lazy" onError={() => markImageFailure(file.id)} />
                                            )}
                                            <ImageIcon aria-hidden="true" />
                                        </span>
                                        <span className="drive-gallery-list__copy">
                                            <strong>{getDriveFileDisplayName(file)}</strong>
                                            <span>{formatFileSize(file.file_size)} · Uploaded {formatUploadedAt(file.uploaded_at)}</span>
                                        </span>
                                    </button>
                                    <div className="drive-gallery-list__actions">
                                        {canEdit && (
                                            <button type="button" className="drive-media-icon-button" onClick={() => openPreview(index)} title="Edit image" aria-label={`Edit ${getDriveFileDisplayName(file)}`}>
                                                <Pencil aria-hidden="true" />
                                            </button>
                                        )}
                                        {canDelete && (
                                            <button type="button" className="drive-media-icon-button drive-media-icon-button--danger" onClick={() => onRequestDelete(file)} title="Delete image" aria-label={`Delete ${getDriveFileDisplayName(file)}`}>
                                                <Trash2 aria-hidden="true" />
                                            </button>
                                        )}
                                    </div>
                                </article>
                            ))}
                        </div>
                    )}

                    {view === 'carousel' && carouselFile && (
                        <div className="drive-gallery-carousel">
                            <div className="drive-gallery-carousel__stage">
                                {displayedFiles.length > 1 && (
                                    <button type="button" className="drive-gallery-carousel__nav drive-gallery-carousel__nav--previous" onClick={() => setCarouselIndex(previous(carouselIndex))} aria-label="Previous image">
                                        <ChevronLeft aria-hidden="true" />
                                    </button>
                                )}
                                <button type="button" className="drive-gallery-carousel__image" onClick={() => openPreview(carouselIndex)} aria-label={`Open ${getDriveFileDisplayName(carouselFile)}`}>
                                    {!imageFailures.has(carouselFile.id) ? (
                                        <img src={getImageUrl(carouselFile, 1200)} alt={getDriveFileDisplayName(carouselFile)} onError={() => markImageFailure(carouselFile.id)} />
                                    ) : <ImageIcon aria-hidden="true" />}
                                </button>
                                {displayedFiles.length > 1 && (
                                    <button type="button" className="drive-gallery-carousel__nav drive-gallery-carousel__nav--next" onClick={() => setCarouselIndex(next(carouselIndex))} aria-label="Next image">
                                        <ChevronRight aria-hidden="true" />
                                    </button>
                                )}
                                <div className="drive-gallery-carousel__overlay">
                                    <strong>{getDriveFileDisplayName(carouselFile)}</strong>
                                    <span>{carouselIndex + 1} of {displayedFiles.length}</span>
                                </div>
                            </div>
                            <div className="drive-gallery-carousel__rail custom-scrollbar" aria-label="Gallery thumbnails">
                                {displayedFiles.map((file, index) => (
                                    <button
                                        key={file.id}
                                        type="button"
                                        className={index === carouselIndex ? 'is-active' : ''}
                                        onClick={() => setCarouselIndex(index)}
                                        aria-label={`Show ${getDriveFileDisplayName(file)}`}
                                        aria-current={index === carouselIndex}
                                    >
                                        {!imageFailures.has(file.id) && (
                                            <img src={getImageUrl(file, 180)} alt="" loading="lazy" onError={() => markImageFailure(file.id)} />
                                        )}
                                        <ImageIcon aria-hidden="true" />
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {onViewAll && files.length > displayedFiles.length && (
                <div className="drive-media-section__footer">
                    <span>{displayedFiles.length} of {files.length} items</span>
                    <button type="button" className="ipo-detail-view-all" onClick={onViewAll}>
                        View all
                        <ChevronRight aria-hidden="true" />
                    </button>
                </div>
            )}

            {previewFile && previewIndex !== null && (
                <div className="drive-media-modal-backdrop" onClick={closePreview}>
                    <section
                        className="drive-media-modal drive-gallery-editor"
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="drive-gallery-editor-title"
                        onClick={event => event.stopPropagation()}
                    >
                        <header className="drive-media-modal__header">
                            <div>
                                <h3 id="drive-gallery-editor-title">Gallery Image</h3>
                                <p>{previewIndex + 1} of {displayedFiles.length} · Original Drive filename preserved</p>
                            </div>
                            <button type="button" className="drive-media-modal__close" onClick={closePreview} disabled={isSavingMetadata} aria-label="Close Gallery image">
                                <X aria-hidden="true" />
                            </button>
                        </header>
                        <div className="drive-media-modal__body drive-gallery-editor__body">
                            <div className="drive-gallery-editor__preview">
                                {displayedFiles.length > 1 && (
                                    <button type="button" className="drive-gallery-preview__nav drive-gallery-preview__nav--previous" onClick={() => changePreview(previous(previewIndex))} aria-label="Previous image">
                                        <ChevronLeft aria-hidden="true" />
                                    </button>
                                )}
                                {!imageFailures.has(previewFile.id) ? (
                                    <img src={getImageUrl(previewFile, 1800)} alt={getDriveFileDisplayName(previewFile)} onError={() => markImageFailure(previewFile.id)} />
                                ) : (
                                    <div className="drive-preview-modal__empty"><ImageIcon aria-hidden="true" /><p>Image preview is not available.</p></div>
                                )}
                                {displayedFiles.length > 1 && (
                                    <button type="button" className="drive-gallery-preview__nav drive-gallery-preview__nav--next" onClick={() => changePreview(next(previewIndex))} aria-label="Next image">
                                        <ChevronRight aria-hidden="true" />
                                    </button>
                                )}
                            </div>
                            <div className="drive-gallery-metadata-form">
                                {metadataError && <p className="drive-file-card__message" role="alert">{metadataError}</p>}
                                <label>
                                    <span>Name</span>
                                    <input type="text" value={displayName} maxLength={255} readOnly={!canEdit} onChange={event => setDisplayName(event.target.value)} />
                                </label>
                                <label>
                                    <span>Caption</span>
                                    <textarea value={caption} maxLength={4000} rows={5} readOnly={!canEdit} onChange={event => setCaption(event.target.value)} placeholder={canEdit ? 'Add a caption' : 'No caption'} />
                                </label>
                                <p className="drive-gallery-metadata-form__source">Drive file: {previewFile.file_name}</p>
                            </div>
                        </div>
                        <footer className="drive-media-modal__footer drive-gallery-editor__footer">
                            <div className="drive-gallery-editor__destructive">
                                {canDelete && (
                                    <button type="button" className="btn btn-danger" onClick={requestPreviewDelete} disabled={isSavingMetadata}>
                                        <Trash2 aria-hidden="true" />
                                        Delete
                                    </button>
                                )}
                            </div>
                            <div className="drive-gallery-editor__actions">
                                {previewFile.web_content_link && (
                                    <a className="btn btn-secondary" href={previewFile.web_content_link} target="_blank" rel="noreferrer">
                                        <Download aria-hidden="true" />
                                        Download
                                    </a>
                                )}
                                {previewFile.web_view_link && (
                                    <a className="btn btn-secondary" href={previewFile.web_view_link} target="_blank" rel="noreferrer">
                                        <ExternalLink aria-hidden="true" />
                                        Open
                                    </a>
                                )}
                                <button type="button" className="btn btn-secondary" onClick={closePreview} disabled={isSavingMetadata}>Cancel</button>
                                {canEdit && (
                                    <button type="button" className="btn btn-primary" onClick={() => void saveMetadata()} disabled={isSavingMetadata}>
                                        {isSavingMetadata && <Loader2 className="animate-spin" aria-hidden="true" />}
                                        Save
                                    </button>
                                )}
                            </div>
                        </footer>
                    </section>
                </div>
            )}
        </div>
    );
}

interface EntityFilesListProps<TFile extends DriveMediaFile> {
    files: TFile[];
    isLoading: boolean;
    canEdit: boolean;
    canDelete: boolean;
    isConnected: boolean;
    uploadFile: (file: File, section: DriveUploadSection) => Promise<TFile>;
    onFileAdded: (file: TFile) => void;
    onRequestDelete: (file: TFile) => void;
    onRefresh: () => void;
    onMessage?: (message: string, hasErrors: boolean) => void;
    showUploader?: boolean;
    showToolbar?: boolean;
}

const isOfficeDocument = (file: Pick<DriveMediaFile, 'file_name' | 'mime_type'>) => {
    const mime = file.mime_type?.toLowerCase() || '';
    return /(?:msword|wordprocessingml|ms-powerpoint|presentationml)/.test(mime)
        || /\.(?:docx?|pptx?)$/i.test(file.file_name);
};

export function EntityFilesList<TFile extends DriveMediaFile>({
    files,
    isLoading,
    canEdit,
    canDelete,
    isConnected,
    uploadFile,
    onFileAdded,
    onRequestDelete,
    onRefresh,
    onMessage,
    showUploader = true,
    showToolbar = true
}: EntityFilesListProps<TFile>) {
    const [previewFile, setPreviewFile] = useState<TFile | null>(null);
    const previewUrl = previewFile?.preview_url || (previewFile ? `https://drive.google.com/file/d/${encodeURIComponent(previewFile.file_id)}/preview` : '');
    const canEmbedPreview = (file: TFile) => isOfficeDocument(file)
        ? file.preview_supported === true
        : file.preview_supported !== false;

    return (
        <div className="drive-media-section">
            {showToolbar && (
                <div className="drive-media-toolbar drive-media-toolbar--files">
                    <p>Supporting documents remain separate from the Gallery.</p>
                    <button type="button" className="btn btn-secondary btn-compact" onClick={onRefresh} disabled={isLoading}>
                        <RefreshCw className={isLoading ? 'animate-spin' : ''} aria-hidden="true" />
                        Refresh
                    </button>
                </div>
            )}
            {canEdit && showUploader && (
                <DriveUploadDropzone
                    section="files"
                    canUpload={canEdit}
                    isConnected={isConnected}
                    uploadFile={uploadFile}
                    onUploaded={onFileAdded}
                    onBatchComplete={onMessage}
                />
            )}
            {isLoading ? (
                <div className="drive-file-card__loading"><Loader2 className="animate-spin" aria-hidden="true" /><span>Loading files...</span></div>
            ) : files.length === 0 ? (
                <p className="detail-empty">No files have been uploaded yet.</p>
            ) : (
                <div className="drive-media-scroll drive-media-scroll--files custom-scrollbar">
                    <ul className="drive-files-list">
                        {files.map(file => (
                            <li key={file.id} className="drive-files-list__item">
                                <div className="drive-files-list__file">
                                    <span className="drive-files-list__icon"><FileText aria-hidden="true" /></span>
                                    <div>
                                        <strong>{getDriveFileDisplayName(file)}</strong>
                                        <span>{formatFileSize(file.file_size)} · Uploaded {formatUploadedAt(file.uploaded_at)}</span>
                                    </div>
                                </div>
                                <div className="drive-files-list__actions">
                                    {canEmbedPreview(file) && (
                                        <button type="button" className="drive-media-icon-button" onClick={() => setPreviewFile(file)} title="Preview file" aria-label={`Preview ${getDriveFileDisplayName(file)}`}>
                                            <Eye aria-hidden="true" />
                                        </button>
                                    )}
                                    {file.web_content_link && (
                                        <a className="drive-media-icon-button" href={file.web_content_link} target="_blank" rel="noreferrer" title="Download file" aria-label={`Download ${getDriveFileDisplayName(file)}`}>
                                            <Download aria-hidden="true" />
                                        </a>
                                    )}
                                    {file.web_view_link && (
                                        <a className="drive-media-icon-button" href={file.web_view_link} target="_blank" rel="noreferrer" title="Open in Google Drive" aria-label={`Open ${getDriveFileDisplayName(file)} in Google Drive`}>
                                            <ExternalLink aria-hidden="true" />
                                        </a>
                                    )}
                                    {canDelete && (
                                        <button type="button" className="drive-media-icon-button drive-media-icon-button--danger" onClick={() => onRequestDelete(file)} title="Delete file" aria-label={`Delete ${getDriveFileDisplayName(file)}`}>
                                            <Trash2 aria-hidden="true" />
                                        </button>
                                    )}
                                </div>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
            {previewFile && (
                <div className="drive-media-modal-backdrop" onClick={() => setPreviewFile(null)}>
                    <section className="drive-media-modal drive-file-preview" role="dialog" aria-modal="true" aria-labelledby="drive-file-preview-title" onClick={event => event.stopPropagation()}>
                        <header className="drive-media-modal__header">
                            <div>
                                <h3 id="drive-file-preview-title">{getDriveFileDisplayName(previewFile)}</h3>
                                <p>{formatFileSize(previewFile.file_size)} · {previewFile.mime_type || 'File preview'}</p>
                            </div>
                            <button type="button" className="drive-media-modal__close" onClick={() => setPreviewFile(null)} aria-label="Close file preview"><X aria-hidden="true" /></button>
                        </header>
                        <div className="drive-file-preview__body">
                            <iframe src={previewUrl} title={`Preview ${getDriveFileDisplayName(previewFile)}`} className="drive-file-preview__frame" allow="autoplay" />
                        </div>
                        <footer className="drive-media-modal__footer">
                            <p className="drive-file-preview__note">If the preview does not load, open the file directly in Google Drive.</p>
                            <div className="drive-gallery-editor__actions">
                                {previewFile.web_content_link && <a className="btn btn-secondary" href={previewFile.web_content_link} target="_blank" rel="noreferrer"><Download aria-hidden="true" />Download</a>}
                                {previewFile.web_view_link && <a className="btn btn-secondary" href={previewFile.web_view_link} target="_blank" rel="noreferrer"><ExternalLink aria-hidden="true" />Open in Drive</a>}
                            </div>
                        </footer>
                    </section>
                </div>
            )}
        </div>
    );
}

export const getPersistedDriveUploadSection = (file: Pick<DriveMediaFile, 'upload_section' | 'mime_type' | 'file_name'>): DriveUploadSection => {
    if (file.upload_section === 'gallery' || file.upload_section === 'files') return file.upload_section;
    const mimeType = file.mime_type?.toLowerCase() || '';
    return mimeType.startsWith('image/') || /\.(gif|jpe?g|png|webp)$/i.test(file.file_name) ? 'gallery' : 'files';
};
