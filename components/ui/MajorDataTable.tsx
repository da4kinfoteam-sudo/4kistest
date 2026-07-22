import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Copy, Filter, RotateCcw, Search, SlidersHorizontal, Trash2, X } from 'lucide-react';
import { cn } from '../../lib/utils';

export type TableColumnFilters = Record<string, string[]>;

export interface TableFilterField {
    key: string;
    label: string;
    values: string[];
}

interface ColumnFilterDialogProps {
    open: boolean;
    title?: string;
    fields: TableFilterField[];
    filters: TableColumnFilters;
    onApply: (filters: TableColumnFilters) => void;
    onClose: () => void;
}

const normalizeFilters = (filters: TableColumnFilters) => Object.fromEntries(
    Object.entries(filters).filter(([, values]) => values.length > 0)
);

const serializeFilters = (filters: TableColumnFilters) => JSON.stringify(
    Object.entries(normalizeFilters(filters))
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, values]) => [key, [...values].sort()])
);

export const ColumnFilterDialog: React.FC<ColumnFilterDialogProps> = ({
    open,
    title = 'Filter columns',
    fields,
    filters,
    onApply,
    onClose
}) => {
    const titleId = useId();
    const closeRef = useRef<HTMLButtonElement>(null);
    const dialogRef = useRef<HTMLElement>(null);
    const onCloseRef = useRef(onClose);
    const [draft, setDraft] = useState<TableColumnFilters>(filters);
    const filterSignature = serializeFilters(filters);
    const hasChanges = serializeFilters(draft) !== filterSignature;

    useEffect(() => {
        onCloseRef.current = onClose;
    }, [onClose]);

    useEffect(() => {
        if (!open) return;
        setDraft(filters);
        const returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        const focusFrame = window.requestAnimationFrame(() => closeRef.current?.focus());
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                onCloseRef.current();
                return;
            }
            if (event.key !== 'Tab' || !dialogRef.current) return;
            const focusable = (Array.from(dialogRef.current.querySelectorAll(
                'button:not([disabled]), select:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'
            )) as HTMLElement[]).filter(element => !element.hasAttribute('hidden'));
            if (focusable.length === 0) return;
            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
            }
        };
        document.addEventListener('keydown', onKeyDown);
        return () => {
            window.cancelAnimationFrame(focusFrame);
            document.removeEventListener('keydown', onKeyDown);
            returnFocus?.focus();
        };
    }, [filterSignature, open]);

    if (!open) return null;

    const setFieldValue = (key: string, value: string) => setDraft(previous => {
        const next = { ...previous };
        if (value) next[key] = [value];
        else delete next[key];
        return next;
    });

    return (
        <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
            <section
                ref={dialogRef}
                className="modal-card column-filter-dialog"
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                onMouseDown={event => event.stopPropagation()}
            >
                <header className="modal-card__header">
                    <div className="column-filter-dialog__title">
                        <SlidersHorizontal aria-hidden="true" />
                        <h3 id={titleId}>{title}</h3>
                    </div>
                    <button ref={closeRef} type="button" className="modal-card__close" onClick={onClose} aria-label="Close">
                        <X aria-hidden="true" />
                    </button>
                </header>
                <div className="modal-card__body column-filter-dialog__body">
                    {fields.map(field => {
                        const selected = draft[field.key]?.[0] || '';
                        return (
                            <label className="column-filter-field" key={field.key}>
                                <span>{field.label}</span>
                                <select value={selected} onChange={event => setFieldValue(field.key, event.target.value)}>
                                    <option value="">All {field.label}</option>
                                    {field.values.map(value => <option key={value} value={value}>{value || 'Not specified'}</option>)}
                                </select>
                            </label>
                        );
                    })}
                </div>
                <footer className="modal-card__footer column-filter-dialog__actions">
                    <button type="button" className="btn btn-secondary" onClick={() => setDraft({})} disabled={Object.keys(draft).length === 0}><RotateCcw aria-hidden="true" /> Reset</button>
                    <div>
                        <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
                        <button type="button" className="btn btn-primary" disabled={!hasChanges} onClick={() => { onApply(normalizeFilters(draft)); onClose(); }}>Apply filters</button>
                    </div>
                </footer>
            </section>
        </div>
    );
};

