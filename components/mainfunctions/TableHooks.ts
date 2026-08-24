
// Author: 4K
import React, { useState, useMemo, useEffect } from 'react';
import { User } from '../../constants';

// --- Pagination Hook ---
export function usePagination<T>(data: T[], dependencies: any[] = []) {
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(10);

    // Reset to page 1 when data filters (dependencies) or page size changes
    useEffect(() => {
        setCurrentPage(1);
    }, [...dependencies, itemsPerPage]);

    const totalPages = Math.ceil(data.length / itemsPerPage) || 1;
    
    const paginatedData = useMemo(() => {
        const start = (currentPage - 1) * itemsPerPage;
        return data.slice(start, start + itemsPerPage);
    }, [data, currentPage, itemsPerPage]);

    return {
        currentPage,
        setCurrentPage,
        itemsPerPage,
        setItemsPerPage,
        totalPages,
        paginatedData
    };
}

// --- Selection / Multi-Delete Hook ---
export function useSelection<T extends { id: number }>() {
    const [isSelectionMode, setIsSelectionMode] = useState(false);
    const [selectedIds, setSelectedIds] = useState<number[]>([]);
    const [isMultiDeleteModalOpen, setIsMultiDeleteModalOpen] = useState(false);

    const toggleSelectionMode = () => {
        if (isSelectionMode) {
            setIsSelectionMode(false);
            setSelectedIds([]);
        } else {
            setIsSelectionMode(true);
        }
    };

    const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>, currentVisibleData: T[]) => {
        if (e.target.checked) {
            const ids = currentVisibleData.map(item => item.id);
            setSelectedIds(prev => Array.from(new Set([...prev, ...ids])));
        } else {
            const idsToRemove = new Set(currentVisibleData.map(item => item.id));
            setSelectedIds(prev => prev.filter(id => !idsToRemove.has(id)));
        }
    };

    const handleSelectRow = (id: number) => {
        setSelectedIds(prev => {
            if (prev.includes(id)) return prev.filter(i => i !== id);
            return [...prev, id];
        });
    };

    const resetSelection = () => {
        setIsMultiDeleteModalOpen(false);
        setIsSelectionMode(false);
        setSelectedIds([]);
    };

    return {
        isSelectionMode,
        setIsSelectionMode,
        selectedIds,
        setSelectedIds,
        isMultiDeleteModalOpen,
        setIsMultiDeleteModalOpen,
        toggleSelectionMode,
        handleSelectAll,
        handleSelectRow,
        resetSelection
    };
}

// --- Permissions Helper ---
import { useAuth } from '../../contexts/AuthContext';

export const useUserAccess = (moduleName: string) => {
    const { hasAccess, getVisibilityScope } = useAuth();
    
    // Instead of static role checks, we now check the specific AuthContext
    const canEdit = hasAccess(moduleName, 'edit');
    const canDelete = hasAccess(moduleName, 'delete');
    const canManage = hasAccess(moduleName, 'manage');
    const canViewAll = getVisibilityScope(moduleName) === 'All';
    
    return { canEdit, canDelete, canManage, canViewAll };
};
