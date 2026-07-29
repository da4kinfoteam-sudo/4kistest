import React from 'react';
import { ArrowLeft } from 'lucide-react';
import { cn } from '../../lib/utils';

const compactNumberFormatter = new Intl.NumberFormat('en-PH', {
    notation: 'compact',
    maximumFractionDigits: 1
});

export const formatRecordMetricNumber = (value: number) => (
    Number.isFinite(value) ? compactNumberFormatter.format(value) : '0'
);

export const formatRecordMetricCurrency = (value: number) => (
    `₱${formatRecordMetricNumber(value)}`
);

type ElementProps<T extends HTMLElement = HTMLDivElement> = React.HTMLAttributes<T>;

interface RecordDetailPageProps extends ElementProps {
    children: React.ReactNode;
}

export const RecordDetailPage: React.FC<RecordDetailPageProps> = ({ children, className, ...props }) => (
    <div className={cn('record-detail-page detail-page', className)} {...props}>
        {children}
    </div>
);

interface RecordBackLinkProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    children: React.ReactNode;
}

export const RecordBackLink: React.FC<RecordBackLinkProps> = ({ children, className, ...props }) => (
    <button type="button" className={cn('record-detail-back-link', className)} {...props}>
        <ArrowLeft aria-hidden="true" />
        <span>{children}</span>
    </button>
);

interface RecordHeaderProps extends ElementProps<HTMLElement> {
    title: React.ReactNode;
    metadata?: React.ReactNode;
    actions?: React.ReactNode;
}

export const RecordHeader: React.FC<RecordHeaderProps> = ({
    title,
    metadata,
    actions,
    className,
    ...props
}) => (
    <header className={cn('record-detail-header', className)} {...props}>
        <div className="record-detail-header__main">
            <h1 className="record-detail-header__title">{title}</h1>
            {metadata && <div className="record-detail-header__meta">{metadata}</div>}
        </div>
        {actions && <div className="record-detail-header__actions">{actions}</div>}
    </header>
);

export const RecordKpiGrid: React.FC<ElementProps<HTMLElement>> = ({ children, className, ...props }) => (
    <section className={cn('record-detail-kpi-grid', className)} {...props}>
        {children}
    </section>
);

interface RecordKpiCardProps extends ElementProps<HTMLElement> {
    label: React.ReactNode;
    value: React.ReactNode;
    icon?: React.ReactNode;
    note?: React.ReactNode;
    trend?: React.ReactNode;
    title?: string;
}

export const RecordKpiCard: React.FC<RecordKpiCardProps> = ({
    label,
    value,
    icon,
    note,
    trend,
    title,
    className,
    ...props
}) => (
    <article className={cn('record-detail-kpi', className)} title={title} {...props}>
        <div className="record-detail-kpi__header">
            <span className="record-detail-kpi__label">{label}</span>
            {icon && <span className="record-detail-kpi__icon" aria-hidden="true">{icon}</span>}
        </div>
        <strong className="record-detail-kpi__value">{value}</strong>
        {(note || trend) && (
            <div className="record-detail-kpi__meta">
                <span>{note}</span>
                {trend && <span className="record-detail-kpi__trend">{trend}</span>}
            </div>
        )}
    </article>
);

export const RecordDetailGrid: React.FC<ElementProps> = ({ children, className, ...props }) => (
    <div className={cn('record-detail-grid', className)} {...props}>
        {children}
    </div>
);

export const RecordDetailMain: React.FC<ElementProps> = ({ children, className, ...props }) => (
    <main className={cn('record-detail-main', className)} {...props}>
        {children}
    </main>
);

export const RecordDetailAside: React.FC<ElementProps<HTMLElement>> = ({ children, className, ...props }) => (
    <aside className={cn('record-detail-aside', className)} {...props}>
        {children}
    </aside>
);

interface RecordPanelProps extends ElementProps<HTMLElement> {
    title: React.ReactNode;
    description?: React.ReactNode;
    actions?: React.ReactNode;
    footer?: React.ReactNode;
    bodyClassName?: string;
    children: React.ReactNode;
}

export const RecordPanel: React.FC<RecordPanelProps> = ({
    title,
    description,
    actions,
    footer,
    bodyClassName,
    children,
    className,
    ...props
}) => (
    <section className={cn('record-detail-panel', className)} {...props}>
        <header className="record-detail-panel__header">
            <div className="record-detail-panel__heading">
                <h2>{title}</h2>
                {description && <p>{description}</p>}
            </div>
            {actions && <div className="record-detail-panel__actions">{actions}</div>}
        </header>
        <div className={cn('record-detail-panel__body', bodyClassName)}>{children}</div>
        {footer && <footer className="record-detail-panel__footer">{footer}</footer>}
    </section>
);
