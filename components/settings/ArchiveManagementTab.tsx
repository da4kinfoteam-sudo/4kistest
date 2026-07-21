
// Author: 4K 
import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../supabaseClient';
import { TrashItem } from '../../constants';
import { useAuth } from '../../contexts/AuthContext';
import { useLogAction } from '../../hooks/useLogAction';
import { format } from 'date-fns';
import { DataTablePagination } from '../ui/enterprise';

const ArchiveManagementTab: React.FC = () => {
    const { currentUser } = useAuth();
    const { logAction } = useLogAction();
    const [items, setItems] = useState<TrashItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedIds, setSelectedIds] = useState<number[]>([]);
    const [isProcessing, setIsProcessing] = useState(false);
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(10);

    const fetchTrashItems = async () => {
        if (!supabase) {
            console.warn("Supabase client not initialized.");
            setLoading(false);
            return;
        }
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('trash_bin')
                .select('*')
                .order('deleted_at', { ascending: false });

            if (error) {
                console.error('Error fetching trash items:', error);
            } else {
                setItems(data || []);
            }
        } catch (err) {
            console.error('Archive Fetch Exception:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchTrashItems();
    }, []);

    const paginatedItems = useMemo(() => {
        const startIndex = (currentPage - 1) * itemsPerPage;
        return items.slice(startIndex, startIndex + itemsPerPage);
    }, [items, currentPage, itemsPerPage]);

    const totalPages = Math.ceil(items.length / itemsPerPage);

    const getItemName = (item: TrashItem) => {
        const data = item.data;
        if (!data) return 'N/A';
        
        switch (item.entity_type) {
            case 'subproject': return data.name || data.uid || 'Unnamed Subproject';
            case 'activity': return data.name || data.uid || 'Unnamed Activity';
            case 'office_requirement': return data.equipment || data.uid || 'Unnamed Equipment';
            case 'staffing_requirement': return data.personnelPosition || data.uid || 'Unnamed Position';
            case 'other_program_expense': return data.particulars || data.uid || 'Unnamed Expense';
            default: return data.name || data.title || data.uid || 'N/A';
        }
    };

    const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.checked) {
            setSelectedIds(items.map(i => i.id));
        } else {
            setSelectedIds([]);
        }
    };

    const handleSelectOne = (id: number) => {
        if (selectedIds.includes(id)) {
            setSelectedIds(selectedIds.filter(i => i !== id));
        } else {
            setSelectedIds([...selectedIds, id]);
        }
    };

    const getTableName = (entityType: string) => {
        switch (entityType) {
            case 'subproject': return 'subprojects';
            case 'activity': return 'activities';
            case 'office_requirement': return 'office_requirements';
            case 'staffing_requirement': return 'staffing_requirements';
            case 'other_program_expense': return 'other_program_expenses';
            default: return null;
        }
    };

    const recoverItem = async (item: TrashItem) => {
        const tableName = getTableName(item.entity_type);
        if (!tableName) {
            alert(`Unknown entity type: ${item.entity_type}`);
            return;
        }

        setIsProcessing(true);
        try {
            // 1. Insert back to original table
            const { error: insertError } = await supabase
                .from(tableName)
                .insert([item.data]);

            if (insertError) throw insertError;

            // 2. Delete from trash_bin
            const { error: deleteError } = await supabase
                .from('trash_bin')
                .delete()
                .eq('id', item.id);

            if (deleteError) throw deleteError;

            await logAction('Recovered item from archive', 'Archive', undefined, item.entity_type, String(item.original_id));
            await fetchTrashItems();
            setSelectedIds(prev => prev.filter(id => id !== item.id));
        } catch (error: any) {
            console.error('Error recovering item:', error);
            alert(`Failed to recover item: ${error.message}`);
        } finally {
            setIsProcessing(false);
        }
    };

    const permanentlyDeleteItem = async (id: number) => {
        if (!window.confirm('Are you sure you want to permanently delete this item? This action cannot be undone.')) return;

        setIsProcessing(true);
        try {
            const { error } = await supabase
                .from('trash_bin')
                .delete()
                .eq('id', id);

            if (error) throw error;

            await logAction('Permanently deleted item from archive', 'Archive', undefined, 'trash_bin', String(id));
            await fetchTrashItems();
            setSelectedIds(prev => prev.filter(sid => sid !== id));
        } catch (error: any) {
            console.error('Error deleting item:', error);
            alert(`Failed to delete item: ${error.message}`);
        } finally {
            setIsProcessing(false);
        }
    };

    const handleBulkRecover = async () => {
        if (selectedIds.length === 0) return;
        if (!window.confirm(`Are you sure you want to recover ${selectedIds.length} items?`)) return;

        setIsProcessing(true);
        let successCount = 0;
        let failCount = 0;

        for (const id of selectedIds) {
            const item = items.find(i => i.id === id);
            if (!item) continue;

            const tableName = getTableName(item.entity_type);
            if (!tableName) {
                failCount++;
                continue;
            }

            try {
                const { error: insertError } = await supabase.from(tableName).insert([item.data]);
                if (insertError) throw insertError;

                const { error: deleteError } = await supabase.from('trash_bin').delete().eq('id', item.id);
                if (deleteError) throw deleteError;

                successCount++;
            } catch (err) {
                console.error(`Failed to recover item ${id}:`, err);
                failCount++;
            }
        }

        await logAction(`Bulk recovered ${successCount} items from archive`, 'Archive', undefined, 'trash_bin');
        await fetchTrashItems();
        setSelectedIds([]);
        setIsProcessing(false);

        if (failCount > 0) {
            alert(`Recovered ${successCount} items. Failed to recover ${failCount} items.`);
        } else {
            alert(`Successfully recovered ${successCount} items.`);
        }
    };

    const handleBulkDelete = async () => {
        if (selectedIds.length === 0) return;
        if (!window.confirm(`Are you sure you want to PERMANENTLY delete ${selectedIds.length} items? This cannot be undone.`)) return;

        setIsProcessing(true);
        try {
            const { error } = await supabase
                .from('trash_bin')
                .delete()
                .in('id', selectedIds);

            if (error) throw error;

            await logAction(`Bulk permanently deleted ${selectedIds.length} items from archive`, 'Archive', undefined, 'trash_bin');
            await fetchTrashItems();
            setSelectedIds([]);
        } catch (error: any) {
            console.error('Error bulk deleting items:', error);
            alert(`Failed to delete items: ${error.message}`);
        } finally {
            setIsProcessing(false);
        }
    };

    if (loading) {
        return (
            <div className="ui-state"><div className="loading-spinner" aria-label="Loading archive" /></div>
        );
    }

    return (
        <div className="archive-management form-stack form-stack--spacious">
            <header className="section-heading archive-management__header">
                <div>
                    <h3 className="section-heading__title">Archive Management</h3>
                    <p className="section-heading__helper">Recover or permanently delete archived items.</p>
                </div>
                <div className="archive-management__actions">
                    <button
                        onClick={handleBulkRecover}
                        disabled={selectedIds.length === 0 || isProcessing}
                        className="btn-primary"
                    >
                        Recover Selected ({selectedIds.length})
                    </button>
                    <button
                        onClick={handleBulkDelete}
                        disabled={selectedIds.length === 0 || isProcessing}
                        className="btn-danger"
                    >
                        Delete Permanently ({selectedIds.length})
                    </button>
                </div>
            </header>

            <div className="data-table-card"><div className="data-table-scroll archive-management__table-scroll">
                    <table className="data-table archive-management__table">
                        <thead>
                            <tr>
                                <th className="data-table__cell--selection">
                                    <input
                                        type="checkbox"
                                        checked={selectedIds.length === paginatedItems.length && paginatedItems.length > 0}
                                        onChange={(e) => {
                                            if (e.target.checked) {
                                                setSelectedIds(paginatedItems.map(i => i.id));
                                            } else {
                                                setSelectedIds([]);
                                            }
                                        }}
                                        className="form-checkbox"
                                    />
                                </th>
                                <th>Name / Title</th><th>Entity Type</th><th>Deleted By</th><th>Deleted At</th><th className="data-table__head--actions">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {paginatedItems.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="data-table__empty-cell">
                                        No items in the archive.
                                    </td>
                                </tr>
                            ) : (
                                paginatedItems.map((item) => (
                                    <tr key={item.id} className={selectedIds.includes(item.id) ? 'data-table__row--selected' : undefined}>
                                        <td className="data-table__cell--selection">
                                            <input
                                                type="checkbox"
                                                checked={selectedIds.includes(item.id)}
                                                onChange={() => handleSelectOne(item.id)}
                                                className="form-checkbox"
                                            />
                                        </td>
                                        <td className="data-table__cell--primary data-table__cell--nowrap">
                                            {getItemName(item)}
                                        </td>
                                        <td className="data-table__cell--muted data-table__cell--nowrap">
                                            {item.entity_type.replace(/_/g, ' ')}
                                        </td>
                                        <td className="data-table__cell--muted data-table__cell--nowrap">
                                            {item.deleted_by}
                                        </td>
                                        <td className="data-table__cell--muted data-table__cell--nowrap">
                                            {format(new Date(item.deleted_at), 'MMM dd, yyyy HH:mm')}
                                        </td>
                                        <td className="data-table__cell--actions data-table__cell--nowrap"><div className="data-table__actions">
                                            <button
                                                onClick={() => recoverItem(item)}
                                                disabled={isProcessing}
                                                className="table-action table-action--edit"
                                            >
                                                Recover
                                            </button>
                                            <button
                                                onClick={() => permanentlyDeleteItem(item.id)}
                                                disabled={isProcessing}
                                                className="table-action table-action--delete"
                                            >
                                                Delete
                                            </button>
                                        </div></td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div></div>

            {/* Pagination */}
            <DataTablePagination aria-label="Archive pagination" currentPage={currentPage} totalPages={totalPages} totalItems={items.length} itemsPerPage={itemsPerPage} onPageChange={setCurrentPage} onItemsPerPageChange={size => { setItemsPerPage(size); setCurrentPage(1); }} />
        </div>
    );
};

export default ArchiveManagementTab;
