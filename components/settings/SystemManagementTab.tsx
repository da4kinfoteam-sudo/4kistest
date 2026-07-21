
// Author: 4K
import React, { useState, useMemo } from 'react';
import { Deadline } from '../../constants';
import { supabase } from '../../supabaseClient';
import { ConfirmDialog, SortableTableHeader } from '../ui/enterprise';

interface SystemManagementTabProps {
    deadlines: Deadline[];
    setDeadlines: React.Dispatch<React.SetStateAction<Deadline[]>>;
}

const commonInputClasses = "form-control";

const SystemManagementTab: React.FC<SystemManagementTabProps> = ({ 
    deadlines, setDeadlines 
}) => {
    // Modal State
    const [isDeadlineModalOpen, setIsDeadlineModalOpen] = useState(false);
    
    // Forms
    const [deadlineForm, setDeadlineForm] = useState({ name: '', date: '' });
    
    // Edit Selection
    const [editingDeadline, setEditingDeadline] = useState<Deadline | null>(null);

    // Sorting State
    const [deadlineSort, setDeadlineSort] = useState<{ key: keyof Deadline; direction: 'asc' | 'desc' } | null>(null);

    // Bulk Selection State
    const [selectedDeadlines, setSelectedDeadlines] = useState<number[]>([]);
    const [deleteRequested, setDeleteRequested] = useState(false);

    // --- Helpers ---
    const handleSort = (key: string, type: 'deadline') => {
        setDeadlineSort(prev => ({
            key: key as keyof Deadline,
            direction: prev?.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
        }));
    };

    const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>, type: 'deadline') => {
        setSelectedDeadlines(e.target.checked ? deadlines.map(d => d.id) : []);
    };

    const handleSelectRow = (id: number, type: 'deadline') => {
        setSelectedDeadlines(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
    };

    const handleBulkDelete = async (type: 'deadline') => {
        const ids = selectedDeadlines;
        if (!ids.length) return;
        
        try {
            const table = 'deadlines';
            if (supabase) {
                const { error } = await supabase.from(table).delete().in('id', ids);
                if (error) throw error;
            }
            
            setDeadlines(prev => prev.filter(d => !ids.includes(d.id)));
            setSelectedDeadlines([]);
        } catch (error: any) {
            console.error("Error bulk deleting:", error);
            alert("Failed to delete items.");
        }
    };

    const openDeadlineModal = (deadline?: Deadline) => {
        if (deadline) {
            setEditingDeadline(deadline);
            setDeadlineForm({ name: deadline.name, date: deadline.date });
        } else {
            setEditingDeadline(null);
            setDeadlineForm({ name: '', date: '' });
        }
        setIsDeadlineModalOpen(true);
    };

    const handleDeadlineSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!deadlineForm.name || !deadlineForm.date) return;

        try {
            if (editingDeadline) {
                if (supabase) {
                    const { data, error } = await supabase.from('deadlines').update(deadlineForm).eq('id', editingDeadline.id).select().single();
                    if (error) throw error;
                    if (data) setDeadlines(prev => prev.map(d => d.id === editingDeadline.id ? data : d));
                } else {
                    setDeadlines(prev => prev.map(d => d.id === editingDeadline.id ? { ...d, ...deadlineForm } : d));
                }
            } else {
                if (supabase) {
                    const { data, error } = await supabase.from('deadlines').insert([deadlineForm]).select().single();
                    if (error) throw error;
                    if (data) setDeadlines(prev => [...prev, data]);
                } else {
                    setDeadlines(prev => [...prev, { id: Date.now(), ...deadlineForm }]);
                }
            }
            setIsDeadlineModalOpen(false);
        } catch (error: any) {
            console.error("Error saving deadline:", error);
            alert("Failed to save deadline: " + error.message);
        }
    };

    const getSortedDeadlines = useMemo(() => {
        if (!deadlineSort) return deadlines;
        return [...deadlines].sort((a, b) => {
            const aVal = a[deadlineSort.key];
            const bVal = b[deadlineSort.key];
            if (aVal < bVal) return deadlineSort.direction === 'asc' ? -1 : 1;
            if (aVal > bVal) return deadlineSort.direction === 'asc' ? 1 : -1;
            return 0;
        });
    }, [deadlines, deadlineSort]);

    const SortableHeader = ({ label, sortKey }: { label: string, sortKey: string }) => {
        const config = deadlineSort?.key === sortKey ? { key: sortKey, direction: deadlineSort.direction === 'asc' ? 'ascending' as const : 'descending' as const } : null;
        return <SortableTableHeader label={label} columnKey={sortKey} sortConfig={config} onSort={() => handleSort(sortKey, 'deadline')} />;
    };

    return (
        <div className="system-management form-stack form-stack--spacious">
            
            {/* 1. Deadlines Management */}
            <section className="form-stack">
                <header className="section-heading system-management__header">
                    <h3 className="section-heading__title">System Deadlines</h3><div className="system-management__actions">
                        {selectedDeadlines.length > 0 && (
                            <button 
                                onClick={() => setDeleteRequested(true)}
                                className="btn-danger"
                            >
                                Delete Selected ({selectedDeadlines.length})
                            </button>
                        )}
                        <button 
                            onClick={() => openDeadlineModal()} 
                            className="btn-primary"
                        >
                            + Add Deadline
                        </button>
                    </div>
                </header>
                <div className="data-table-card"><div className="data-table-scroll system-management__table-scroll">
                        <table className="data-table system-management__table">
                            <thead>
                                <tr>
                                    <th className="data-table__cell--selection">
                                        <input 
                                            type="checkbox" 
                                            onChange={(e) => handleSelectAll(e, 'deadline')}
                                            checked={deadlines.length > 0 && selectedDeadlines.length === deadlines.length}
                                            className="form-checkbox"
                                        />
                                    </th>
                                    <SortableHeader label="Name" sortKey="name" />
                                    <SortableHeader label="Date" sortKey="date" />
                                    <th className="data-table__head--actions">Actions</th>
                                </tr>
                            </thead>
            <tbody>
                                 {getSortedDeadlines.length === 0 ? (
                                     <tr><td colSpan={4} className="data-table__empty-cell">No deadlines set.</td></tr>
                                 ) : (
                                     getSortedDeadlines.map(d => (
                                         <tr key={d.id} className={selectedDeadlines.includes(d.id) ? 'data-table__row--selected' : undefined}>
                                             <td className="data-table__cell--selection">
                                                 <input 
                                                     type="checkbox" 
                                                     checked={selectedDeadlines.includes(d.id)}
                                                     onChange={() => handleSelectRow(d.id, 'deadline')}
                                                     className="form-checkbox"
                                                 />
                                             </td>
                                             <td className="data-table__cell--primary">{d.name}</td><td className="data-table__cell--muted data-table__cell--nowrap">{d.date}</td>
                                             <td className="data-table__cell--actions"><button onClick={() => openDeadlineModal(d)} className="table-action table-action--edit">Edit</button>
                                             </td>
                                         </tr>
                                     ))
                                 )}
                            </tbody>
                        </table>
                    </div></div>
            </section>

            {/* Modals */}
            {isDeadlineModalOpen && (
                <div className="modal-backdrop" role="presentation"><section className="modal-card system-deadline-modal" role="dialog" aria-modal="true" aria-labelledby="deadline-editor-title">
                        <header className="modal-card__header"><h3 id="deadline-editor-title">{editingDeadline ? 'Edit Deadline' : 'Add New Deadline'}</h3></header>
                        <form onSubmit={handleDeadlineSubmit} className="form-stack"><div className="modal-card__body form-stack"><label className="form-field"><span className="form-label">Name</span><input type="text" required value={deadlineForm.name} onChange={e => setDeadlineForm({...deadlineForm, name: e.target.value})} className={commonInputClasses} /></label><label className="form-field"><span className="form-label">Date</span><input type="date" required value={deadlineForm.date} onChange={e => setDeadlineForm({...deadlineForm, date: e.target.value})} className={commonInputClasses} /></label></div><footer className="modal-card__footer"><button type="button" onClick={() => setIsDeadlineModalOpen(false)} className="btn-secondary">Cancel</button><button type="submit" className="btn-primary">Save</button></footer></form>
                    </section>
                </div>
             )}
            {deleteRequested && <ConfirmDialog title="Delete deadlines?" description={`Delete ${selectedDeadlines.length} selected deadline(s)? This cannot be undone.`} confirmLabel="Delete Deadlines" tone="danger" onConfirm={async () => { await handleBulkDelete('deadline'); setDeleteRequested(false); }} onCancel={() => setDeleteRequested(false)} />}
        </div>
    );
};

export default SystemManagementTab;
