import React from 'react';
import { AlertTriangle, ChevronDown, ChevronsUpDown, ChevronUp, Filter, Inbox, Info, LoaderCircle } from 'lucide-react';
import { cn } from '../../lib/utils';

type ElementProps<T extends HTMLElement = HTMLDivElement> = React.HTMLAttributes<T>;

interface PageHeaderProps extends ElementProps<HTMLElement> {
    title: React.ReactNode;
    metadata?: React.ReactNode;
    actions?: React.ReactNode;
}

export const PageHeader: React.FC<PageHeaderProps> = ({ title, metadata, actions, className, ...props }) => (
    <header className={cn('page-header', className)} {...props}>
        <div className="page-header__main">
            <h1 className="page-header__title">{title}</h1>
            {metadata && <div className="page-header__meta">{metadata}</div>}
        </div>
        {actions && <div className="page-header__actions">{actions}</div>}
    </header>
);

interface SectionHeadingProps extends ElementProps<HTMLElement> {
    title: React.ReactNode;
    helper?: React.ReactNode;
    actions?: React.ReactNode;
}

export const SectionHeading: React.FC<SectionHeadingProps> = ({ title, helper, actions, className, ...props }) => (
    <header className={cn('section-heading', className)} {...props}>
        <div>
            <h2 className="section-heading__title">{title}</h2>
            {helper && <p className="section-heading__helper">{helper}</p>}
        </div>
        {actions}
    </header>
);

interface SurfaceProps extends ElementProps {
    as?: 'div' | 'section' | 'article';
}

export const ContentCard: React.FC<SurfaceProps> = ({ as: Component = 'section', className, ...props }) => (
    <Component className={cn('content-card', className)} {...props} />
);

export const ChartCard: React.FC<SurfaceProps> = ({ as: Component = 'section', className, ...props }) => (
    <Component className={cn('chart-card', className)} {...props} />
);

export const MapCard: React.FC<SurfaceProps> = ({ as: Component = 'section', className, ...props }) => (
    <Component className={cn('map-card', className)} {...props} />
);

interface FilterToolbarProps extends ElementProps<HTMLElement> {
    actions?: React.ReactNode;
}

export const FilterToolbar: React.FC<FilterToolbarProps> = ({ actions, children, className, ...props }) => (
    <section className={cn('filter-toolbar', className)} aria-label="Filters" {...props}>
        {children}
        {actions && <div className="filter-toolbar__actions">{actions}</div>}
    </section>
);

interface KpiCardProps extends ElementProps<HTMLElement> {
    label: React.ReactNode;
    value: React.ReactNode;
    icon?: React.ReactNode;
    supporting?: React.ReactNode;
    trend?: React.ReactNode;
}

export const KpiCard: React.FC<KpiCardProps> = ({ label, value, icon, supporting, trend, className, ...props }) => (
    <article className={cn('kpi-card', className)} {...props}>
        <div className="kpi-card__header">
            <span>{label}</span>
            {icon && <span className="kpi-card__icon" aria-hidden="true">{icon}</span>}
        </div>
        <strong className="kpi-card__value">{value}</strong>
        {(supporting || trend) && (
            <div className="kpi-card__meta">
                <span>{supporting}</span>
                <span>{trend}</span>
            </div>
        )}
    </article>
);

export const TableShell: React.FC<ElementProps> = ({ className, ...props }) => (
    <div className={cn('table-shell', className)} {...props} />
);

export const TableToolbar: React.FC<ElementProps> = ({ className, ...props }) => (
    <div className={cn('table-toolbar', className)} {...props} />
);

interface FilterableTableHeaderProps extends React.ThHTMLAttributes<HTMLTableCellElement> {
    label: string;
    columnKey: string;
    sortConfig: { key: string; direction: 'ascending' | 'descending' } | null;
    onSort: (key: string, direction: 'ascending' | 'descending') => void;
    filters: string[];
    onFilterChange: (values: string[]) => void;
    uniqueValues: string[];
    isNumeric?: boolean;
}

