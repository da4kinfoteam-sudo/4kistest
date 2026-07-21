// Author: 4K
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Download, Upload } from 'lucide-react';
import { IPO, LodAssessment, philippineRegions, ouToRegionMap, filterYears } from '../../constants';
import { supabase } from '../../supabaseClient';
import { useAuth } from '../../contexts/AuthContext';
import { usePagination } from '../mainfunctions/TableHooks';
import { useLogAction } from '../../hooks/useLogAction';
import { DataTablePagination, LoadingState } from '../ui/enterprise';

interface LODPageProps {
    ipos: IPO[];
    onSelectIpo: (ipo: IPO) => void;
}

const LODPage: React.FC<LODPageProps> = ({ ipos, onSelectIpo }) => {
    const { currentUser } = useAuth();
    const { logAction } = useLogAction();
    const isLodAdmin = currentUser?.role === 'Super Admin' || currentUser?.role === 'Administrator';
    const [assessments, setAssessments] = useState<LodAssessment[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [filterRegion, setFilterRegion] = useState('');
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        fetchAssessments();
    }, []);

    const fetchAssessments = async () => {
        if (!supabase) return;
        const { data, error } = await supabase.from('lod_assessments').select('*');
        if (error) {
            console.error('Error fetching assessments:', error);
        } else if (data) {
            setAssessments(data);
        }
        setLoading(false);
    };

    // Determine Years to Display
    const years = useMemo(() => {
        if (assessments.length === 0) return [new Date().getFullYear()];
        const distinctYears: number[] = Array.from(new Set(assessments.map(a => a.year)));
        const currentYear = new Date().getFullYear();
        if (!distinctYears.includes(currentYear)) distinctYears.push(currentYear);
        return distinctYears.sort((a, b) => b - a); // Descending
    }, [assessments]);

    // Filter IPOs
    const filteredIPOs = useMemo(() => {
        let filtered = [...ipos];

        // OU Permission Filter
        if (currentUser?.role === 'User') {
            const userRegion = ouToRegionMap[currentUser.operatingUnit];
            if (userRegion) {
                filtered = filtered.filter(i => i.region === userRegion);
            }
        }

        if (filterRegion) {
            filtered = filtered.filter(i => i.region === filterRegion);
        }

        if (searchTerm) {
            const lower = searchTerm.toLowerCase();
            filtered = filtered.filter(i => 
                i.name.toLowerCase().includes(lower) || 
                i.location.toLowerCase().includes(lower)
            );
        }

        return filtered;
    }, [ipos, searchTerm, filterRegion, currentUser]);

    const { 
        currentPage, setCurrentPage, itemsPerPage, setItemsPerPage, totalPages, paginatedData 
    } = usePagination(filteredIPOs, [searchTerm, filterRegion]);

    const getLodForIpoYear = (ipoId: number, year: number) => {
        const assessment = assessments.find(a => a.ipo_id === ipoId && a.year === year);
        if (!assessment) return '-';
        return assessment.manual_level ?? assessment.computed_level ?? '-';
    };

    const handleExport = () => {
        if (!isLodAdmin) return;
        const XLSX = (window as any).XLSX;
        if (!XLSX) {
            alert('Excel library not loaded. Please refresh the page.');
            return;
        }

        // Use filterYears for columns, sorted ascending (2019 -> 2028)
        const exportYears = [...filterYears].sort((a, b) => parseInt(a) - parseInt(b));

        const data = filteredIPOs.map(ipo => {
            const row: any = {
                'ID': ipo.id,
                'IPO Name': ipo.name,
                'Region': ipo.region
            };
            exportYears.forEach(yearStr => {
                const year = parseInt(yearStr);
                const assessment = assessments.find(a => a.ipo_id === ipo.id && a.year === year);
                // Only export manual level to avoid confusion during import
                row[year] = assessment?.manual_level ?? ''; 
            });
            return row;
        });

        // Explicitly define headers to ensure order: ID, IPO Name, Region, then Years
        const headers = ['ID', 'IPO Name', 'Region', ...exportYears];

        const ws = XLSX.utils.json_to_sheet(data, { header: headers });
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "LOD Data");
        XLSX.writeFile(wb, "LOD_Assessments_Template.xlsx");
        logAction('Exported LOD Data', `Count: ${filteredIPOs.length}`);
    };

    const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!isLodAdmin) {
            if (fileInputRef.current) fileInputRef.current.value = '';
            return;
        }
        const file = e.target.files?.[0];
        if (!file || !supabase) return;

        const XLSX = (window as any).XLSX;
        if (!XLSX) {
            alert('Excel library not loaded. Please refresh the page.');
            return;
        }

        setLoading(true);
        const reader = new FileReader();
        reader.onload = async (evt) => {
            try {
                const data = new Uint8Array(evt.target?.result as ArrayBuffer);
                const wb = XLSX.read(data, { type: 'array' });
                const wsname = wb.SheetNames[0];
                const ws = wb.Sheets[wsname];
                const jsonData = XLSX.utils.sheet_to_json(ws);

                let updatedCount = 0;

                for (const row of jsonData as any[]) {
                    const ipoId = row['ID'];
                    if (!ipoId) continue;

                    // Find year columns (keys that are numbers)
                    const rowKeys = Object.keys(row).filter(k => !['ID', 'IPO Name', 'Region'].includes(k));
                    
                    for (const yearStr of rowKeys) {
                        const year = parseInt(yearStr);
                        if (isNaN(year)) continue;

                        const val = row[yearStr];
                        let manualLevel: number | null = null;
                        
                        if (val !== '' && val !== null && val !== undefined) {
                            const num = parseInt(val);
                            if (!isNaN(num) && num >= 1 && num <= 5) {
                                manualLevel = num;
                            } else {
                                // If invalid number, treat as null (clear it) or skip?
                                // "if it is blank then just make it null"
                                // If it's not blank but invalid, let's assume user wants to clear or made a mistake.
                                // Safest is to skip if invalid, but prompt implies blank -> null.
                                // Let's treat explicit invalid input as null too for safety? 
                                // Or just skip. Let's skip invalid numbers to be safe.
                                continue;
                            }
                        }

                        const payload = {
                            ipo_id: ipoId,
                            year: year,
                            manual_level: manualLevel,
                            updated_at: new Date().toISOString()
                        };

                        const { error } = await supabase
                            .from('lod_assessments')
                            .upsert(payload, { onConflict: 'ipo_id, year' });

                        if (!error) updatedCount++;
                    }
                }
                
                logAction('Imported LOD Data', `Rows processed: ${jsonData.length}`);
                await fetchAssessments();
                alert(`Import completed successfully! Updated assessments.`);
            } catch (err) {
                console.error('Import error:', err);
                alert('Error importing file. Please check the format.');
            } finally {
                setLoading(false);
                if (fileInputRef.current) fileInputRef.current.value = '';
            }
        };
        reader.readAsArrayBuffer(file);
    };

    return (
        <div className="data-list-page">
            <div className="data-list-header">
                <h2 className="data-list-title">Level of Development</h2>
                {isLodAdmin && (
                    <div className="data-list-actions">
                        <button 
                            onClick={handleExport}
                            className="btn btn-secondary btn-responsive"
                            title="Download Template"
                        >
                            <Download className="btn-symbol" aria-hidden="true" />
                            <span className="btn-text">Download Template</span>
                        </button>
                        <button 
                            onClick={() => fileInputRef.current?.click()}
                            className="btn btn-primary btn-responsive"
                            title="Import Assessments"
                        >
                            <Upload className="btn-symbol" aria-hidden="true" />
                            <span className="btn-text">Import Assessments</span>
                        </button>
                        <input 
                            type="file" 
                            ref={fileInputRef} 
                            className="hidden" 
                            accept=".xlsx, .xls" 
                            onChange={handleImport} 
                        />
                    </div>
                )}
            </div>

            <div className="data-table-card">
                <div className="data-table-toolbar">
                    <div className="data-toolbar-row">
                    <div className="data-toolbar-group">
                    <input 
                        type="text" 
                        placeholder="Search IPO..." 
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="data-table-search data-table-search--list px-4"
                    />
                    <div className="data-toolbar-group data-toolbar-filter">
                    <select
                        value={filterRegion}
                        onChange={(e) => setFilterRegion(e.target.value)}
                        className="data-table-select data-table-select--compact px-4"
                    >
                        <option value="">All Regions</option>
                        {philippineRegions.map(r => <option key={r} value={r}>{r}</option>)}
                    </select>
                    </div>
                    </div>
                    </div>
                </div>

                {loading ? (
                    <LoadingState title="Loading assessments" message="Preparing Level of Development records." />
                ) : (
                    <>
                        <div className="data-table-scroll">
                            <table className="data-table">
                                <thead>
                                    <tr>
                                        <th>IPO Name</th>
                                        <th>Region</th>
                                        {years.map(year => (
                                            <th key={year} className="text-center">
                                                {year}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {paginatedData.map(ipo => (
                                        <tr key={ipo.id}>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <button 
                                                    onClick={() => onSelectIpo(ipo)}
                                                    className="table-link"
                                                >
                                                    {ipo.name}
                                                </button>
                                            </td>
                                            <td className="data-table__muted-cell">
                                                {ipo.region}
                                            </td>
                                            {years.map(year => {
                                                const level = getLodForIpoYear(ipo.id, year);
                                                return (
                                                    <td key={year} className="px-6 py-4 whitespace-nowrap text-center">
                                                        <span className={`lod-level-badge ${level === '-' ? 'lod-level-badge--none' : `lod-level-badge--${level}`}`}>
                                                            {level}
                                                        </span>
                                                    </td>
                                                );
                                            })}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {/* Pagination */}
                        <DataTablePagination
                            currentPage={currentPage}
                            totalPages={totalPages}
                            totalItems={filteredIPOs.length}
                            itemsPerPage={itemsPerPage}
                            onPageChange={setCurrentPage}
                            onItemsPerPageChange={setItemsPerPage}
                            pageSizeOptions={[10, 20, 50, 100]}
                        />
                    </>
                )}
            </div>
        </div>
    );
};

export default LODPage;
