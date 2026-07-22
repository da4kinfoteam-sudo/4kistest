import React, { useEffect, useRef, useState } from 'react';
import { FormattedAmountInput } from '../ui/FormattedAmountInput';
import { MonthYearPicker } from '../ui/MonthYearPicker';

const amountFormatter = new Intl.NumberFormat('en-PH', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const currencyFormatter = new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

const monthNames = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export const normalizeFinancialMonthValue = (value?: string | null, fallbackYear?: string | number) => {
  const rawValue = String(value || '').trim();
  if (!rawValue || rawValue === 'Monthly') return rawValue;

  const canonicalMatch = rawValue.match(/^(\d{4})-(\d{1,2})(?:-(\d{1,2}))?$/);
  if (canonicalMatch) {
    const month = Number(canonicalMatch[2]);
    if (month >= 1 && month <= 12) return `${canonicalMatch[1]}-${String(month).padStart(2, '0')}-01`;
  }

  const normalizedLabel = rawValue.toLowerCase();
  const monthIndex = monthNames.findIndex(month => (
    normalizedLabel === month.toLowerCase()
    || normalizedLabel.startsWith(`${month.slice(0, 3).toLowerCase()} `)
    || normalizedLabel === month.slice(0, 3).toLowerCase()
  ));
  if (monthIndex >= 0) {
    const explicitYear = rawValue.match(/\b(19|20)\d{2}\b/)?.[0];
    const numericFallback = Number(fallbackYear);
    const year = explicitYear || (Number.isFinite(numericFallback) ? String(numericFallback) : String(new Date().getFullYear()));
    return `${year}-${String(monthIndex + 1).padStart(2, '0')}-01`;
  }

  const parsedDate = new Date(rawValue);
  if (!Number.isNaN(parsedDate.getTime())) {
    return `${parsedDate.getFullYear()}-${String(parsedDate.getMonth() + 1).padStart(2, '0')}-01`;
  }

  return '';
};

export const formatFinancialMonth = (value?: string | null, fallbackYear?: string | number) => {
  if (value === 'Monthly') return 'Monthly';
  const normalized = normalizeFinancialMonthValue(value, fallbackYear);
  if (!normalized) return '—';
  const [year, month] = normalized.split('-').map(Number);
  return `${monthNames[month - 1]?.slice(0, 3) || ''} ${year}`.trim();
};

interface FinancialAmountCellProps {
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
  ariaLabel: string;
  emptyWhenZero?: boolean;
  currencyDisplay?: boolean;
}

export function FinancialAmountCell({
  value,
  onChange,
  disabled = false,
  ariaLabel,
  emptyWhenZero = false,
  currencyDisplay = false,
}: FinancialAmountCellProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [draftValue, setDraftValue] = useState(value);
  const initialValueRef = useRef(value);
  const skipBlurCommitRef = useRef(false);

  useEffect(() => {
    if (!isEditing) setDraftValue(value);
  }, [isEditing, value]);

  const beginEditing = () => {
    if (disabled) return;
    skipBlurCommitRef.current = false;
    initialValueRef.current = value;
    setDraftValue(value);
    setIsEditing(true);
  };

  const commit = () => {
    onChange(draftValue);
    setIsEditing(false);
  };

  if (disabled) {
    return <span className="fac-inline-cell-value fac-inline-cell-value--amount">{currencyDisplay ? currencyFormatter.format(value || 0) : amountFormatter.format(value || 0)}</span>;
  }

  if (!isEditing) {
    return (
      <button
        type="button"
        className="fac-inline-cell-trigger fac-inline-cell-trigger--amount"
        onClick={beginEditing}
        onKeyDown={event => {
          if (event.key === 'F2') {
            event.preventDefault();
            beginEditing();
          }
        }}
        aria-label={`${ariaLabel}: ${currencyDisplay ? currencyFormatter.format(value || 0) : amountFormatter.format(value || 0)}`}
      >
        {emptyWhenZero && !value ? '—' : currencyDisplay ? currencyFormatter.format(value || 0) : amountFormatter.format(value || 0)}
      </button>
    );
  }

  return (
    <FormattedAmountInput
      value={draftValue}
      onValueChange={setDraftValue}
      onBlur={() => {
        if (skipBlurCommitRef.current) {
          skipBlurCommitRef.current = false;
          return;
        }
        commit();
      }}
      onKeyDown={event => {
        if (event.key === 'Enter') {
          event.preventDefault();
          commit();
        } else if (event.key === 'Escape') {
          event.preventDefault();
          skipBlurCommitRef.current = true;
          setDraftValue(initialValueRef.current);
          setIsEditing(false);
        }
      }}
      className="fac-inline-cell-input fac-inline-cell-input--amount"
      aria-label={ariaLabel}
      emptyWhenZero={emptyWhenZero}
      autoFocus
    />
  );
}

interface FinancialMonthCellProps {
  value?: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  ariaLabel: string;
  fallbackYear?: string | number;
  allowClear?: boolean;
}

export function FinancialMonthCell({ value, onChange, disabled = false, ariaLabel, fallbackYear, allowClear = false }: FinancialMonthCellProps) {
  if (value === 'Monthly') return <span className="fac-inline-cell-value">Monthly</span>;
  const normalizedValue = normalizeFinancialMonthValue(value, fallbackYear);

  if (disabled) return <span className="fac-inline-cell-value">{formatFinancialMonth(value, fallbackYear)}</span>;

  return (
    <MonthYearPicker
      value={normalizedValue}
      onChange={onChange}
      placeholder="—"
      defaultYear={Number(fallbackYear) || new Date().getFullYear()}
      allowClear={allowClear}
      className="fac-inline-month-picker"
      ariaLabel={ariaLabel}
    />
  );
}
