
// Author: 4K
import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../supabaseClient';
import { fetchAll } from '../../hooks/useSupabaseTable';
import { Subproject, Activity, IPO } from '../../constants';
import { DataTablePagination, SortableTableHeader } from '../ui/enterprise';

interface UserLog {
    id: number;
    description: string;
    username: string;
    operating_unit: string;
    created_at: string;
    entity_type?: string;
    entity_id?: string;
    action_metadata?: any;
}

interface UserLogsTabProps {
    subprojects: Subproject[];
    activities: Activity[];
    ipos: IPO[];
    onSelectSubproject: (project: Subproject) => void;
    onSelectActivity: (activity: Activity) => void;
    onSelectIpo: (ipo: IPO) => void;
}

const UserLogsTab: React.FC<UserLogsTabProps> = ({
    subprojects,
    activities,
    ipos,
    onSelectSubproject,
    onSelectActivity,
    onSelectIpo
}) => {
    const [logs, setLogs] = useState<UserLog[]>([]);
    const [loading, setLoading] = useState(true);
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(10);
    const [searchTerm, setSearchTerm] = useState('');
    const [sortConfig, setSortConfig] = useState<{ key: keyof UserLog; direction: 'asc' | 'desc' }>({ key: 'created_at', direction: 'desc' });
    const [expandedLogId, setExpandedLogId] = useState<number | null>(null);

    useEffect(() => {
        const fetchLogs = async () => {
            if (!supabase) {
                console.warn("Supabase client not initialized.");
                setLoading(false);
                return;
            }
            setLoading(true);
            try {
                const data = await fetchAll('user_logs', 'created_at', false);
                if (data) {
                    setLogs(data as UserLog[]);
                }
            } catch (err) {
                console.error("Logs Fetch Exception:", err);
            } finally {
                setLoading(false);
            }
        };
        fetchLogs();
    }, []);

    const processedLogs = useMemo(() => {
        let filtered = [...logs];

        if (searchTerm) {
            const lower = searchTerm.toLowerCase();
            filtered = filtered.filter(log => 
                log.description.toLowerCase().includes(lower) ||
                log.username.toLowerCase().includes(lower) ||
                log.operating_unit.toLowerCase().includes(lower)
            );
        }

        filtered.sort((a, b) => {
            if (a[sortConfig.key] < b[sortConfig.key]) return sortConfig.direction === 'asc' ? -1 : 1;
            if (a[sortConfig.key] > b[sortConfig.key]) return sortConfig.direction === 'asc' ? 1 : -1;
            return 0;
        });

        return filtered;
    }, [logs, searchTerm, sortConfig]);

    const paginatedLogs = useMemo(() => {
        const startIndex = (currentPage - 1) * itemsPerPage;
        return processedLogs.slice(startIndex, startIndex + itemsPerPage);
    }, [processedLogs, currentPage, itemsPerPage]);

    const totalPages = Math.ceil(processedLogs.length / itemsPerPage);

    const requestSort = (key: keyof UserLog) => {
        let direction: 'asc' | 'desc' = 'asc';
        if (sortConfig.key === key && sortConfig.direction === 'asc') {
            direction = 'desc';
        }
        setSortConfig({ key, direction });
    };

    const formatDate = (dateStr: string) => {
        return new Date(dateStr).toLocaleString();
    };

    const handleLogClick = (log: UserLog) => {
        if (!log.entity_type || !log.entity_id) return;

        if (log.entity_type === 'Subproject') {
            const item = subprojects.find(s => String(s.id) === log.entity_id);
            if (item) onSelectSubproject(item);
            else alert("This subproject no longer exists.");
        } else if (log.entity_type === 'Activity' || log.entity_type === 'Training') {
            const item = activities.find(a => String(a.id) === log.entity_id);
            if (item) onSelectActivity(item);
            else alert("This activity no longer exists.");
        } else if (log.entity_type === 'IPO') {
            const item = ipos.find(i => String(i.id) === log.entity_id);
            if (item) onSelectIpo(item);
            else alert("This IPO no longer exists.");
        }
    };

    const SortableHeader = ({ label, sortKey }: { label: string; sortKey: keyof UserLog }) => <SortableTableHeader label={label} columnKey={String(sortKey)} sortConfig={sortConfig.key === sortKey ? { key: String(sortKey), direction: sortConfig.direction === 'asc' ? 'ascending' : 'descending' } : null} onSort={() => requestSort(sortKey)} />;

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(amount);
    };

    const renderMetadata = (metadata: any) => {
        if (!metadata || (!metadata.targets && !metadata.accomplishments)) return null;

        return (
            <div className="audit-log-detail animate-fadeIn">
                <h4 className="audit-log-detail__title"><span className="status-indicator__dot"></span>
                    Monetary Variations
                </h4>
                <div className="audit-log-detail__grid">
                    {metadata.targets && (
                        <div>
                            <p className="audit-log-detail__label">Targets</p><div className="audit-log-detail__list">
                                {Object.entries(metadata.targets).map(([key, val]: [string, any]) => (
                                    <div key={key} className="audit-log-detail__change">
                                        <strong>{key}:</strong><div><del>{formatCurrency(val.old)}</del><span>→</span><ins>{formatCurrency(val.new)}</ins>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                    {metadata.accomplishments && (
                        <div>
                            <p className="audit-log-detail__label">Accomplishments</p><div className="audit-log-detail__list">
                                {Object.entries(metadata.accomplishments).map(([key, val]: [string, any]) => (
                                    <div key={key} className="audit-log-detail__change">
                                        <strong>{key}:</strong><div><del>{formatCurrency(val.old)}</del><span>→</span><ins>{formatCurrency(val.new)}</ins>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        );
    };

    const toggleExpand = (id: number) => {
        setExpandedLogId(expandedLogId === id ? null : id);
    };

    return (
        <div className="user-logs form-stack">
            <header className="section-heading user-logs__header">
                <h3 className="section-heading__title">User Audit Logs</h3>
                <div>
                    <input 
                        type="text" 
                        placeholder="Search logs..." 
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="form-control data-table-search"
                    />
                </div>
            </header>

            <div className="data-table-card"><div className="data-table-scroll user-logs__table-scroll">
                <table className="data-table user-logs__table">
                    <thead>
                        <tr>
                            <SortableHeader label="Description" sortKey="description" />
                            <SortableHeader label="Username" sortKey="username" />
                            <SortableHeader label="Operating Unit" sortKey="operating_unit" />
                            <SortableHeader label="Timestamp" sortKey="created_at" />
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr><td colSpan={4} className="data-table__empty-cell">Loading logs...</td></tr>
                        ) : paginatedLogs.length === 0 ? (
                            <tr><td colSpan={4} className="data-table__empty-cell">No logs found.</td></tr>
                        ) : (
                            paginatedLogs.map(log => {
                                const hasMetadata = log.action_metadata && (log.action_metadata.targets || log.action_metadata.accomplishments);
                                return (
                                    <React.Fragment key={log.id}>
                                        <tr className={expandedLogId === log.id ? 'data-table__row--selected' : undefined}>
                                            <td className="data-table__cell--primary"><div className="user-log-description">
                                                    {hasMetadata && (
                                                        <button 
                                                            onClick={() => toggleExpand(log.id)}
                                                            className={`table-toggle ${expandedLogId === log.id ? 'is-expanded' : ''}`}
                                                            aria-label={`${expandedLogId === log.id ? 'Collapse' : 'Expand'} log details`}
                                                            aria-expanded={expandedLogId === log.id}
                                                        >
                                                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg>
                                                        </button>
                                                    )}
                                                    {log.entity_type && log.entity_id ? (
                                                        <button 
                                                            onClick={() => handleLogClick(log)}
                                                            className="data-table-link"
                                                        >
                                                            {log.description}
                                                        </button>
                                                    ) : (
                                                        log.description
                                                    )}
                                                </div>
                                            </td>
                                            <td className="data-table__cell--muted data-table__cell--nowrap">{log.username}</td><td className="data-table__cell--muted data-table__cell--nowrap">{log.operating_unit}</td><td className="data-table__cell--muted data-table__cell--nowrap">{formatDate(log.created_at)}</td>
                                        </tr>
                                        {expandedLogId === log.id && hasMetadata && (
                                            <tr className="data-table__detail-row"><td colSpan={4} className="data-table__detail-cell">
                                                    {renderMetadata(log.action_metadata)}
                                                </td>
                                            </tr>
                                        )}
                                    </React.Fragment>
                                );
                            })
                        )}
                    </tbody>
                </table></div></div>

            {/* Pagination */}
            <DataTablePagination aria-label="User logs pagination" currentPage={currentPage} totalPages={totalPages} totalItems={processedLogs.length} itemsPerPage={itemsPerPage} onPageChange={setCurrentPage} onItemsPerPageChange={size => { setItemsPerPage(size); setCurrentPage(1); }} />
        </div>
    );
};

export default UserLogsTab;
