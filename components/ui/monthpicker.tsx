"use client";
import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { buttonVariants } from "./button";
import { cn } from "@/lib/utils";

type Month = {
    number: number;
    name: string;
};

const MONTHS: Month[][] = [
    [
        { number: 0, name: "Jan" },
        { number: 1, name: "Feb" },
        { number: 2, name: "Mar" },
        { number: 3, name: "Apr" },
    ],
    [
        { number: 4, name: "May" },
        { number: 5, name: "Jun" },
        { number: 6, name: "Jul" },
        { number: 7, name: "Aug" },
    ],
    [
        { number: 8, name: "Sep" },
        { number: 9, name: "Oct" },
        { number: 10, name: "Nov" },
        { number: 11, name: "Dec" },
    ],
];

type MonthCalProps = {
    selectedMonth?: Date;
    onMonthSelect?: (date: Date) => void;
    onYearForward?: () => void;
    onYearBackward?: () => void;
    callbacks?: {
        yearLabel?: (year: number) => string;
        monthLabel?: (month: Month) => string;
    };
    variant?: {
        calendar?: {
            main?: ButtonVariant;
            selected?: ButtonVariant;
        };
        chevrons?: ButtonVariant;
    };
    minDate?: Date;
    maxDate?: Date;
    disabledDates?: Date[];
    defaultYear?: number;
};

type ButtonVariant = "default" | "outline" | "ghost" | "link" | "destructive" | "secondary" | null | undefined;

function MonthPicker({
    onMonthSelect,
    selectedMonth,
    minDate,
    maxDate,
    disabledDates,
    callbacks,
    onYearBackward,
    onYearForward,
    variant,
    className,
    ...props
}: React.HTMLAttributes<HTMLDivElement> & MonthCalProps) {
    return (
        <div className={cn("month-picker", className)} {...props}>
            <div className="month-picker__layout">
                <div className="month-picker__body">
                    <MonthCal
                        onMonthSelect={onMonthSelect}
                        callbacks={callbacks}
                        selectedMonth={selectedMonth}
                        onYearBackward={onYearBackward}
                        onYearForward={onYearForward}
                        variant={variant}
                        minDate={minDate}
                        maxDate={maxDate}
                        disabledDates={disabledDates}
                        defaultYear={props.defaultYear}
                    ></MonthCal>
                </div>
            </div>
        </div>
    );
}

function MonthCal({ selectedMonth, onMonthSelect, callbacks, variant, minDate, maxDate, disabledDates, onYearBackward, onYearForward, defaultYear }: MonthCalProps) {
    const [year, setYear] = React.useState<number>(selectedMonth?.getFullYear() ?? defaultYear ?? new Date().getFullYear());
    const [month, setMonth] = React.useState<number>(selectedMonth?.getMonth() ?? new Date().getMonth());
    const [menuYear, setMenuYear] = React.useState<number>(year);

    if (minDate && maxDate && minDate > maxDate) minDate = maxDate;

    const disabledDatesMapped = disabledDates?.map((d) => {
        return { year: d.getFullYear(), month: d.getMonth() };
    });

    return (
        <>
            <div className="month-picker__header">
                <div className="month-picker__year">{callbacks?.yearLabel ? callbacks?.yearLabel(menuYear) : menuYear}</div>
                <div className="month-picker__nav-group">
                    <button
                        onClick={() => {
                            setMenuYear(menuYear - 1);
                            if (onYearBackward) onYearBackward();
                        }}
                        className={cn(
                            buttonVariants({ variant: variant?.chevrons ?? "outline" }), 
                            "month-picker__nav month-picker__nav--prev"
                        )}
                    >
                        <ChevronLeft className="btn-symbol" />
                    </button>
                    <button
                        onClick={() => {
                            setMenuYear(menuYear + 1);
                            if (onYearForward) onYearForward();
                        }}
                        className={cn(
                            buttonVariants({ variant: variant?.chevrons ?? "outline" }), 
                            "month-picker__nav month-picker__nav--next"
                        )}
                    >
                        <ChevronRight className="btn-symbol" />
                    </button>
                </div>
            </div>
            <table className="month-picker__table">
                <tbody>
                    {MONTHS.map((monthRow, a) => {
                        return (
                            <tr key={"row-" + a} className="month-picker__row">
                                {monthRow.map((m) => {
                                    return (
                                        <td
                                            key={m.number}
                                            className="month-picker__cell"
                                        >
                                            <button
                                                onClick={() => {
                                                    setMonth(m.number);
                                                    setYear(menuYear);
                                                    if (onMonthSelect) onMonthSelect(new Date(menuYear, m.number));
                                                }}
                                                disabled={
                                                    (maxDate ? menuYear > maxDate?.getFullYear() || (menuYear == maxDate?.getFullYear() && m.number > maxDate.getMonth()) : false) ||
                                                    (minDate ? menuYear < minDate?.getFullYear() || (menuYear == minDate?.getFullYear() && m.number < minDate.getMonth()) : false) ||
                                                    (disabledDatesMapped ? disabledDatesMapped?.some((d) => d.year == menuYear && d.month == m.number) : false)
                                                }
                                                className={cn(
                                                    buttonVariants({ variant: month == m.number && menuYear == year ? "default" : "ghost" }),
                                                    "month-picker__month",
                                                    month == m.number && menuYear == year 
                                                        ? "month-picker__month--selected" 
                                                        : "month-picker__month--idle"
                                                )}
                                            >
                                                {callbacks?.monthLabel ? callbacks.monthLabel(m) : m.name}
                                            </button>
                                        </td>
                                    );
                                })}
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </>
    );
}

MonthPicker.displayName = "MonthPicker";

export { MonthPicker };
