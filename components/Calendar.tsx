
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

const Calendar: React.FC<CalendarProps> = ({ activities, systemSettings, onDateClick, onEventClick }) => {
    const [currentDate, setCurrentDate] = useState(new Date());
    const [holidays, setHolidays] = useState<Holiday[]>([]);

    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    const getDaysInMonth = (y: number, m: number) => new Date(y, m + 1, 0).getDate();
    
    // Sunday is 0, Monday is 1, etc. No adjustment needed for Sunday start.
    const getFirstDayOfMonth = (y: number, m: number) => {
        return new Date(y, m, 1).getDay();
    };

    const daysInMonth = getDaysInMonth(year, month);
    const firstDay = getFirstDayOfMonth(year, month);

    const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
    const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1));
    const goToToday = () => setCurrentDate(new Date());

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

            cells.push(
                <div 
                    key={day} 
                    className={`app-calendar__day ${isToday ? 'app-calendar__day--today' : ''}`}
                >
                    <button
                        type="button"
                        className="app-calendar__date"
                        onClick={() => onDateClick(new Date(year, month, day), dayEvents)}
                        aria-label={`${currentDate.toLocaleString('default', { month: 'long' })} ${day}, ${year}${dayEvents.length ? `, ${dayEvents.length} event${dayEvents.length === 1 ? '' : 's'}` : ''}`}
                    >
                        {day}
                    </button>
                    
                    <div className="app-calendar__events custom-scrollbar">
                        {dayEvents.map((evt, idx) => (
                            <button
                                key={idx} 
                                type="button"
                                onClick={(e) => { e.stopPropagation(); onEventClick(evt); }}
                                className={`app-calendar__event app-calendar__event--${evt.tone}`}
                                title={evt.title}
                            >
                                <span>{evt.title}</span>
                            </button>
                        ))}
                    </div>
                </div>
            );
        }
        return cells;
    };

    return (
        <div className="app-calendar">
            <div className="app-calendar__header">
                <button type="button" onClick={prevMonth} className="btn btn-ghost btn-icon" aria-label="Previous month">
                    <svg className="btn-symbol" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                </button>
                <div className="app-calendar__heading">
                    <h2>
                        {currentDate.toLocaleString('default', { month: 'long', year: 'numeric' })}
                    </h2>
                    <button type="button" onClick={goToToday} className="btn btn-link">Today</button>
                </div>
                <button type="button" onClick={nextMonth} className="btn btn-ghost btn-icon" aria-label="Next month">
                    <svg className="btn-symbol" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                </button>
            </div>

            <div className="app-calendar__weekdays">
                {daysOfWeek.map(day => (
                    <div key={day}>
                        {day}
                    </div>
                ))}
            </div>

            <div className="app-calendar__grid">
                {renderCells()}
            </div>
            
            <div className="app-calendar__legend">
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
            </div>
        </div>
    );
};

export default Calendar;