export const FilterableTableHeader: React.FC<FilterableTableHeaderProps> = ({
    label,
    columnKey,
    sortConfig,
    onSort,
    filters = [],
    onFilterChange,
    uniqueValues = [],
    isNumeric = false,
    className,
    ...props
}) => {
    const [isOpen, setIsOpen] = React.useState(false);
    const [searchTerm, setSearchTerm] = React.useState('');
    const menuRef = React.useRef<HTMLDivElement>(null);
    const menuId = React.useId();

    React.useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) setIsOpen(false);
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const filteredValues = uniqueValues.filter(value => value.toLowerCase().includes(searchTerm.toLowerCase()));
    const isSorted = sortConfig?.key === columnKey;
    const isFiltered = filters.length > 0;
    const toggleFilter = (value: string) => onFilterChange(
        filters.includes(value) ? filters.filter(filter => filter !== value) : [...filters, value]
    );

    return (
        <th className={cn('data-table-filter-head', className)} {...props}>
            <button
                type="button"
                className="data-table-filter-head__trigger"
                aria-expanded={isOpen}
                aria-controls={menuId}
                onClick={() => setIsOpen(open => !open)}
            >
                <span>{label}</span>
                {isSorted && (sortConfig.direction === 'ascending'
                    ? <ChevronUp className="data-table-filter-head__sort" aria-label="Sorted ascending" />
                    : <ChevronDown className="data-table-filter-head__sort" aria-label="Sorted descending" />)}
                <span className={cn('data-table-filter-head__filter', isFiltered && 'is-active')}>
                    <Filter aria-hidden="true" />
                </span>
            </button>

            {isOpen && (
                <div ref={menuRef} id={menuId} className="data-table-filter-menu">
                    <div className="data-table-filter-menu__sorts">
                        <button type="button" onClick={() => { onSort(columnKey, 'ascending'); setIsOpen(false); }}>
                            <ChevronUp aria-hidden="true" /> Sort ascending
                        </button>
                        <button type="button" onClick={() => { onSort(columnKey, 'descending'); setIsOpen(false); }}>
                            <ChevronDown aria-hidden="true" /> Sort descending
                        </button>
                    </div>
                    {!isNumeric && (
                        <>
                            <div className="data-table-filter-menu__search">
                                <input
                                    type="search"
                                    placeholder={`Search ${label}...`}
                                    value={searchTerm}
                                    onChange={event => setSearchTerm(event.target.value)}
                                    className="form-control form-control--compact"
                                    aria-label={`Search ${label} filter values`}
                                />
                            </div>
                            <div className="data-table-filter-menu__options">
                                <label className="data-table-filter-option">
                                    <input type="checkbox" checked={filters.length === 0} onChange={() => onFilterChange([])} />
                                    <span>(Select all)</span>
                                </label>
                                {filteredValues.map(value => (
                                    <label key={value} className="data-table-filter-option">
                                        <input type="checkbox" checked={filters.includes(value)} onChange={() => toggleFilter(value)} />
                                        <span title={value}>{value}</span>
                                    </label>
                                ))}
                            </div>
                            <div className="data-table-filter-menu__actions">
                                <button type="button" className="btn btn-ghost btn-compact" onClick={() => onFilterChange([])}>Clear</button>
                                <button type="button" className="btn btn-primary btn-compact" onClick={() => setIsOpen(false)}>Done</button>
                            </div>
                        </>
                    )}
                </div>
            )}
        </th>
    );
};

interface SortableTableHeaderProps extends React.ThHTMLAttributes<HTMLTableCellElement> {
    label: string;
    columnKey: string;
    sortConfig: { key: string; direction: 'ascending' | 'descending' } | null;
    onSort: (key: string) => void;
    tooltip?: string;
}

