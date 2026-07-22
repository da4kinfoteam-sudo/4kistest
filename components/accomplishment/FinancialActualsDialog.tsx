import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Trash2, X } from 'lucide-react';
import type { DisbursementRecord, ObligationRecord } from '../../constants';
import { FormattedAmountInput } from '../ui/FormattedAmountInput';
import { MonthYearPicker } from '../ui/MonthYearPicker';
import { formatFinancialMonth, normalizeFinancialMonthValue } from './FinancialInlineEditors';

type FinancialRecord = ObligationRecord | DisbursementRecord;
type ActualKind = 'obligation' | 'disbursement';

const currencyFormatter = new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
  maximumFractionDigits: 2,
});

interface FinancialActualsDialogProps<T extends FinancialRecord> {
  open: boolean;
  kind: ActualKind;
  lineItemName: string;
  fallbackYear?: string | number;
  records: T[];
  readOnly?: boolean;
  saving?: boolean;
  error?: string;
  onClose: () => void;
  onSave: (records: T[]) => Promise<void>;
}

const normalizeRecords = <T extends FinancialRecord>(records: T[], fallbackYear?: string | number): T[] => records.map(record => ({
  ...record,
  amount: Number(record.amount) || 0,
  date: normalizeFinancialMonthValue(record.date, fallbackYear),
}));

const comparableRecords = (records: FinancialRecord[], fallbackYear?: string | number) => records.map(record => ({
  id: record.id,
  amount: Number(record.amount) || 0,
  date: normalizeFinancialMonthValue(record.date, fallbackYear),
  remarks: record.remarks || '',
}));

