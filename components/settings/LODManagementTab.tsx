// Author: 4K
import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../../supabaseClient';
import { LodSection, LodQuestion, LodChoice, LodLevelConfig } from '../../constants';
import { useLogAction } from '../../hooks/useLogAction';
import * as XLSX from 'xlsx';
import { ConfirmDialog, LoadingState } from '../ui/enterprise';

// DnD Kit Imports
import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    DragEndEvent,
} from '@dnd-kit/core';
import {
    arrayMove,
    SortableContext,
    sortableKeyboardCoordinates,
    verticalListSortingStrategy,
    useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

// --- Sortable Item Component ---
interface SortableItemProps {
    id: number;
    children: React.ReactNode;
    disabled?: boolean;
}

const SortableItem: React.FC<SortableItemProps> = ({ id, children, disabled }) => {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging
    } = useSortable({ id, disabled });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 50 : 'auto',
        position: 'relative' as const,
    };

    return (
        <div ref={setNodeRef} style={style} className={isDragging ? 'lod-builder-sortable is-dragging' : 'lod-builder-sortable'}>
            <div className="flex items-start gap-2">
                {!disabled && (
                    <div {...attributes} {...listeners} className="lod-builder-drag-handle">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M3 5a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM3 10a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM3 15a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" />
                        </svg>
                    </div>
                )}
                <div className="flex-1">{children}</div>
            </div>
        </div>
    );
};

