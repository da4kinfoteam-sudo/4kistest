"use client";

import * as React from "react";
import { format, parse } from "date-fns";
import { Calendar as CalendarIcon, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { MonthPicker } from "@/components/ui/monthpicker";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface MonthYearPickerProps {
  value?: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  defaultYear?: number;
  allowClear?: boolean;
  clearLabel?: string;
  ariaLabel?: string;
}

export function MonthYearPicker({
  value,
  onChange,
  placeholder = "Select month",
  disabled = false,
  className,
  defaultYear,
  allowClear = false,
  clearLabel = "Clear",
  ariaLabel,
}: MonthYearPickerProps) {
  const [date, setDate] = React.useState<Date | undefined>(() => {
    if (!value) return undefined;
    const parsed = parse(value, "yyyy-MM-dd", new Date());
    return isNaN(parsed.getTime()) ? undefined : parsed;
  });
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    if (value) {
      const parsedDate = parse(value, "yyyy-MM-dd", new Date());
      if (!isNaN(parsedDate.getTime()) && parsedDate.getTime() !== date?.getTime()) {
        setDate(parsedDate);
      } else if (isNaN(parsedDate.getTime())) {
        setDate(undefined);
      }
    } else {
      setDate(undefined);
    }
  }, [value]);

  const handleSelect = (newDate: Date) => {
    const normalizedDate = new Date(newDate.getFullYear(), newDate.getMonth(), 1);
    setDate(normalizedDate);
    onChange(format(normalizedDate, "yyyy-MM-dd"));
    setOpen(false);
  };

  const handleClear = () => {
    setDate(undefined);
    onChange("");
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            "month-year-picker-trigger",
            !date && "month-year-picker-trigger--placeholder",
            className
          )}
          disabled={disabled}
          aria-label={ariaLabel}
          onKeyDown={(event) => {
            if (event.key === "F2" && !disabled) {
              event.preventDefault();
              setOpen(true);
            }
          }}
        >
          <div className="flex items-center gap-1.5 overflow-hidden">
            <CalendarIcon className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">
              {date ? format(date, "MMM yyyy") : <span>{placeholder}</span>}
            </span>
          </div>
          {!disabled && <ChevronDown className="month-year-picker-trigger__chevron" aria-hidden="true" />}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="month-year-picker-popover" align="start">
        <MonthPicker
          selectedMonth={date}
          onMonthSelect={handleSelect}
          defaultYear={defaultYear}
        />
        {allowClear && !disabled && date && (
          <div className="month-year-picker-popover__footer">
            <button
              type="button"
              onClick={handleClear}
              className="month-year-picker-clear"
            >
              {clearLabel}
            </button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