export function FinancialActualsDialog<T extends FinancialRecord>({
  open,
  kind,
  lineItemName,
  fallbackYear,
  records,
  readOnly = false,
  saving = false,
  error = '',
  onClose,
  onSave,
}: FinancialActualsDialogProps<T>) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  const [draftRecords, setDraftRecords] = useState<T[]>([]);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    window.requestAnimationFrame(() => closeButtonRef.current?.focus());
    return () => {
      window.requestAnimationFrame(() => returnFocusRef.current?.focus());
    };
  }, [open]);

  useEffect(() => {
    if (open) setDraftRecords(normalizeRecords(records, fallbackYear));
  }, [fallbackYear, open, records]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !saving) {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab') return;
      const focusableNodes = dialogRef.current?.querySelectorAll(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      ) as NodeListOf<HTMLElement> | undefined;
      const focusable = focusableNodes
        ? (Array.prototype.slice.call(focusableNodes) as HTMLElement[]).filter(element => !element.hasAttribute('hidden'))
        : [];
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
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, saving]);

  const hasChanges = useMemo(() => (
    JSON.stringify(comparableRecords(draftRecords, fallbackYear))
    !== JSON.stringify(comparableRecords(records, fallbackYear))
  ), [draftRecords, fallbackYear, records]);
  const totalAmount = useMemo(
    () => draftRecords.reduce((total, record) => total + (Number(record.amount) || 0), 0),
    [draftRecords]
  );

  const plural = kind === 'obligation' ? 'obligations' : 'disbursements';
  const title = `Manage Actual ${kind === 'obligation' ? 'Obligations' : 'Disbursements'}`;

  const updateRecord = (id: number, updates: Partial<T>) => {
    setDraftRecords(current => current.map(record => record.id === id ? { ...record, ...updates } : record));
  };

  const addRecord = () => {
    const lowestTemporaryId = draftRecords.reduce((lowest, record) => Math.min(lowest, Number(record.id) || 0), 0);
    setDraftRecords(current => [...current, {
      id: lowestTemporaryId - 1,
      amount: 0,
      date: '',
      remarks: '',
    } as T]);
  };

  if (!open) return null;

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={event => {
        if (event.target === event.currentTarget && !saving) onClose();
      }}
    >
      <div
        ref={dialogRef}
        className="modal-card column-filter-dialog financial-actuals-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="financial-actuals-dialog-title"
        aria-describedby="financial-actuals-dialog-description"
      >
        <div className="modal-card__header">
          <div className="column-filter-dialog__title">
            <h3 id="financial-actuals-dialog-title">{title}</h3>
            <p id="financial-actuals-dialog-description">{lineItemName}</p>
          </div>
          <button ref={closeButtonRef} type="button" className="modal-card__close" onClick={onClose} disabled={saving} aria-label={`Close ${title}`}>
            <X aria-hidden="true" />
          </button>
        </div>

        <div className="modal-card__body column-filter-dialog__body financial-actuals-dialog__body">
          {draftRecords.length === 0 ? (
            <div className="financial-actuals-dialog__empty">
              <p>No actual {plural} recorded.</p>
              {!readOnly && <button type="button" className="btn btn-secondary btn-sm" onClick={addRecord}><Plus aria-hidden="true" /> Add {kind}</button>}
            </div>
          ) : (
            <div className="financial-actuals-dialog__records">
              <div className="financial-actuals-dialog__table-wrap custom-scrollbar">
                <table className="financial-actuals-dialog__table">
                  <thead>
                    <tr><th>Amount</th><th>Month / Year</th>{!readOnly && <th><span className="sr-only">Delete</span></th>}</tr>
                  </thead>
                  <tbody>
                    {draftRecords.map((record, index) => (
                      <tr key={record.id}>
                        <td>
                          {readOnly ? (
                            <span className="financial-actuals-dialog__readonly-value">{currencyFormatter.format(Number(record.amount) || 0)}</span>
                          ) : (
                            <FormattedAmountInput
                              value={Number(record.amount) || 0}
                              onValueChange={value => updateRecord(record.id, { amount: value } as Partial<T>)}
                              className="form-input financial-actuals-dialog__amount"
                              aria-label={`${lineItemName} ${kind} ${index + 1} amount`}
                              emptyWhenZero
                            />
                          )}
                        </td>
                        <td>
                          {readOnly ? (
                            <span className="financial-actuals-dialog__readonly-value">{formatFinancialMonth(record.date, fallbackYear)}</span>
                          ) : (
                            <MonthYearPicker
                              value={normalizeFinancialMonthValue(record.date, fallbackYear)}
                              onChange={value => updateRecord(record.id, { date: value } as Partial<T>)}
                              placeholder="Select month"
                              defaultYear={Number(fallbackYear) || new Date().getFullYear()}
                              className="financial-actuals-dialog__month"
                              ariaLabel={`${lineItemName} ${kind} ${index + 1} month and year`}
                            />
                          )}
                        </td>
                        {!readOnly && (
                          <td>
                            <button type="button" className="table-action table-action--danger table-action--icon" onClick={() => setDraftRecords(current => current.filter(item => item.id !== record.id))} aria-label={`Delete ${kind} ${index + 1}`} title={`Delete ${kind}`}>
                              <Trash2 aria-hidden="true" />
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="financial-actuals-dialog__total" aria-live="polite">
                <span>Total actual {plural}</span>
                <strong>{currencyFormatter.format(totalAmount)}</strong>
              </div>
            </div>
          )}

          {!readOnly && draftRecords.length > 0 && (
            <button type="button" className="financial-actuals-dialog__add" onClick={addRecord}>
              <Plus aria-hidden="true" /> Add another {kind}
            </button>
          )}
          {error && <div className="financial-actuals-dialog__error" role="alert">{error}</div>}
        </div>

        <div className="modal-card__footer column-filter-dialog__actions">
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving}>{readOnly ? 'Close' : 'Cancel'}</button>
          {!readOnly && <button type="button" className="btn btn-primary" disabled={!hasChanges || saving} onClick={() => onSave(draftRecords)}>{saving ? 'Saving…' : 'Save Changes'}</button>}
        </div>
      </div>
    </div>
  );
}