const LODManagementTab: React.FC = () => {
    const { logAction } = useLogAction();
    const [sections, setSections] = useState<LodSection[]>([]);
    const [questions, setQuestions] = useState<LodQuestion[]>([]);
    const [choices, setChoices] = useState<LodChoice[]>([]);
    const [levelConfigs, setLevelConfigs] = useState<LodLevelConfig[]>([]);
    const [loading, setLoading] = useState(true);

    // --- LOD Score Computation State ---
    const [editingLevels, setEditingLevels] = useState<LodLevelConfig[]>([]);
    const [isEditingLevels, setIsEditingLevels] = useState(false);

    // --- Questionnaire Management State ---
    const [editingSections, setEditingSections] = useState<LodSection[]>([]);
    const [editingQuestions, setEditingQuestions] = useState<LodQuestion[]>([]);
    const [editingChoices, setEditingChoices] = useState<LodChoice[]>([]);
    const [isEditingQuestionnaire, setIsEditingQuestionnaire] = useState(false);
    const [lockedQuestionIds, setLockedQuestionIds] = useState<Set<number>>(new Set());

    // UI State
    const [expandedSectionId, setExpandedSectionId] = useState<number | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // --- Custom Confirmation Modal State ---
    const [confirmModal, setConfirmModal] = useState<{
        isOpen: boolean;
        title: string;
        message: string;
        onConfirm: () => void;
        type: 'danger' | 'info' | 'success';
    }>({
        isOpen: false,
        title: '',
        message: '',
        onConfirm: () => {},
        type: 'info'
    });

    const openConfirm = (title: string, message: string, onConfirm: () => void, type: 'danger' | 'info' | 'success' = 'info') => {
        setConfirmModal({ isOpen: true, title, message, onConfirm, type });
    };

    const closeConfirm = () => {
        setConfirmModal(prev => ({ ...prev, isOpen: false }));
    };

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
    );

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        if (!supabase) {
            console.warn("Supabase client not initialized.");
            setLoading(false);
            return;
        }
        setLoading(true);

        try {
            const { data: sData } = await supabase.from('lod_sections').select('*').order('order', { ascending: true });
            const { data: qData } = await supabase.from('lod_questions').select('*').order('order', { ascending: true });
            const { data: cData } = await supabase.from('lod_choices').select('*').order('order', { ascending: true });
            const { data: lData } = await supabase.from('lod_level_configs').select('*').order('level', { ascending: true });

            if (sData) {
                setSections(sData);
                setEditingSections(sData);
            }
            if (qData) {
                setQuestions(qData);
                setEditingQuestions(qData);
                // Lock all existing questions by default
                setLockedQuestionIds(new Set(qData.map(q => q.id)));
            }
            if (cData) {
                setChoices(cData);
                setEditingChoices(cData);
            }
            if (lData) {
                setLevelConfigs(lData);
                setEditingLevels(lData);
            }
        } catch (err) {
            console.error("LOD Fetch Error:", err);
        } finally {
            setLoading(false);
        }
    };

    // --- DRAG AND DROP HANDLERS ---

    const handleDragEndSections = (event: DragEndEvent) => {
        const { active, over } = event;
        if (over && active.id !== over.id) {
            setEditingSections((items) => {
                const oldIndex = items.findIndex((i) => i.id === active.id);
                const newIndex = items.findIndex((i) => i.id === over.id);
                const newItems = arrayMove(items, oldIndex, newIndex);
                // Update order values
                return newItems.map((item, idx): LodSection => ({ ...(item as any), order: idx + 1 }));
            });
            setIsEditingQuestionnaire(true);
        }
    };

    const handleDragEndQuestions = (event: DragEndEvent, sectionId: number) => {
        const { active, over } = event;
        if (over && active.id !== over.id) {
            setEditingQuestions((items) => {
                const sectionItems = items.filter(q => q.section_id === sectionId);
                const otherItems = items.filter(q => q.section_id !== sectionId);
                
                const oldIndex = sectionItems.findIndex((i) => i.id === active.id);
                const newIndex = sectionItems.findIndex((i) => i.id === over.id);
                const reorderedSectionItems = arrayMove(sectionItems, oldIndex, newIndex).map((item, idx): LodQuestion => ({ ...(item as any), order: idx + 1 }));
                
                return [...otherItems, ...reorderedSectionItems].sort((a, b) => {
                    if (a.section_id !== b.section_id) return a.section_id - b.section_id;
                    return a.order - b.order;
                });
            });
            setIsEditingQuestionnaire(true);
        }
    };

    const handleDragEndChoices = (event: DragEndEvent, questionId: number) => {
        const { active, over } = event;
        if (over && active.id !== over.id) {
            setEditingChoices((items) => {
                const questionItems = items.filter(c => c.question_id === questionId);
                const otherItems = items.filter(c => c.question_id !== questionId);
                
                const oldIndex = questionItems.findIndex((i) => i.id === active.id);
                const newIndex = questionItems.findIndex((i) => i.id === over.id);
                const reorderedQuestionItems = arrayMove(questionItems, oldIndex, newIndex).map((item, idx): LodChoice => ({ ...(item as any), order: idx + 1 }));
                
                return [...otherItems, ...reorderedQuestionItems].sort((a, b) => {
                    if (a.question_id !== b.question_id) return a.question_id - b.question_id;
                    return a.order - b.order;
                });
            });
            setIsEditingQuestionnaire(true);
        }
    };

    // --- LEVEL CONFIGURATION HANDLERS ---

    const handleLevelChange = (index: number, field: 'min_score' | 'max_score', value: number) => {
        const newLevels = [...editingLevels];
        newLevels[index] = { ...newLevels[index], [field]: value };
        setEditingLevels(newLevels);
    };

    const handleSaveLevels = async () => {
        if (!supabase) return;
        const { error } = await supabase.from('lod_level_configs').upsert(editingLevels);
        if (error) {
            openConfirm('Error', 'Error saving levels: ' + error.message, () => {}, 'danger');
        } else {
            setLevelConfigs(editingLevels);
            setIsEditingLevels(false);
            logAction('Updated LOD Level Ranges', '');
            openConfirm('Success', 'Level ranges saved successfully!', () => {}, 'success');
        }
    };

    const handleCancelLevels = () => {
        setEditingLevels(levelConfigs);
        setIsEditingLevels(false);
    };

    // --- QUESTIONNAIRE HANDLERS ---

    const handleSectionChange = (id: number, field: keyof LodSection, value: any) => {
        setEditingSections(prev => prev.map(s => s.id === id ? { ...s, [field]: value } : s));
        setIsEditingQuestionnaire(true);
    };

    const handleQuestionChange = (id: number, field: keyof LodQuestion, value: any) => {
        const oldWeight = editingQuestions.find(q => q.id === id)?.weight || 1;
        setEditingQuestions(prev => prev.map(q => q.id === id ? { ...q, [field]: value } : q));
        setIsEditingQuestionnaire(true);

        if (field === 'weight' && oldWeight > 0) {
            setEditingChoices(prev => prev.map(c => {
                if (c.question_id === id) {
                    const percentage = c.points / oldWeight;
                    return { ...c, points: percentage * (value as number) };
                }
                return c;
            }));
        }
    };

    const handleChoiceChange = (id: number, field: keyof LodChoice, value: any) => {
        setEditingChoices(prev => prev.map(c => c.id === id ? { ...c, [field]: value } : c));
        setIsEditingQuestionnaire(true);
    };

    const toggleQuestionLock = (id: number) => {
        setLockedQuestionIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const handleSaveQuestionnaire = async () => {
        if (!supabase) return;
        setLoading(true);
        
        try {
            // 1. Save Sections
            // Separate new sections (negative ID) from existing ones
            const sectionsToInsert = editingSections.filter(s => s.id < 0).map(({ id, ...rest }) => rest);
            const sectionsToUpdate = editingSections.filter(s => s.id >= 0);

            let allSavedSections: LodSection[] = [...sectionsToUpdate];
            if (sectionsToInsert.length > 0) {
                const { data: insertedSections, error: sInsError } = await supabase.from('lod_sections').insert(sectionsToInsert).select();
                if (sInsError) throw sInsError;
                if (insertedSections) allSavedSections = [...allSavedSections, ...insertedSections];
            }
            
            if (sectionsToUpdate.length > 0) {
                const { error: sUpError } = await supabase.from('lod_sections').upsert(sectionsToUpdate);
                if (sUpError) throw sUpError;
            }

            // 2. Save Questions
            // We need to map temporary section IDs to real ones for new questions
            const updatedQuestions = editingQuestions.map(q => {
                if (q.section_id < 0) {
                    const tempSection = editingSections.find(s => s.id === q.section_id);
                    const realSection = allSavedSections.find(s => s.code === tempSection?.code);
                    return { ...q, section_id: realSection?.id || q.section_id };
                }
                return q;
            });

            const questionsToInsert = updatedQuestions.filter(q => q.id < 0).map(({ id, ...rest }) => rest);
            const questionsToUpdate = updatedQuestions.filter(q => q.id >= 0);

            let allSavedQuestions: LodQuestion[] = [...questionsToUpdate];
            if (questionsToInsert.length > 0) {
                const { data: insertedQuestions, error: qInsError } = await supabase.from('lod_questions').insert(questionsToInsert).select();
                if (qInsError) throw qInsError;
                if (insertedQuestions) allSavedQuestions = [...allSavedQuestions, ...insertedQuestions];
            }

            if (questionsToUpdate.length > 0) {
                const { error: qUpError } = await supabase.from('lod_questions').upsert(questionsToUpdate);
                if (qUpError) throw qUpError;
            }

            // 3. Save Choices
            // Map temporary question IDs to real ones
            const updatedChoices = editingChoices.map(c => {
                if (c.question_id < 0) {
                    const tempQuestion = editingQuestions.find(q => q.id === c.question_id);
                    const realQuestion = allSavedQuestions.find(q => q.code === tempQuestion?.code);
                    return { ...c, question_id: realQuestion?.id || c.question_id };
                }
                return c;
            });

            const choicesToInsert = updatedChoices.filter(c => c.id < 0).map(({ id, ...rest }) => rest);
            const choicesToUpdate = updatedChoices.filter(c => c.id >= 0);

            if (choicesToInsert.length > 0) {
                const { error: cInsError } = await supabase.from('lod_choices').insert(choicesToInsert);
                if (cInsError) throw cInsError;
            }

            if (choicesToUpdate.length > 0) {
                const { error: cUpError } = await supabase.from('lod_choices').upsert(choicesToUpdate);
                if (cUpError) throw cUpError;
            }

            // Refresh data to get real IDs and clean state
            await fetchData();
            setIsEditingQuestionnaire(false);
            logAction('Updated LOD Questionnaire Structure', '');
            openConfirm('Success', 'Questionnaire saved successfully!', () => {}, 'success');
        } catch (error: any) {
            console.error('Save Error:', error);
            openConfirm('Error', 'Error saving questionnaire: ' + error.message, () => {}, 'danger');
        } finally {
            setLoading(false);
        }
    };

    const handleCancelQuestionnaire = () => {
        setEditingSections(sections);
        setEditingQuestions(questions);
        setEditingChoices(choices);
        setIsEditingQuestionnaire(false);
        setLockedQuestionIds(new Set(questions.map(q => q.id)));
    };

    // --- ADD / DELETE ---

    const generateCode = (prefix: string) => {
        const random = Math.floor(1000 + Math.random() * 9000);
        return `${prefix}-${random}`;
    };

    const handleAddSection = () => {
        const maxOrder = editingSections.length > 0 ? Math.max(...editingSections.map(s => s.order)) : 0;
        const tempId = Math.min(0, ...editingSections.map(s => s.id), ...editingQuestions.map(q => q.id), ...editingChoices.map(c => c.id)) - 1;
        
        const newSection: LodSection = {
            id: tempId,
            title: 'New Section',
            weight: 0,
            order: maxOrder + 1,
            code: generateCode('SEC')
        };
        setEditingSections([...editingSections, newSection]);
        setIsEditingQuestionnaire(true);
        setExpandedSectionId(tempId);
    };

    const handleDeleteSection = async (id: number) => {
        openConfirm(
            'Delete Section',
            'Are you sure you want to delete this section and all its questions? This action cannot be undone.',
            async () => {
                if (id < 0) {
                    setEditingSections(prev => prev.filter(s => s.id !== id));
                    setEditingQuestions(prev => prev.filter(q => q.section_id !== id));
                    const qIds = editingQuestions.filter(q => q.section_id === id).map(q => q.id);
                    setEditingChoices(prev => prev.filter(c => !qIds.includes(c.question_id)));
                    return;
                }

                if (!supabase) return;
                const { error } = await supabase.from('lod_sections').delete().eq('id', id);
                if (!error) {
                    setEditingSections(prev => prev.filter(s => s.id !== id));
                    setEditingQuestions(prev => prev.filter(q => q.section_id !== id));
                    const qIds = questions.filter(q => q.section_id === id).map(q => q.id);
                    setEditingChoices(prev => prev.filter(c => !qIds.includes(c.question_id)));
                    setIsEditingQuestionnaire(true);
                }
            },
            'danger'
        );
    };

    const handleAddQuestion = (sectionId: number) => {
        const sectionQuestions = editingQuestions.filter(q => q.section_id === sectionId);
        const maxOrder = sectionQuestions.length > 0 ? Math.max(...sectionQuestions.map(q => q.order)) : 0;
        const tempId = Math.min(0, ...editingSections.map(s => s.id), ...editingQuestions.map(q => q.id), ...editingChoices.map(c => c.id)) - 1;

        const newQuestion: LodQuestion = {
            id: tempId,
            section_id: sectionId,
            text: 'New Question',
            weight: 1,
            order: maxOrder + 1,
            code: generateCode('Q'),
            description: '',
            is_calculation_mode: false,
            actual_label: '',
            total_label: '',
            is_specific_answer_mode: false,
            specific_answer_label: ''
        };
        setEditingQuestions([...editingQuestions, newQuestion]);
        setIsEditingQuestionnaire(true);
        // New questions are unlocked by default
        setLockedQuestionIds(prev => {
            const next = new Set(prev);
            next.delete(tempId);
            return next;
        });
    };

    const handleDeleteQuestion = async (id: number) => {
        openConfirm(
            'Delete Question',
            'Are you sure you want to delete this question? This action cannot be undone.',
            async () => {
                if (id < 0) {
                    setEditingQuestions(prev => prev.filter(q => q.id !== id));
                    setEditingChoices(prev => prev.filter(c => c.question_id !== id));
                    return;
                }

                if (!supabase) return;
                const { error } = await supabase.from('lod_questions').delete().eq('id', id);
                if (!error) {
                    setEditingQuestions(prev => prev.filter(q => q.id !== id));
                    setEditingChoices(prev => prev.filter(c => c.question_id !== id));
                    setIsEditingQuestionnaire(true);
                }
            },
            'danger'
        );
    };

    const handleAddChoice = (questionId: number) => {
        const questionChoices = editingChoices.filter(c => c.question_id === questionId);
        const maxOrder = questionChoices.length > 0 ? Math.max(...questionChoices.map(c => c.order)) : 0;
        const tempId = Math.min(0, ...editingSections.map(s => s.id), ...editingQuestions.map(q => q.id), ...editingChoices.map(c => c.id)) - 1;

        const newChoice: LodChoice = {
            id: tempId,
            question_id: questionId,
            text: 'New Choice',
            points: 0,
            order: maxOrder + 1
        };
        setEditingChoices([...editingChoices, newChoice]);
        setIsEditingQuestionnaire(true);
    };

    const handleDeleteChoice = async (id: number) => {
        if (id < 0) {
            setEditingChoices(prev => prev.filter(c => c.id !== id));
            return;
        }

        if (!supabase) return;
        const { error } = await supabase.from('lod_choices').delete().eq('id', id);
        if (!error) {
            setEditingChoices(prev => prev.filter(c => c.id !== id));
            setIsEditingQuestionnaire(true);
        }
    };

    // --- EXCEL INTEGRATION ---

    const handleDownloadExcel = () => {
        // Prepare data for Excel
        const data = editingChoices.map(choice => {
            const question = editingQuestions.find(q => q.id === choice.question_id);
            const section = editingSections.find(s => s.id === question?.section_id);
            return {
                'Section Code': section?.code || '',
                'Section': section?.title || '',
                'Section Weight (%)': section?.weight || 0,
                'Question Code': question?.code || '',
                'Question': question?.text || '',
                'Question Weight': question?.weight || 0,
                'Description': question?.description || '',
                'Answer': choice.text,
                'Answer Percentage to Total Score (%)': question?.weight ? Math.round((choice.points / question.weight) * 100) : 0
            };
        });

        // If no choices exist yet, at least provide headers with one empty row
        if (data.length === 0) {
            data.push({
                'Section Code': 'SEC-NEW',
                'Section': 'New Section',
                'Section Weight (%)': 0,
                'Question Code': 'Q-NEW',
                'Question': 'New Question',
                'Question Weight': 0,
                'Description': '',
                'Answer': 'Choice 1',
                'Answer Percentage to Total Score (%)': 0
            });
        }

        const ws = XLSX.utils.json_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'LOD Questionnaire');
        
        // Auto-size columns
        const colWidths = [
            { wch: 15 }, // Section Code
            { wch: 30 }, // Section
            { wch: 15 }, // Section Weight
            { wch: 15 }, // Question Code
            { wch: 40 }, // Question
            { wch: 15 }, // Question Weight
            { wch: 40 }, // Description
            { wch: 30 }, // Answer
            { wch: 30 }, // Answer Percentage
        ];
        ws['!cols'] = colWidths;

        XLSX.writeFile(wb, 'LOD_Questionnaire.xlsx');
    };

    const handleUploadExcel = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (evt) => {
            try {
                const bstr = evt.target?.result;
                const wb = XLSX.read(bstr, { type: 'binary' });
                const wsname = wb.SheetNames[0];
                const ws = wb.Sheets[wsname];
                const data = XLSX.utils.sheet_to_json(ws) as any[];

                if (data.length === 0) {
                    alert('The uploaded file is empty.');
                    return;
                }

                // We will process the data and update our local state.
                // For new items, we'll need to handle them carefully.
                // To keep it simple and consistent with the "Save Changes" requirement,
                // we'll update the local editing state.
                
                let nextTempId = -1; // Use negative IDs for new items to distinguish them

                const updatedSections = [...editingSections];
                const updatedQuestions = [...editingQuestions];
                const updatedChoices = [...editingChoices];

                // Helper to find or create section
                const getSection = (code: string, title: string, weight: number) => {
                    let section = updatedSections.find(s => s.code === code && code !== 'SEC-NEW');
                    if (!section) {
                        // Try matching by title if code is new/missing
                        section = updatedSections.find(s => s.title === title);
                    }
                    
                    if (!section) {
                        const newSection: LodSection = {
                            id: nextTempId--,
                            title: title || 'New Section',
                            weight: weight || 0,
                            order: updatedSections.length + 1,
                            code: code && code !== 'SEC-NEW' ? code : `SEC-${Math.floor(1000 + Math.random() * 9000)}`
                        };
                        updatedSections.push(newSection);
                        return newSection;
                    } else {
                        section.title = title || section.title;
                        section.weight = weight !== undefined ? weight : section.weight;
                        return section;
                    }
                };

                // Helper to find or create question
                const getQuestion = (sectionId: number, code: string, text: string, weight: number, description: string) => {
                    let question = updatedQuestions.find(q => q.code === code && code !== 'Q-NEW');
                    if (!question) {
                        question = updatedQuestions.find(q => q.text === text && q.section_id === sectionId);
                    }

                    if (!question) {
                        const newQuestion: LodQuestion = {
                            id: nextTempId--,
                            section_id: sectionId,
                            text: text || 'New Question',
                            weight: weight || 0,
                            description: description || '',
                            order: updatedQuestions.filter(q => q.section_id === sectionId).length + 1,
                            code: code && code !== 'Q-NEW' ? code : `Q-${Math.floor(1000 + Math.random() * 9000)}`
                        };
                        updatedQuestions.push(newQuestion);
                        return newQuestion;
                    } else {
                        question.text = text || question.text;
                        question.weight = weight !== undefined ? weight : question.weight;
                        question.description = description || question.description;
                        question.section_id = sectionId; // In case it moved
                        return question;
                    }
                };

                // Process rows
                // Group by question to handle choices correctly
                const rowsByQuestion: { [key: string]: any[] } = {};
                data.forEach(row => {
                    const qKey = row['Question Code'] || row['Question'];
                    if (!rowsByQuestion[qKey]) rowsByQuestion[qKey] = [];
                    rowsByQuestion[qKey].push(row);
                });

                for (const qKey in rowsByQuestion) {
                    const rows = rowsByQuestion[qKey];
                    const firstRow = rows[0];
                    
                    const section = getSection(firstRow['Section Code'], firstRow['Section'], Number(firstRow['Section Weight (%)']));
                    const question = getQuestion(section.id, firstRow['Question Code'], firstRow['Question'], Number(firstRow['Question Weight']), firstRow['Description']);
                    
                    // For choices, we might want to replace them if they are significantly different,
                    // but for now let's try to match by text.
                    rows.forEach((row, idx) => {
                        const choiceText = row['Answer'];
                        const choicePercentage = Number(row['Answer Percentage to Total Score (%)']) || 0;
                        const choicePoints = (choicePercentage / 100) * question.weight;

                        let choice = updatedChoices.find(c => c.question_id === question.id && c.text === choiceText);
                        if (!choice) {
                            const newChoice: LodChoice = {
                                id: nextTempId--,
                                question_id: question.id,
                                text: choiceText || `Choice ${idx + 1}`,
                                points: choicePoints,
                                order: updatedChoices.filter(c => c.question_id === question.id).length + 1
                            };
                            updatedChoices.push(newChoice);
                        } else {
                            choice.points = choicePoints;
                        }
                    });
                }

                setEditingSections([...updatedSections]);
                setEditingQuestions([...updatedQuestions]);
                setEditingChoices([...updatedChoices]);
                setIsEditingQuestionnaire(true);
                
                // Unlock newly imported questions so user can see them
                const newQIds = updatedQuestions.filter(q => q.id < 0).map(q => q.id);
                setLockedQuestionIds(prev => {
                    const next = new Set(prev);
                    newQIds.forEach(id => next.delete(id));
                    return next;
                });

                alert('Excel data imported successfully! New items are highlighted (unlocked). Please review and click "Save Changes" to persist to database.');
            } catch (err) {
                console.error('Excel Import Error:', err);
                alert('Failed to import Excel. Please ensure the format matches the template.');
            }
        };
        reader.readAsBinaryString(file);
        // Reset file input
        if (e.target) e.target.value = '';
    };

    if (loading) return <LoadingState title="Loading LOD settings" message="Preparing score ranges and questionnaire configuration." />;

    return (
        <div className="space-y-8 pb-12">
            
            {/* SECTION 1: LOD SCORE COMPUTATION */}
            <section className="detail-card lod-management-card">
                <header className="lod-management-card__header">
                    <div>
                        <h3 className="detail-card-title">LOD Score Computation</h3>
                        <p className="lod-management-card__description">Set the score ranges for each Level of Development (1-5).</p>
                    </div>
                    <div className="lod-management-card__actions">
                        {isEditingLevels ? (
                            <>
                                <button type="button" onClick={handleCancelLevels} className="btn btn-secondary">Cancel</button>
                                <button type="button" onClick={handleSaveLevels} className="btn btn-primary">Save Changes</button>
                            </>
                        ) : (
                            <button type="button" onClick={() => setIsEditingLevels(true)} className="btn btn-primary">Edit Ranges</button>
                        )}
                    </div>
                </header>

                <div className="lod-level-grid">
                    {editingLevels.map((config, index) => (
                        <div key={config.id} className="lod-level-row">
                            <span className="lod-level-row__label">Level {config.level}</span>
                            <div className="lod-level-row__range">
                                <input 
                                    type="number" 
                                    value={config.min_score}
                                    onChange={(e) => handleLevelChange(index, 'min_score', Number(e.target.value))}
                                    disabled={!isEditingLevels}
                                    className="form-control form-control--compact lod-level-row__input"
                                />
                                <span aria-hidden="true" className="lod-level-row__separator">–</span>
                                <input 
                                    type="number" 
                                    value={config.max_score}
                                    onChange={(e) => handleLevelChange(index, 'max_score', Number(e.target.value))}
                                    disabled={!isEditingLevels}
                                    className="form-control form-control--compact lod-level-row__input"
                                />
                            </div>
                        </div>
                    ))}
                </div>
            </section>

            {/* SECTION 2: QUESTIONNAIRE MANAGEMENT */}
            <section className="detail-card lod-management-card">
                <header className="lod-management-card__header">
                    <div>
                        <h3 className="detail-card-title">Questionnaire Management</h3>
                        <p className="lod-management-card__description">Manage sections, questions, choices, and weights.</p>
                    </div>
                    <div className="lod-management-card__actions">
                        <button type="button" onClick={handleDownloadExcel} className="btn btn-secondary">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                            </svg>
                            Download Questionnaire
                        </button>
                        <button type="button" onClick={() => fileInputRef.current?.click()} className="btn btn-secondary">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                            </svg>
                            Upload Excel
                        </button>
                        <input type="file" ref={fileInputRef} onChange={handleUploadExcel} accept=".xlsx, .xls" className="file-input-hidden" />
                        
                        {isEditingQuestionnaire && (
                            <>
                                <button type="button" onClick={handleCancelQuestionnaire} className="btn btn-secondary">Cancel</button>
                                <button type="button" onClick={handleSaveQuestionnaire} className="btn btn-primary">Save Changes</button>
                            </>
                        )}
                    </div>
                </header>

                {/* Sections List */}
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEndSections}>
                    <SortableContext items={editingSections.map(s => s.id)} strategy={verticalListSortingStrategy}>
                        <div className="space-y-4">
                            {editingSections.map(section => (
                                <SortableItem key={section.id} id={section.id}>
                                    <article className="lod-builder-section">
                                        <header className="lod-builder-section__header">
                                            <div className="flex items-center gap-4 flex-1">
                                                <button 
                                                    onClick={() => setExpandedSectionId(expandedSectionId === section.id ? null : section.id)}
                                                    className="lod-builder-icon-button"
                                                    aria-label={expandedSectionId === section.id ? `Collapse ${section.title}` : `Expand ${section.title}`}
                                                >
                                                    <svg xmlns="http://www.w3.org/2000/svg" className={`h-5 w-5 transform transition-transform ${expandedSectionId === section.id ? 'rotate-90' : ''}`} viewBox="0 0 20 20" fill="currentColor">
                                                        <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                                                    </svg>
                                                </button>
                                                
                                                <div className="flex flex-col flex-1">
                                                    <div className="flex items-center gap-2">
                                                        <input 
                                                            type="text" 
                                                            value={section.title}
                                                            onChange={(e) => handleSectionChange(section.id, 'title', e.target.value)}
                                                            className="lod-builder-inline-input lod-builder-section__title"
                                                        />
                                                    </div>
                                                </div>
                                                
                                                <div className="flex items-center gap-2">
                                                    <span className="lod-builder-meta-label">Weight:</span>
                                                    <input 
                                                        type="number" 
                                                        value={section.weight}
                                                        onChange={(e) => handleSectionChange(section.id, 'weight', Number(e.target.value))}
                                                        className="lod-builder-inline-input lod-builder-weight-input"
                                                    />
                                                    <span className="lod-builder-meta-label">%</span>
                                                </div>
                                            </div>
                                            <button type="button" onClick={() => handleDeleteSection(section.id)} className="lod-builder-icon-button lod-builder-icon-button--danger" aria-label={`Delete ${section.title}`}>
                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                </svg>
                                            </button>
                                        </header>

                                        {expandedSectionId === section.id && (
                                            <div className="lod-builder-section__body">
                                                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(e) => handleDragEndQuestions(e, section.id)}>
                                                    <SortableContext items={editingQuestions.filter(q => q.section_id === section.id).map(q => q.id)} strategy={verticalListSortingStrategy}>
                                                        {editingQuestions.filter(q => q.section_id === section.id).map(question => (
                                                            <SortableItem key={question.id} id={question.id} disabled={lockedQuestionIds.has(question.id)}>
                                                                <article className={`lod-builder-question ${lockedQuestionIds.has(question.id) ? 'is-locked' : 'is-editable'}`}>
                                                                    <div className="flex justify-between items-start mb-3">
                                                                        <div className="flex-1">
                                                                            <div className="flex items-center gap-2 mb-1">
                                                                                <input 
                                                                                    type="text" 
                                                                                    value={question.text}
                                                                                    disabled={lockedQuestionIds.has(question.id)}
                                                                                    onChange={(e) => handleQuestionChange(question.id, 'text', e.target.value)}
                                                                                    className="lod-builder-inline-input lod-builder-question__title"
                                                                                />
                                                                                <button 
                                                                                    onClick={() => toggleQuestionLock(question.id)}
                                                                                    className={`lod-builder-icon-button ${lockedQuestionIds.has(question.id) ? '' : 'is-active'}`}
                                                                                    title={lockedQuestionIds.has(question.id) ? "Unlock to edit" : "Lock question"}
                                                                                >
                                                                                    {lockedQuestionIds.has(question.id) ? (
                                                                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                                                                                        </svg>
                                                                                    ) : (
                                                                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z" />
                                                                                        </svg>
                                                                                    )}
                                                                                </button>
                                                                            </div>
                                                                            <div className="mb-2">
                                                                                <textarea 
                                                                                    value={question.description || ''}
                                                                                    disabled={lockedQuestionIds.has(question.id)}
                                                                                    placeholder="Optional description/remarks to guide users"
                                                                                    onChange={(e) => handleQuestionChange(question.id, 'description', e.target.value)}
                                                                                    className="lod-builder-inline-input lod-builder-question__description"
                                                                                />
                                                                            </div>
                                                                            <div className="lod-builder-weight-row">
                                                                                <span>Weight:</span>
                                                                                <input 
                                                                                    type="number" 
                                                                                    value={question.weight}
                                                                                    disabled={lockedQuestionIds.has(question.id)}
                                                                                    onChange={(e) => handleQuestionChange(question.id, 'weight', Number(e.target.value))}
                                                                                    className="lod-builder-inline-input lod-builder-weight-input"
                                                                                />
                                                                            </div>

                                                                            {/* New: Calculation and Specific Answer Modes */}
                                                                            <div className="form-check-group lod-builder-mode-options">
                                                                                <label className="form-check">
                                                                                    <input 
                                                                                        type="checkbox" 
                                                                                        checked={question.is_calculation_mode || false}
                                                                                        disabled={lockedQuestionIds.has(question.id)}
                                                                                        onChange={(e) => handleQuestionChange(question.id, 'is_calculation_mode', e.target.checked)}
                                                                                        className="form-checkbox"
                                                                                    />
                                                                                    Calculation Mode
                                                                                </label>
                                                                                <label className="form-check">
                                                                                    <input 
                                                                                        type="checkbox" 
                                                                                        checked={question.is_specific_answer_mode || false}
                                                                                        disabled={lockedQuestionIds.has(question.id)}
                                                                                        onChange={(e) => handleQuestionChange(question.id, 'is_specific_answer_mode', e.target.checked)}
                                                                                        className="form-checkbox"
                                                                                    />
                                                                                    Specific Answer Mode
                                                                                </label>
                                                                            </div>

                                                                            {question.is_calculation_mode && (
                                                                                <div className="lod-builder-mode-panel lod-builder-mode-panel--columns">
                                                                                    <label className="form-field">
                                                                                        <span className="form-label">Actual Value Label</span>
                                                                                        <input 
                                                                                            type="text" 
                                                                                            value={question.actual_label || ''}
                                                                                            disabled={lockedQuestionIds.has(question.id)}
                                                                                            onChange={(e) => handleQuestionChange(question.id, 'actual_label', e.target.value)}
                                                                                            className="form-control form-control--compact"
                                                                                            placeholder="e.g. Actual Participants"
                                                                                        />
                                                                                    </label>
                                                                                    <label className="form-field">
                                                                                        <span className="form-label">Total Value Label</span>
                                                                                        <input 
                                                                                            type="text" 
                                                                                            value={question.total_label || ''}
                                                                                            disabled={lockedQuestionIds.has(question.id)}
                                                                                            onChange={(e) => handleQuestionChange(question.id, 'total_label', e.target.value)}
                                                                                            className="form-control form-control--compact"
                                                                                            placeholder="e.g. Total Members"
                                                                                        />
                                                                                    </label>
                                                                                </div>
                                                                            )}

                                                                            {question.is_specific_answer_mode && (
                                                                                <label className="form-field lod-builder-mode-panel">
                                                                                    <span className="form-label">Specific Answer Label</span>
                                                                                    <input 
                                                                                        type="text" 
                                                                                        value={question.specific_answer_label || ''}
                                                                                        disabled={lockedQuestionIds.has(question.id)}
                                                                                        onChange={(e) => handleQuestionChange(question.id, 'specific_answer_label', e.target.value)}
                                                                                        className="form-control form-control--compact"
                                                                                        placeholder="e.g. Average Income"
                                                                                    />
                                                                                </label>
                                                                            )}
                                                                        </div>
                                                                        {!lockedQuestionIds.has(question.id) && (
                                                                            <button type="button" onClick={() => handleDeleteQuestion(question.id)} className="lod-builder-icon-button lod-builder-icon-button--danger" aria-label="Delete question">×</button>
                                                                        )}
                                                                    </div>

                                                                    {/* Choices */}
                                                                    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(e) => handleDragEndChoices(e, question.id)}>
                                                                        <SortableContext items={editingChoices.filter(c => c.question_id === question.id).map(c => c.id)} strategy={verticalListSortingStrategy}>
                                                                            <div className="lod-builder-choice-list">
                                                                                {editingChoices.filter(c => c.question_id === question.id).map(choice => (
                                                                                    <SortableItem key={choice.id} id={choice.id} disabled={lockedQuestionIds.has(question.id)}>
                                                                                        <div className="lod-builder-choice-row">
                                                                                            <span className="lod-builder-choice-row__marker" aria-hidden="true" />
                                                                                            <input 
                                                                                                type="text" 
                                                                                                value={choice.text}
                                                                                                disabled={lockedQuestionIds.has(question.id)}
                                                                                                onChange={(e) => handleChoiceChange(choice.id, 'text', e.target.value)}
                                                                                                className="lod-builder-inline-input lod-builder-choice-row__text"
                                                                                            />
                                                                                            <div className="flex items-center gap-1">
                                                                                                <input 
                                                                                                    type="number" 
                                                                                                    value={question.weight > 0 ? Math.round((choice.points / question.weight) * 100) : 0}
                                                                                                    disabled={lockedQuestionIds.has(question.id)}
                                                                                                    onChange={(e) => {
                                                                                                        const percentage = Number(e.target.value);
                                                                                                        const points = (percentage / 100) * question.weight;
                                                                                                        handleChoiceChange(choice.id, 'points', points);
                                                                                                    }}
                                                                                                    className="lod-builder-inline-input lod-builder-choice-row__points"
                                                                                                />
                                                                                                <span className="lod-builder-meta-label">%</span>
                                                                                                <span className="lod-builder-meta-label">({Number(choice.points.toFixed(1))} pts)</span>
                                                                                            </div>
                                                                                            {!lockedQuestionIds.has(question.id) && (
                                                                                                <button type="button" onClick={() => handleDeleteChoice(choice.id)} className="lod-builder-icon-button lod-builder-icon-button--danger lod-builder-choice-row__delete" aria-label="Delete choice">×</button>
                                                                                            )}
                                                                                        </div>
                                                                                    </SortableItem>
                                                                                ))}
                                                                                {!lockedQuestionIds.has(question.id) && (
                                                                                    <button 
                                                                                        onClick={() => handleAddChoice(question.id)}
                                                                                        className="btn btn-ghost btn-sm lod-builder-add-choice"
                                                                                    >
                                                                                        + Add Choice
                                                                                    </button>
                                                                                )}
                                                                            </div>
                                                                        </SortableContext>
                                                                    </DndContext>
                                                                </article>
                                                            </SortableItem>
                                                        ))}
                                                    </SortableContext>
                                                </DndContext>
                                                
                                                <button 
                                                    onClick={() => handleAddQuestion(section.id)}
                                                    className="btn btn-secondary btn-block lod-builder-add"
                                                >
                                                    + Add Question to Section
                                                </button>
                                            </div>
                                        )}
                                    </article>
                                </SortableItem>
                            ))}
                        </div>
                    </SortableContext>
                </DndContext>

                <button 
                    onClick={handleAddSection}
                    className="btn btn-secondary btn-block lod-builder-add lod-builder-add--section"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
                    </svg>
                    Add New Section
                </button>
            </section>

            {/* Confirmation dialog */}
            {confirmModal.isOpen && (
                <ConfirmDialog
                    title={confirmModal.title}
                    description={confirmModal.message}
                    confirmLabel={confirmModal.type === 'success' || confirmModal.type === 'info' ? 'Understood' : 'Confirm'}
                    cancelLabel={confirmModal.type === 'success' || confirmModal.type === 'info' ? 'Close' : 'Cancel'}
                    tone={confirmModal.type === 'danger' ? 'danger' : 'primary'}
                    onConfirm={() => {
                        confirmModal.onConfirm();
                        closeConfirm();
                    }}
                    onCancel={closeConfirm}
                />
            )}
        </div>
    );
};

export default LODManagementTab;
