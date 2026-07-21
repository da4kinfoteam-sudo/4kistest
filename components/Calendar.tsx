
// Author: 4K
import React, { useState, useMemo, useEffect } from 'react';
import { Subproject, Activity, SystemSettings } from '../constants';

export interface CalendarEvent {
    id: string;
    title: string;
    type: 'Training' | 'Subproject Start' | 'Subproject End' | 'Deadline' | 'Planning' | 'Activity' | 'Holiday';
    tone: 'complete' | 'late' | 'activity' | 'deadline' | 'planning' | 'holiday';
    originalData?: any;
    dataId?: number;
    dataType?: 'Subproject' | 'Training' | 'Activity';
}

interface CalendarProps {
    activities: Activity[];
    systemSettings: SystemSettings;
    onDateClick: (date: Date, events: CalendarEvent[]) => void;
    onEventClick: (event: CalendarEvent) => void;
    compact?: boolean;
    selectedDate?: Date | null;
    visibleMonth?: Date;
    onVisibleMonthChange?: (date: Date) => void;
    onToday?: () => void;
}

const daysOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

interface Holiday {
    date: string;
    localName: string;
    name: string;
    countryCode: string;
    fixed: boolean;
    global: boolean;
    counties: string[] | null;
    launchYear: number | null;
    types: string[];
}

