
import React, { useState } from 'react';
import { SystemSettings } from '../constants';

export interface GanttItem {
    id: number;
    name: string;
    startDate: string;
    endDate: string;
    actualEndDate?: string;
    type: 'Subproject' | 'Training';
    status?: string;
}

interface GanttChartProps {
    items: GanttItem[];
    systemSettings: SystemSettings;
}

const GanttChart: React.FC<GanttChartProps> = ({ items, systemSettings }) => {
    const [zoomedMonth, setZoomedMonth] = useState<Date | null>(null);
    
    const parseDate = (dateString: string): Date | null => {
        if (!dateString) return null;
        const [year, month, day] = dateString.split('-').map(Number);
        return new Date(year, month - 1, day);
    };

    // Combine item dates with system setting dates to determine chart range
    const allDates = [
        ...items.flatMap(item => [
            parseDate(item.startDate),
            parseDate(item.endDate),
            item.actualEndDate ? parseDate(item.actualEndDate) : null
        ]),
        ...systemSettings.deadlines.map(d => parseDate(d.date)),
        ...systemSettings.planningSchedules.flatMap(s => [parseDate(s.startDate), parseDate(s.endDate)])
    ].filter((d): d is Date => d !== null);

    if (allDates.length === 0) {
        return (
            <div className="detail-empty gantt-empty">
                No timeline data available.
            </div>
        );
    }

    let chartStartDate: Date;
    let chartEndDate: Date;

    if (zoomedMonth) {
        // Zoomed View: First day to Last day of the selected month
        chartStartDate = new Date(zoomedMonth.getFullYear(), zoomedMonth.getMonth(), 1);
        chartEndDate = new Date(zoomedMonth.getFullYear(), zoomedMonth.getMonth() + 1, 0);
    } else {
        // Overview View: Auto-range with padding
        const minDate = new Date(Math.min(...allDates.map(d => d.getTime())));
        const maxDate = new Date(Math.max(...allDates.map(d => d.getTime())));
        
        chartStartDate = new Date(minDate.getFullYear(), minDate.getMonth() - 1, 1);
        chartEndDate = new Date(maxDate.getFullYear(), maxDate.getMonth() + 2, 0);
    }

    const totalDays = (chartEndDate.getTime() - chartStartDate.getTime()) / (1000 * 3600 * 24) + 1;

    const getDaysFromStart = (date: Date | null) => {
        if (!date) return 0;
        // Calculate difference in days
        return (date.getTime() - chartStartDate.getTime()) / (1000 * 3600 * 24);
    };

    // Helper to render bars with clamping for the current view range
    const renderBar = (start: Date, end: Date, className: string, title: string, isLine: boolean = false) => {
        // Clamp dates to visible range
        const effectiveStart = start < chartStartDate ? chartStartDate : start;
        let effectiveEnd = end > chartEndDate ? chartEndDate : end;
        
        // If looking at a specific deadline (point in time), don't clamp end if it's the same as start
        if (start.getTime() === end.getTime()) {
             effectiveEnd = effectiveStart;
        }

        // If the item is completely out of view
        if (start > chartEndDate || end < chartStartDate) return null;

        const left = (getDaysFromStart(effectiveStart) / totalDays) * 100;
        
        if (isLine) {
             return (
                <div 
                    key={title} 
                    className={className}
                    style={{ left: `${left}%` }}
                >
                    {/* Tooltip/Label for the line */}
                    <div className="gantt-deadline-label">
                        {title}
                    </div>
                </div>
            );
        }

        const durationDays = Math.max(0.5, (effectiveEnd.getTime() - effectiveStart.getTime()) / (1000 * 3600 * 24)); 
        const width = (durationDays / totalDays) * 100;

        return (
            <div 
                className={className}
                style={{ left: `${left}%`, width: `${width}%` }}
                title={title}
            ></div>
        );
    };

    // Headers Generation
    const headers = [];
    if (zoomedMonth) {
        // Generate Days headers
        const daysInMonth = new Date(zoomedMonth.getFullYear(), zoomedMonth.getMonth() + 1, 0).getDate();
        for (let i = 1; i <= daysInMonth; i++) {
            const date = new Date(zoomedMonth.getFullYear(), zoomedMonth.getMonth(), i);
            const left = (getDaysFromStart(date) / totalDays) * 100;
            headers.push(
                <div key={i} className="gantt-gridline" style={{ left: `${left}%` }}>
                    <span className="gantt-day-label">
                        {i}
                    </span>
                </div>
            );
        }
    } else {
        // Generate Months headers
        let currentDate = new Date(chartStartDate);
        while (currentDate <= chartEndDate) {
            const monthDate = new Date(currentDate);
            const daysFromStart = getDaysFromStart(monthDate);
            const leftPosition = (daysFromStart / totalDays) * 100;
            
            headers.push(
                <div key={monthDate.getTime()} className="gantt-gridline" style={{ left: `${leftPosition}%` }}>
                    <button 
                        onClick={() => setZoomedMonth(monthDate)}
                        className="gantt-month-button"
                    >
                        {monthDate.toLocaleString('default', { month: 'short' })} '{monthDate.getFullYear().toString().slice(-2)}
                    </button>
                </div>
            );
            currentDate.setMonth(currentDate.getMonth() + 1);
        }
    }

    return (
        <div className="gantt-chart">
            {zoomedMonth && (
                <div className="gantt-zoom-bar">
                    <div className="flex items-center gap-2">
                        <span className="gantt-zoom-bar__title">
                            {zoomedMonth.toLocaleString('default', { month: 'long', year: 'numeric' })}
                        </span>
                        <span className="gantt-zoom-bar__mode">(Day View)</span>
                    </div>
                    <button 
                        onClick={() => setZoomedMonth(null)} 
                        className="btn btn-secondary btn-sm"
                    >
                        Back to Year View
                    </button>
                </div>
            )}

            <div className="gantt-scroll">
                <div className="gantt-canvas">
                    
                    {/* Planning Schedule Backgrounds */}
                    {systemSettings.planningSchedules.map(schedule => {
                        const start = parseDate(schedule.startDate);
                        let end = parseDate(schedule.endDate);
                        if (!start || !end) return null;
                        const endDateInclusive = new Date(end);
                        endDateInclusive.setDate(endDateInclusive.getDate() + 1); // Inclusive
                        
                        return (
                            <React.Fragment key={`schedule-${schedule.id}`}>
                                {renderBar(start, endDateInclusive, "gantt-planning-range", `${schedule.name} (${schedule.startDate} - ${schedule.endDate})`)}
                            </React.Fragment>
                        );
                    })}

                    {/* Deadlines Vertical Lines */}
                    {systemSettings.deadlines.map(deadline => {
                        const date = parseDate(deadline.date);
                        if (!date) return null;
                        return renderBar(date, date, "gantt-deadline", deadline.name, true);
                    })}

                    {/* Timeline Header */}
                    <div className="gantt-header">
                         {headers}
                    </div>
                    
                    {/* Rows */}
                    <div className="gantt-rows">
                         {items.length === 0 && <div className="detail-empty">No items to display.</div>}
                         {items.map(item => {
                            const startDate = parseDate(item.startDate);
                            const estimatedEndDate = parseDate(item.endDate);
                            const actualEndDate = parseDate(item.actualEndDate ? item.actualEndDate : '');

                            if (!startDate || !estimatedEndDate) return null;

                            // Skip items that don't overlap with the zoomed month
                            if (startDate > chartEndDate || estimatedEndDate < chartStartDate) {
                                if (actualEndDate && (actualEndDate > chartStartDate && startDate < chartEndDate)) {
                                    // Keep if actual duration overlaps
                                } else {
                                    return null;
                                }
                            }

                            const plannedBar = renderBar(
                                startDate, 
                                estimatedEndDate, 
                                `gantt-bar gantt-bar--planned ${item.type === 'Training' ? 'gantt-bar--training' : 'gantt-bar--subproject'}`,
                                `Planned: ${item.startDate}${item.type === 'Subproject' ? ` to ${item.endDate}` : ''}`
                            );

                            const actualBar = actualEndDate && item.type === 'Subproject' ? renderBar(
                                startDate,
                                actualEndDate,
                                "gantt-bar gantt-bar--actual",
                                `Actual: ${item.startDate} to ${item.actualEndDate}`
                            ) : null;

                            if (!plannedBar && !actualBar) return null;

                            return (
                                <div key={`${item.type}-${item.id}`} className="gantt-row">
                                    <div className="gantt-row__label" title={item.name}>
                                        <span className={`gantt-row__marker ${item.type === 'Training' ? 'gantt-row__marker--training' : 'gantt-row__marker--subproject'}`}></span>
                                        {item.name}
                                    </div>
                                    <div className="gantt-row__track">
                                         {plannedBar}
                                         {actualBar}
                                    </div>
                                </div>
                            )
                         })}
                         {/* Message if filtered to empty in Zoomed View */}
                         {zoomedMonth && items.length > 0 && items.every(item => {
                             const s = parseDate(item.startDate);
                             const e = parseDate(item.endDate);
                             if(!s || !e) return true;
                             return (s > chartEndDate || e < chartStartDate);
                         }) && (
                             <div className="detail-empty">
                                 No activities scheduled for {zoomedMonth.toLocaleString('default', { month: 'long', year: 'numeric' })}.
                             </div>
                         )}
                    </div>
                </div>
            </div>
            {/* Legend */}
            <div className="gantt-legend">
                {!zoomedMonth && <span className="gantt-legend__hint">* Click on a month label to expand details.</span>}
                <div className="gantt-legend__item">
                    <span className="gantt-legend__swatch gantt-legend__swatch--subproject"></span>
                    <span>Subproject</span>
                </div>
                <div className="gantt-legend__item">
                    <span className="gantt-legend__swatch gantt-legend__swatch--training"></span>
                    <span>Training</span>
                </div>
                <div className="gantt-legend__item">
                    <span className="gantt-legend__swatch gantt-legend__swatch--actual"></span>
                    <span>Actual Duration</span>
                </div>
                <div className="gantt-legend__item">
                    <span className="gantt-legend__swatch gantt-legend__swatch--deadline"></span>
                    <span>Deadline</span>
                </div>
                <div className="gantt-legend__item">
                    <span className="gantt-legend__swatch gantt-legend__swatch--planning"></span>
                    <span>Planning Schedule</span>
                </div>
            </div>
        </div>
    );
};

export default GanttChart;
