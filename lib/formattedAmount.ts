const amountFormatter = new Intl.NumberFormat('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
});

export const stripAmountFormatting = (value: string) => value.replace(/,/g, '').trim();

export const formatEditableAmount = (value: number, emptyWhenZero = false) => {
    if (emptyWhenZero && !value) return '';
    return amountFormatter.format(Number.isFinite(value) ? value : 0);
};

export const addGroupingSeparators = (value: string) => {
    if (!value) return '';
    const isNegative = value.startsWith('-');
    const unsignedValue = isNegative ? value.slice(1) : value;
    if (isNegative && !unsignedValue) return '-';
    const [integerPart, decimalPart] = unsignedValue.split('.');
    const groupedInteger = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    const formatted = decimalPart !== undefined ? `${groupedInteger}.${decimalPart}` : groupedInteger;
    return isNegative ? `-${formatted}` : formatted;
};

export const parseFormattedAmount = (value: string) => {
    const parsed = Number.parseFloat(stripAmountFormatting(value));
    return Number.isFinite(parsed) ? parsed : 0;
};

export const isFormattedAmountDraft = (value: string, allowNegative = false) => {
    const pattern = allowNegative ? /^-?\d*\.?\d{0,2}$/ : /^\d*\.?\d{0,2}$/;
    return pattern.test(stripAmountFormatting(value));
};