export const SortableTableHeader: React.FC<SortableTableHeaderProps> = ({
    label,
    columnKey,
    sortConfig,
    onSort,
    tooltip,
    className,
    ...props
}) => {
    const isSorted = sortConfig?.key === columnKey;
    const sortLabel = isSorted
        ? `${label}, sorted ${sortConfig.direction}`
        : `${label}, not sorted`;

    return (
        <th className={cn('data-table-sort-head', className)} aria-sort={isSorted ? sortConfig.direction : 'none'} {...props}>
            <button type="button" className="data-table-sort-head__trigger" onClick={() => onSort(columnKey)} aria-label={sortLabel}>
                <span>{label}</span>
                {tooltip && <Info className="data-table-sort-head__help" aria-label={tooltip} />}
                {isSorted
                    ? sortConfig.direction === 'ascending'
                        ? <ChevronUp aria-hidden="true" />
                        : <ChevronDown aria-hidden="true" />
                    : <ChevronsUpDown aria-hidden="true" />}
            </button>
        </th>
    );
};

interface DataTablePaginationProps extends Omit<ElementProps, 'onChange'> {
    currentPage: number;
    totalPages: number;
    totalItems: number;
    itemsPerPage: number;
    onPageChange: (page: number) => void;
    onItemsPerPageChange: (size: number) => void;
    pageSizeOptions?: number[];
}

export const DataTablePagination: React.FC<DataTablePaginationProps> = ({
    currentPage,
    totalPages,
    totalItems,
    itemsPerPage,
    onPageChange,
    onItemsPerPageChange,
    pageSizeOptions = [10, 20, 50, 100],
    className,
    ...props
}) => {
    const firstItem = totalItems === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1;
    const lastItem = Math.min(currentPage * itemsPerPage, totalItems);
    const safeTotalPages = Math.max(totalPages, 1);

    return (
        <nav className={cn('data-table-pagination', className)} aria-label="Table pagination" {...props}>
            <label className="data-table-pagination__page-size">
                <span>Show</span>
                <select
                    value={itemsPerPage}
                    onChange={event => onItemsPerPageChange(Number(event.target.value))}
                    aria-label="Rows per page"
                >
                    {pageSizeOptions.map(size => <option key={size} value={size}>{size}</option>)}
                </select>
                <span>entries</span>
            </label>
            <div className="data-table-pagination__status">
                <span className="data-table-pagination__full-range">
                    Showing {firstItem} to {lastItem} of {totalItems} entries
                </span>
                <span className="data-table-pagination__compact-range" aria-hidden="true">
                    {firstItem}–{lastItem} of {totalItems}
                </span>
                <div className="data-table-pagination__controls">
                    <button
                        type="button"
                        onClick={() => onPageChange(Math.max(currentPage - 1, 1))}
                        disabled={currentPage <= 1}
                    >
                        Previous
                    </button>
                    <span>{currentPage} / {safeTotalPages}</span>
                    <button
                        type="button"
                        onClick={() => onPageChange(Math.min(currentPage + 1, safeTotalPages))}
                        disabled={currentPage >= safeTotalPages}
                    >
                        Next
                    </button>
                </div>
            </div>
        </nav>
    );
};