const Calendar: React.FC<CalendarProps> = ({
    activities,
    systemSettings,
    onDateClick,
    onEventClick,
    compact = false,
    selectedDate = null,
    visibleMonth,
    onVisibleMonthChange,
    onToday,
}) => {
    const [internalCurrentDate, setInternalCurrentDate] = useState(new Date());
    const [holidays, setHolidays] = useState<Holiday[]>([]);
    const currentDate = visibleMonth || internalCurrentDate;

    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    const getDaysInMonth = (y: number, m: number) => new Date(y, m + 1, 0).getDate();
    
    // Sunday is 0, Monday is 1, etc. No adjustment needed for Sunday start.
    const getFirstDayOfMonth = (y: number, m: number) => {
        return new Date(y, m, 1).getDay();
    };

    const daysInMonth = getDaysInMonth(year, month);
    const firstDay = getFirstDayOfMonth(year, month);

    const setVisibleMonth = (date: Date) => {
        if (onVisibleMonthChange) onVisibleMonthChange(date);
        else setInternalCurrentDate(date);
    };
    const prevMonth = () => setVisibleMonth(new Date(year, month - 1, 1));
    const nextMonth = () => setVisibleMonth(new Date(year, month + 1, 1));
    const goToToday = () => {
        setVisibleMonth(new Date());
        onToday?.();
    };

    useEffect(() => {
        const fetchHolidays = async () => {
            try {
                const response = await fetch(`https://date.nager.at/api/v3/publicholidays/${year}/PH`);
                if (response.ok) {
                    const data = await response.json();
                    setHolidays(data);
                }
            } catch (error) {
                console.error("Failed to fetch holidays", error);
            }
        };
        fetchHolidays();
    }, [year]);

    const getStatusTone = (isCompleted: boolean, dateToCheck: string): CalendarEvent['tone'] => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        const [y, m, d] = dateToCheck.split('-').map(Number);
        const targetDate = new Date(y, m - 1, d);

        if (isCompleted) {
            return 'complete';
        } else if (targetDate < today) {
            return 'late';
        } else {
            return 'activity';
        }
    };

    const eventsByDate = useMemo(() => {
        const events: Record<string, CalendarEvent[]> = {};

        const addEvent = (dateStr: string, event: CalendarEvent) => {
            if (!dateStr) return;
            const [y, m, d] = dateStr.split('-').map(Number);
            const key = `${y}-${m - 1}-${d}`;
            
            if (!events[key]) events[key] = [];
            events[key].push(event);
        };

        (activities || []).forEach(act => {
            const isCompleted = act.status === 'Completed' || !!act.actualDate;
            const startDate = (isCompleted && act.actualDate) ? act.actualDate : act.date;
            const endDate = (isCompleted && act.actualDate) ? (act.actualEndDate || act.actualDate) : (act.endDate || act.date);

            if (startDate) {
                const [startY, startM, startD] = startDate.split('-').map(Number);
                let currentLoopDate = new Date(startY, startM - 1, startD);
                
                const [endY, endM, endD] = endDate.split('-').map(Number);
                let endLoopDate = new Date(endY, endM - 1, endD);

                const effectiveEndDateStr = endDate;
                const tone = getStatusTone(isCompleted, effectiveEndDateStr);

                while (currentLoopDate <= endLoopDate) {
                    const yearStr = currentLoopDate.getFullYear();
                    const monthStr = currentLoopDate.getMonth() + 1;
                    const dayStr = currentLoopDate.getDate();
                    const dateKey = `${yearStr}-${monthStr.toString().padStart(2, '0')}-${dayStr.toString().padStart(2, '0')}`;

                    addEvent(dateKey, {
                        id: `act-${act.id}-${dateKey}`,
                        title: act.name,
                        type: act.type === 'Training' ? 'Training' : 'Activity',
                        tone,
                        originalData: act,
                        dataId: act.id,
                        dataType: act.type === 'Training' ? 'Training' : 'Activity'
                    });

                    currentLoopDate.setDate(currentLoopDate.getDate() + 1);
                }
            }
        });

        (systemSettings?.deadlines || []).forEach(dl => {
            if (dl.date) {
                addEvent(dl.date, {
                    id: `dl-${dl.id}`,
                    title: `Deadline: ${dl.name}`,
                    type: 'Deadline',
                    tone: 'deadline'
                });
            }
        });

        (systemSettings?.planningSchedules || []).forEach(ps => {
            if (ps.startDate && ps.endDate) {
                let current = new Date(ps.startDate);
                const end = new Date(ps.endDate);
                
                while (current <= end) {
                    const dateStr = current.toISOString().split('T')[0];
                    addEvent(dateStr, {
                        id: `ps-${ps.id}-${dateStr}`,
                        title: ps.name,
                        type: 'Planning',
                        tone: 'planning'
                    });
                    current.setDate(current.getDate() + 1);
                }
            }
        });

        (holidays || []).forEach(h => {
            addEvent(h.date, {
                id: `hol-${h.date}`,
                title: h.localName,
                type: 'Holiday',
                tone: 'holiday'
            });
        });

        return events;
    }, [activities, systemSettings, holidays]);

    const monthlySummary = useMemo(() => {
        const activityIds = new Set<string>();
        const deadlineIds = new Set<string>();
        const monthPrefix = `${year}-${month}-`;

        (Object.entries(eventsByDate) as Array<[string, CalendarEvent[]]>).forEach(([dateKey, dateEvents]) => {
            if (!dateKey.startsWith(monthPrefix)) return;
            dateEvents.forEach(event => {
                if (event.dataId && (event.dataType === 'Activity' || event.dataType === 'Training')) {
                    activityIds.add(`${event.dataType}-${event.dataId}`);
                }
                if (event.type === 'Deadline') deadlineIds.add(event.id);
            });
        });

        return { activities: activityIds.size, deadlines: deadlineIds.size };
    }, [eventsByDate, month, year]);

    const renderCells = () => {
        const cells = [];
        for (let i = 0; i < firstDay; i++) {
            cells.push(<div key={`empty-${i}`} className="app-calendar__day app-calendar__day--empty" />);
        }

        const today = new Date();
        const isCurrentMonth = today.getFullYear() === year && today.getMonth() === month;

        for (let day = 1; day <= daysInMonth; day++) {
            const key = `${year}-${month}-${day}`;
            const dayEvents = eventsByDate[key] || [];
            const isToday = isCurrentMonth && today.getDate() === day;
            const isSelected = !!selectedDate
                && selectedDate.getFullYear() === year
                && selectedDate.getMonth() === month
                && selectedDate.getDate() === day;

            cells.push(
                <div 
                    key={day} 
                    className={`app-calendar__day ${isToday ? 'app-calendar__day--today' : ''} ${dayEvents.length ? 'app-calendar__day--has-events' : ''} ${isSelected ? 'app-calendar__day--selected' : ''}`}
                >
                    <button
                        type="button"
                        className="app-calendar__date"
                        onClick={() => onDateClick(new Date(year, month, day), dayEvents)}
                        aria-label={`${currentDate.toLocaleString('default', { month: 'long' })} ${day}, ${year}${dayEvents.length ? `, ${dayEvents.length} event${dayEvents.length === 1 ? '' : 's'}` : ''}`}
                        aria-pressed={isSelected}
                    >
                        {day}
                    </button>
                    
                    {compact ? (
                        <div className="app-calendar__event-dots" aria-hidden="true">
                            {dayEvents.slice(0, 4).map(evt => (
                                <span key={evt.id} className={`app-calendar__event-dot app-calendar__event-dot--${evt.tone}`} title={evt.title} />
                            ))}
                            {dayEvents.length > 4 && <span className="app-calendar__event-more">+{dayEvents.length - 4}</span>}
                        </div>
                    ) : (
                        <div className="app-calendar__events custom-scrollbar">
                            {dayEvents.map(evt => (
                                <button
                                    key={evt.id}
                                    type="button"
                                    onClick={(e) => { e.stopPropagation(); onEventClick(evt); }}
                                    className={`app-calendar__event app-calendar__event--${evt.tone}`}
                                    title={evt.title}
                                >
                                    <span>{evt.title}</span>
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            );
        }
        return cells;
    };

    return (
        <div className={`app-calendar ${compact ? 'app-calendar--compact' : ''}`}>
            <div className="app-calendar__header">
                <div className="app-calendar__heading">
                    <h2>
                        {currentDate.toLocaleString('default', { month: 'long', year: 'numeric' })}
                    </h2>
                    {!compact && <button type="button" onClick={goToToday} className="btn btn-link">Today</button>}
                </div>
                <div className="app-calendar__navigation">
                    <button type="button" onClick={prevMonth} className="btn btn-ghost btn-icon" aria-label="Previous month">
                        <svg className="btn-symbol" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                    </button>
                    <button type="button" onClick={nextMonth} className="btn btn-ghost btn-icon" aria-label="Next month">
                        <svg className="btn-symbol" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                    </button>
                </div>
            </div>

            <div className="app-calendar__weekdays">
                {daysOfWeek.map(day => (
                    <div key={day}>
                        {compact ? day.slice(0, 1) : day}
                    </div>
                ))}
            </div>

            <div className="app-calendar__grid">
                {renderCells()}
            </div>
            
            {compact ? (
                <div className="app-calendar__summary">
                    <span>{monthlySummary.activities} {monthlySummary.activities === 1 ? 'activity' : 'activities'} this month</span>
                    <span>{monthlySummary.deadlines} {monthlySummary.deadlines === 1 ? 'deadline' : 'deadlines'} this month</span>
                </div>
            ) : <div className="app-calendar__legend">
                <div>
                    <span className="app-calendar__legend-swatch app-calendar__legend-swatch--holiday" />
                    <span>Holiday</span>
                </div>
                <div>
                    <span className="app-calendar__legend-swatch app-calendar__legend-swatch--complete" />
                    <span>Completed</span>
                </div>
                <div>
                    <span className="app-calendar__legend-swatch app-calendar__legend-swatch--late" />
                    <span>Past Due / Incomplete</span>
                </div>
                 <div>
                    <span className="app-calendar__legend-swatch app-calendar__legend-swatch--activity" />
                    <span>Activity</span>
                </div>
            </div>}
        </div>
    );
};

export default Calendar;
