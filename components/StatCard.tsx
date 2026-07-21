
import React from 'react';

interface StatCardProps {
    title: string;
    value: string;
    icon: React.ReactNode;
    supportingText?: React.ReactNode;
    onClick?: () => void;
    onToggle?: () => void;
    toggleLabel?: string;
    toggleAriaLabel?: string;
    toggleIcon?: React.ReactNode;
}

const formatCompactNumber = (value: number): string => {
    const tiers = [
        { limit: 1_000_000_000, suffix: 'B' },
        { limit: 1_000_000, suffix: 'M' },
    ];
    const tier = tiers.find(({ limit }) => Math.abs(value) >= limit);

    if (!tier) return String(value);

    const scaled = value / tier.limit;
    const decimals = Math.abs(scaled) >= 10 ? 1 : 2;
    return `${scaled.toFixed(decimals).replace(/\.?0+$/, '')}${tier.suffix}`;
};

const compactStatValue = (rawValue: string): string => {
    const normalized = rawValue.trim();
    const numberMatch = normalized.replace(/,/g, '').match(/-?\d+(\.\d+)?/);

    if (!numberMatch) return rawValue;

    const numericValue = Number(numberMatch[0]);

    if (!Number.isFinite(numericValue) || Math.abs(numericValue) < 1_000_000) {
        return rawValue;
    }

    const originalNumberIndex = normalized.search(/-?\d/);
    const prefix = originalNumberIndex > 0 ? normalized.slice(0, originalNumberIndex) : '';

    return `${prefix}${formatCompactNumber(numericValue)}`;
};

const StatCard: React.FC<StatCardProps> = ({
    title,
    value,
    icon,
    supportingText,
    onClick,
    onToggle,
    toggleLabel,
    toggleAriaLabel,
    toggleIcon,
}) => {
    const displayValue = compactStatValue(value);

    return (
        <article className={`stat-card ${onClick ? 'stat-card--clickable' : ''}`}>
            {onClick && (
                <button
                    type="button"
                    className="stat-card__details"
                    onClick={onClick}
                    aria-label={`${title}: ${value}. Open details.`}
                />
            )}
            <div className="stat-card__top">
                <p className="stat-card__title" title={title}>{title}</p>
                <span className="stat-card__icon" aria-hidden="true">{icon}</span>
            </div>
            <p className="stat-card__value" title={value}>{displayValue}</p>
            {(supportingText || onToggle) && (
                <div className="stat-card__footer">
                    <span className="stat-card__supporting">{supportingText}</span>
                    {onToggle && (
                        <button
                            type="button"
                            onClick={(event) => {
                                event.stopPropagation();
                                onToggle();
                            }}
                            className="stat-card__toggle"
                            title={toggleAriaLabel || 'Switch budget view'}
                            aria-label={toggleAriaLabel || 'Switch budget view'}
                        >
                            {toggleLabel && <span>{toggleLabel}</span>}
                            {toggleIcon || (
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                </svg>
                            )}
                        </button>
                    )}
                </div>
            )}
        </article>
    );
};

export default StatCard;