interface ConfirmDialogProps {
    title: React.ReactNode;
    description: React.ReactNode;
    confirmLabel?: React.ReactNode;
    cancelLabel?: React.ReactNode;
    tone?: 'danger' | 'primary';
    onConfirm: () => void;
    onCancel: () => void;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
    title,
    description,
    confirmLabel = 'Confirm',
    cancelLabel = 'Cancel',
    tone = 'danger',
    onConfirm,
    onCancel,
}) => {
    const titleId = React.useId();
    const descriptionId = React.useId();

    return (
        <div className="modal-backdrop" role="presentation" onClick={onCancel}>
            <section
                className="modal-card confirm-dialog"
                role="alertdialog"
                aria-modal="true"
                aria-labelledby={titleId}
                aria-describedby={descriptionId}
                onClick={event => event.stopPropagation()}
            >
                <header className="modal-card__header">
                    <h3 id={titleId}>{title}</h3>
                </header>
                <div className="modal-card__body">
                    <p id={descriptionId} className="confirm-dialog__description">{description}</p>
                </div>
                <footer className="modal-card__footer confirm-dialog__actions">
                    <button type="button" className="btn btn-secondary" onClick={onCancel}>{cancelLabel}</button>
                    <button type="button" className={cn('btn', tone === 'danger' ? 'btn-danger' : 'btn-primary')} onClick={onConfirm}>{confirmLabel}</button>
                </footer>
            </section>
        </div>
    );
};

export type StatusTone = 'success' | 'info' | 'warning' | 'danger' | 'neutral';

const successStatuses = new Set(['completed', 'approved', 'on track', 'improved', 'filled', 'connected', 'active']);
const infoStatuses = new Set(['submitted', 'maintained', 'informational', 'ongoing', 'in progress']);
const warningStatuses = new Set(['pending', 'partial', 'needs attention', 'proposed', 'for review']);
const dangerStatuses = new Set(['delayed', 'declined', 'rejected', 'overdue', 'cancelled', 'failed', 'offline']);

export const getStatusTone = (status: React.ReactNode): StatusTone => {
    if (typeof status !== 'string') return 'neutral';
    const normalized = status.trim().toLowerCase();
    if (successStatuses.has(normalized)) return 'success';
    if (infoStatuses.has(normalized)) return 'info';
    if (warningStatuses.has(normalized)) return 'warning';
    if (dangerStatuses.has(normalized)) return 'danger';
    return 'neutral';
};

interface StatusIndicatorProps extends React.HTMLAttributes<HTMLSpanElement> {
    status: React.ReactNode;
    tone?: StatusTone;
    compact?: boolean;
}

export const StatusIndicator: React.FC<StatusIndicatorProps> = ({ status, tone, compact = false, className, ...props }) => {
    const resolvedTone = tone || getStatusTone(status);
    return (
        <span className={cn('status-indicator', `status-indicator--${resolvedTone}`, compact && 'status-indicator--compact', className)} {...props}>
            <span className="status-indicator__dot" aria-hidden="true" />
            <span>{status}</span>
        </span>
    );
};

interface StateProps extends ElementProps {
    title: React.ReactNode;
    message?: React.ReactNode;
    action?: React.ReactNode;
}

const StateLayout: React.FC<StateProps & { icon: React.ReactNode }> = ({ icon, title, message, action, className, ...props }) => (
    <div className={cn('ui-state', className)} {...props}>
        <span className="ui-state__icon" aria-hidden="true">{icon}</span>
        <h3 className="ui-state__title">{title}</h3>
        {message && <p className="ui-state__message">{message}</p>}
        {action}
    </div>
);

export const EmptyState: React.FC<StateProps> = props => <StateLayout icon={<Inbox />} {...props} />;

export const ErrorState: React.FC<StateProps> = ({ className, ...props }) => (
    <StateLayout icon={<AlertTriangle />} className={cn('ui-state--error', className)} {...props} />
);

export const LoadingState: React.FC<Omit<StateProps, 'title'> & { title?: React.ReactNode }> = ({ title = 'Loading', ...props }) => (
    <StateLayout icon={<LoaderCircle className="ui-state__spinner" />} title={title} aria-live="polite" {...props} />
);

interface LoadingSkeletonProps extends ElementProps {
    width?: string | number;
    height?: string | number;
}

export const LoadingSkeleton: React.FC<LoadingSkeletonProps> = ({ width, height, style, className, ...props }) => (
    <span
        className={cn('loading-skeleton', className)}
        style={{ width, height, display: 'block', ...style }}
        aria-hidden="true"
        {...props}
    />
);
