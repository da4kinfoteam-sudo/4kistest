// Author: 4K
import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../supabaseClient';
import { operatingUnits, Subproject, Activity, OfficeRequirement, StaffingRequirement, OtherProgramExpense, filterYears } from '../../constants';

interface BudgetCeilingManagementProps {
    subprojects: Subproject[];
    activities: Activity[];
    officeReqs: OfficeRequirement[];
    staffingReqs: StaffingRequirement[];
    otherProgramExpenses: OtherProgramExpense[];
}

interface BudgetCeiling {
    id: number;
    operating_unit: string;
    year: number;
    amount: number;
}

const BudgetCeilingManagement: React.FC<BudgetCeilingManagementProps> = ({
    subprojects, activities, officeReqs, staffingReqs, otherProgramExpenses
}) => {
    const [ceilings, setCeilings] = useState<BudgetCeiling[]>([]);
    const [loading, setLoading] = useState(true);
    const [editingCell, setEditingCell] = useState<{ ou: string, year: number } | null>(null);
    const [editValue, setEditValue] = useState<string>('');
    const [expandedCells, setExpandedCells] = useState<Set<string>>(new Set());
    
    // Collapsible States
    const currentYear = new Date().getFullYear();
    const [expandedYears, setExpandedYears] = useState<Set<number>>(new Set([currentYear]));
    const [collapsedOUs, setCollapsedOUs] = useState<Set<string>>(new Set());

    // Use filterYears from constants, converted to numbers for logic
    const years = useMemo(() => filterYears.map(y => parseInt(y)), []);

    useEffect(() => {
        fetchCeilings();
    }, []);

    const fetchCeilings = async () => {
        if (!supabase) return;
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('budget_ceilings')
                .select('*');
            
            if (error) throw error;
            setCeilings(data || []);
        } catch (error) {
            console.error("Error fetching budget ceilings:", error);
        } finally {
            setLoading(false);
        }
    };

    const getCeiling = (ou: string, year: number) => {
        return ceilings.find(c => c.operating_unit === ou && c.year === year)?.amount || 0;
    };

    const calculateTotalBudget = (ou: string, year: number, tier?: string, fundType?: string) => {
        let total = 0;

        // Subprojects - Calculate total from details (matching report logic)
        subprojects.filter(s => 
            s.operatingUnit === ou && 
            s.fundingYear === year &&
            (!tier || s.tier === tier) &&
            (!fundType || s.fundType === fundType)
        ).forEach(s => {
            s.details.forEach(d => {
                total += (d.pricePerUnit * d.numberOfUnits);
            });
        });

        // Activities (Trainings and Other Activities)
        activities.filter(a => 
            a.operatingUnit === ou && 
            a.fundingYear === year &&
            (!tier || a.tier === tier) &&
            (!fundType || a.fundType === fundType)
        ).forEach(a => {
            a.expenses.forEach(e => total += (e.amount || 0));
        });

        // Office Requirements
        officeReqs.filter(o => 
            o.operatingUnit === ou && 
            o.fundYear === year &&
            (!tier || o.tier === tier) &&
            (!fundType || o.fundType === fundType)
        ).forEach(o => total += (o.numberOfUnits * o.pricePerUnit));

        // Staffing Requirements - Check expenses first, then annualSalary (matching report logic)
        staffingReqs.filter(s => 
            s.operatingUnit === ou && 
            s.fundYear === year &&
            (!tier || s.tier === tier) &&
            (!fundType || s.fundType === fundType)
        ).forEach(s => {
            if (s.expenses && s.expenses.length > 0) {
                s.expenses.forEach(e => total += (e.amount || 0));
            } else {
                total += (s.annualSalary || 0);
            }
        });

        // Other Program Expenses (Missing in original logic)
        otherProgramExpenses.filter(ope => 
            ope.operatingUnit === ou && 
            ope.fundYear === year &&
            (!tier || ope.tier === tier) &&
            (!fundType || ope.fundType === fundType)
        ).forEach(ope => total += (ope.amount || 0));

        return total;
    };

    const handleCellClick = (ou: string, year: number, currentAmount: number) => {
        setEditingCell({ ou, year });
        setEditValue(currentAmount.toString());
    };

    const handleSave = async () => {
        if (!editingCell || !supabase) return;

        const { ou, year } = editingCell;
        const amount = parseFloat(editValue) || 0;

        try {
            // Check if exists
            const existing = ceilings.find(c => c.operating_unit === ou && c.year === year);

            if (existing) {
                const { error } = await supabase
                    .from('budget_ceilings')
                    .update({ amount })
                    .eq('id', existing.id);
                if (error) throw error;
            } else {
                const { error } = await supabase
                    .from('budget_ceilings')
                    .insert([{ operating_unit: ou, year, amount }]);
                if (error) throw error;
            }

            await fetchCeilings();
            setEditingCell(null);
        } catch (error) {
            console.error("Error saving budget ceiling:", error);
            alert("Failed to save budget ceiling.");
        }
    };

    const toggleDetails = (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        setExpandedCells(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    };

    const toggleYear = (year: number) => {
        setExpandedYears(prev => {
            const next = new Set(prev);
            if (next.has(year)) next.delete(year); else next.add(year);
            return next;
        });
    };

    const toggleOU = (ou: string) => {
        setCollapsedOUs(prev => {
            const next = new Set(prev);
            if (next.has(ou)) next.delete(ou); else next.add(ou);
            return next;
        });
    };

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: 0 }).format(amount);
    };

    if (loading) return <div className="ui-state">Loading budget data...</div>;

    return (
        <div className="data-table-scroll budget-ceiling-scroll">
            <table className="data-table budget-ceiling-table">
                <thead>
                    <tr>
                        <th className="data-table__sticky-left">
                            Operating Unit
                        </th>
                        {years.map(year => {
                            const isExpanded = expandedYears.has(year);
                            return (
                                <th 
                                    key={year} 
                                    onClick={() => toggleYear(year)}
                                    className={`budget-ceiling-table__year ${isExpanded ? 'is-expanded' : ''}`}
                                >
                                    <div className="budget-ceiling-table__year-label">
                                        {year}
                                        <svg xmlns="http://www.w3.org/2000/svg" className={`btn-symbol ${isExpanded ? 'is-expanded' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                        </svg>
                                    </div>
                                </th>
                            );
                        })}
                    </tr>
                </thead>
                <tbody>
                    {operatingUnits.map(ou => {
                        const isOUCollapsed = collapsedOUs.has(ou);
                        return (
                            <tr key={ou}>
                                <td className="data-table__sticky-left data-table__cell--primary data-table__cell--nowrap">
                                    <div 
                                        className="budget-ceiling-table__ou-toggle"
                                        onClick={() => toggleOU(ou)}
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" className={`btn-symbol ${isOUCollapsed ? 'is-collapsed' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                        </svg>
                                        {ou}
                                    </div>
                                </td>
                                {years.map(year => {
                                    const isYearExpanded = expandedYears.has(year);
                                    
                                    if (isOUCollapsed) {
                                        return <td key={`${ou}-${year}`} />;
                                    }

                                    const ceiling = getCeiling(ou, year);
                                    
                                    // Tier 1 Current (Main Focus)
                                    const usedTier1Current = calculateTotalBudget(ou, year, 'Tier 1', 'Current');
                                    const diff = ceiling - usedTier1Current;
                                    
                                    // Other Breakdowns
                                    const usedTier2Current = calculateTotalBudget(ou, year, 'Tier 2', 'Current');
                                    const totalUsedAll = calculateTotalBudget(ou, year);
                                    const usedOthers = totalUsedAll - (usedTier1Current + usedTier2Current);
                                    
                                    const isEditing = editingCell?.ou === ou && editingCell?.year === year;
                                    const cellId = `${ou}-${year}`;
                                    const isExpanded = expandedCells.has(cellId);

                                    return (
                                        <td key={cellId} className="data-table__cell--numeric data-table__cell--nowrap">
                                            {isYearExpanded ? (
                                                // Expanded View
                                                <div className="budget-ceiling-cell">
                                                    {/* Main Focus: Tier 1 Current */}
                                                    <div className="budget-ceiling-card">
                                                        <div className="budget-ceiling-card__title">Tier 1 (Current)</div>
                                                        
                                                        {isEditing ? (
                                                            <div className="budget-ceiling-card__edit"><span>Ceiling:</span>
                                                                <input
                                                                    type="number"
                                                                    value={editValue}
                                                                    onChange={(e) => setEditValue(e.target.value)}
                                                                    className="form-control form-control--compact"
                                                                    autoFocus
                                                                    onKeyDown={(e) => {
                                                                        if (e.key === 'Enter') handleSave();
                                                                        if (e.key === 'Escape') setEditingCell(null);
                                                                    }}
                                                                />
                                                                <button onClick={handleSave} className="table-action table-action--edit" aria-label="Save ceiling">
                                                                    <svg xmlns="http://www.w3.org/2000/svg" className="btn-symbol" viewBox="0 0 20 20" fill="currentColor">
                                                                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                                                    </svg>
                                                                </button>
                                                            </div>
                                                        ) : (
                                                            <div 
                                                                onClick={() => handleCellClick(ou, year, ceiling)}
                                                                className="budget-ceiling-card__row budget-ceiling-card__row--interactive"
                                                                title="Click to edit ceiling"
                                                            >
                                                                <span>Ceiling:</span><strong>
                                                                    {formatCurrency(ceiling)}
                                                                    <svg xmlns="http://www.w3.org/2000/svg" className="btn-symbol budget-ceiling-card__edit-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                                                    </svg>
                                                                </strong>
                                                            </div>
                                                        )}

                                                        <div className="budget-ceiling-card__row"><span>Used:</span><strong>{formatCurrency(usedTier1Current)}</strong>
                                                        </div>
                                                        
                                                        <div className={`budget-ceiling-card__row budget-ceiling-card__remaining ${diff < 0 ? 'is-negative' : ''}`}>
                                                            <span>{diff < 0 ? 'Over:' : 'Rem:'}</span>
                                                            <span>{formatCurrency(Math.abs(diff))}</span>
                                                        </div>
                                                    </div>

                                                    {/* Details Toggle */}
                                                    <button 
                                                        onClick={(e) => toggleDetails(cellId, e)}
                                                        className="budget-ceiling-card__breakdown-toggle"
                                                    >
                                                        {isExpanded ? 'Hide Details' : 'Show All Funds'}
                                                        <svg xmlns="http://www.w3.org/2000/svg" className={`btn-symbol ${isExpanded ? 'is-expanded' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                                        </svg>
                                                    </button>

                                                    {/* Collapsible Details */}
                                                    {isExpanded && (
                                                        <div className="budget-ceiling-card__breakdown animate-fadeIn">
                                                            <div>
                                                                <span>Tier 2 (Current):</span>
                                                                <span>{formatCurrency(usedTier2Current)}</span>
                                                            </div>
                                                            <div>
                                                                <span>Other Funds:</span>
                                                                <span>{formatCurrency(usedOthers)}</span>
                                                            </div>
                                                            <div className="budget-ceiling-card__breakdown-total">
                                                                <span>Grand Total:</span>
                                                                <span>{formatCurrency(totalUsedAll)}</span>
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            ) : (
                                                // Collapsed View
                                                <div className="budget-ceiling-cell__compact">
                                                    <strong title="Ceiling">
                                                        {formatCurrency(ceiling)}
                                                    </strong>
                                                    <small className={diff < 0 ? 'is-negative' : ''} title="Remaining">
                                                        {diff < 0 ? '-' : '+'}{formatCurrency(Math.abs(diff))}
                                                    </small>
                                                </div>
                                            )}
                                        </td>
                                    );
                                })}
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
};

export default BudgetCeilingManagement;
