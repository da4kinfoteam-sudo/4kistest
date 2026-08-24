import React, { useEffect, useState } from 'react';
import {
    addGroupingSeparators,
    formatEditableAmount,
    isFormattedAmountDraft,
    parseFormattedAmount,
    stripAmountFormatting,
} from '../../lib/formattedAmount';

export { parseFormattedAmount } from '../../lib/formattedAmount';

interface FormattedAmountInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type' | 'value' | 'onChange'> {
    value: number;
    onValueChange: (value: number) => void;
    emptyWhenZero?: boolean;
    allowNegative?: boolean;
}

export const FormattedAmountInput: React.FC<FormattedAmountInputProps> = ({
    value,
    onValueChange,
    emptyWhenZero = false,
    allowNegative = false,
    onBlur,
    onFocus,
    ...props
}) => {
    const [displayValue, setDisplayValue] = useState(() => formatEditableAmount(value, emptyWhenZero));
    const [isFocused, setIsFocused] = useState(false);

    useEffect(() => {
        if (!isFocused) {
            setDisplayValue(formatEditableAmount(value, emptyWhenZero));
        }
    }, [emptyWhenZero, isFocused, value]);

    const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const rawValue = stripAmountFormatting(event.target.value);
        if (!isFormattedAmountDraft(rawValue, allowNegative)) return;

        setDisplayValue(addGroupingSeparators(rawValue));
        if (rawValue !== '-') onValueChange(parseFormattedAmount(rawValue));
    };

    const handleFocus = (event: React.FocusEvent<HTMLInputElement>) => {
        setIsFocused(true);
        onFocus?.(event);
    };

    const handleBlur = (event: React.FocusEvent<HTMLInputElement>) => {
        setIsFocused(false);
        const normalizedValue = displayValue === '-' ? 0 : parseFormattedAmount(displayValue);
        setDisplayValue(formatEditableAmount(normalizedValue, emptyWhenZero));
        onBlur?.(event);
    };

    return (
        <input
            {...props}
            type="text"
            inputMode="decimal"
            value={displayValue}
            onChange={handleChange}
            onFocus={handleFocus}
            onBlur={handleBlur}
        />
    );
};