interface MajorTableToolbarProps extends React.HTMLAttributes<HTMLDivElement> {
    searchTerm: string;
    onSearchChange: (value: string) => void;
    searchPlaceholder?: string;
    activeFilterCount?: number;
    onOpenFilters: () => void;
    actions?: React.ReactNode;
}

export const MajorTableToolbar: React.FC<MajorTableToolbarProps> = ({
    searchTerm,
    onSearchChange,
    searchPlaceholder = 'Search records...',
    activeFilterCount = 0,
    onOpenFilters,
    actions,
    className,
    ...props
}) => (
    <div className={cn('major-table-toolbar', className)} {...props}>
        <div className="major-table-toolbar__query">
            <label className="major-table-search">
                <Search aria-hidden="true" />
                <span className="sr-only">Search table</span>
                <input type="search" value={searchTerm} onChange={event => onSearchChange(event.target.value)} placeholder={searchPlaceholder} />
            </label>
            <button type="button" className={cn('btn btn-secondary major-table-filter-button', activeFilterCount > 0 && 'is-active')} onClick={onOpenFilters}>
                <Filter aria-hidden="true" />
                <span>Filter</span>
                {activeFilterCount > 0 && <span className="major-table-filter-button__count" aria-label={`${activeFilterCount} active column filters`}>{activeFilterCount}</span>}
            </button>
        </div>
        {actions && <div className="major-table-toolbar__actions">{actions}</div>}
    </div>
);

interface BulkSelectionBarProps {
    intent: 'delete' | 'clone';
    count: number;
    onConfirm: () => void;
    onClear: () => void;
    onCancel: () => void;
}

export const BulkSelectionBar: React.FC<BulkSelectionBarProps> = ({ intent, count, onConfirm, onClear, onCancel }) => (
    <div className={cn('bulk-selection-bar', `bulk-selection-bar--${intent}`)} role="region" aria-label={`${intent} selection mode`}>
        <div className="bulk-selection-bar__summary">
            <span>{count > 0 ? `${count} selected` : `Select rows to ${intent}`}</span>
            {count > 0 && <button type="button" className="btn btn-link" onClick={onClear}>Clear</button>}
        </div>
        <div className="bulk-selection-bar__actions">
            <button type="button" className="btn btn-secondary" onClick={onCancel}><X aria-hidden="true" /> Cancel</button>
            <button type="button" className={cn('btn', intent === 'delete' ? 'btn-danger' : 'btn-primary')} onClick={onConfirm} disabled={count === 0}>
                {intent === 'delete' ? <Trash2 aria-hidden="true" /> : <Copy aria-hidden="true" />}
                {count > 0 ? `${intent === 'delete' ? 'Delete' : 'Clone'} (${count})` : intent === 'delete' ? 'Delete' : 'Clone'}
            </button>
        </div>
    </div>
);

interface SelectionCheckboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
    indeterminate?: boolean;
}

export const SelectionCheckbox: React.FC<SelectionCheckboxProps> = ({ indeterminate = false, className, ...props }) => {
    const ref = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (ref.current) ref.current.indeterminate = indeterminate;
    }, [indeterminate]);

    return <input ref={ref} type="checkbox" className={cn('major-table-checkbox', className)} {...props} />;
};

export const TruncatedTableCell: React.FC<{ value: React.ReactNode; className?: string; fullText?: string }> = ({ value, className, fullText }) => {
    const title = useMemo(() => fullText || (typeof value === 'string' || typeof value === 'number' ? String(value) : undefined), [fullText, value]);
    return <span className={cn('table-cell-truncate', className)} title={title} aria-label={title} tabIndex={title ? 0 : undefined}>{value ?? '—'}</span>;
};
