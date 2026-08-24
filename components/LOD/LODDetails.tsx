// Author: 4K
import React, { useState, useEffect, useRef } from 'react';
import { RotateCcw, ShieldCheck } from 'lucide-react';
import { supabase } from '../../supabaseClient';
import { IPO, LodSection, LodQuestion, LodChoice, LodAssessment, LodAnswer, LodLevelConfig, LodQuestionnaireVersion } from '../../constants';
import { useAuth } from '../../contexts/AuthContext';
import { useLogAction } from '../../hooks/useLogAction';
import { useUserAccess } from '../mainfunctions/TableHooks';
import { calculateLodScore, getLodEffectiveState, isLodPublishedState } from '../../lib/lodScoring';
import { notifyLodDataChanged } from '../../lib/lodDataSync';
import { buildLodOverrideAuditMetadata } from '../../lib/lodOverrides';
import { ConfirmDialog } from '../ui/enterprise';

interface LODDetailsProps {
    ipo: IPO;
    onBack: () => void;
    initialYear?: number | null;
}

const LODDetails: React.FC<LODDetailsProps> = ({ ipo, onBack, initialYear }) => {
    const { currentUser } = useAuth();
    const { logAction } = useLogAction();
    const { canEdit, canManage } = useUserAccess('Level of Development');
    const canManageLod = canEdit && canManage;
    const isLocked = !canEdit;
    const loadSequence = useRef(0);

    const [selectedYear, setSelectedYear] = useState<number>(initialYear ?? new Date().getFullYear());

    // Structure
    const [sections, setSections] = useState<LodSection[]>([]);
    const [questions, setQuestions] = useState<LodQuestion[]>([]);
    const [choices, setChoices] = useState<LodChoice[]>([]);
    const [levelConfigs, setLevelConfigs] = useState<LodLevelConfig[]>([]);

    // Data
    const [assessment, setAssessment] = useState<LodAssessment | null>(null);
    const [answers, setAnswers] = useState<LodAnswer[]>([]);
    const [carrySource, setCarrySource] = useState<LodAssessment | null>(null);
    const [availableYears, setAvailableYears] = useState<number[]>([initialYear ?? new Date().getFullYear()]);

    // UI State
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [manualLevel, setManualLevel] = useState<number | ''>('');
    const [manualOverrideReason, setManualOverrideReason] = useState('');
    const [remarks, setRemarks] = useState('');
    const [isCarriedOver, setIsCarriedOver] = useState<boolean>(false);
    const [isDropped, setIsDropped] = useState<boolean>(false);
    const [expandedSections, setExpandedSections] = useState<Record<number, boolean>>({});
    const [showSuccessModal, setShowSuccessModal] = useState(false);
    const [showClearAllConfirm, setShowClearAllConfirm] = useState(false);
    const [saveError, setSaveError] = useState('');
    const [loadError, setLoadError] = useState('');
    const [dataReady, setDataReady] = useState(false);

    // Local Answers State (Map<QuestionId, ChoiceId>)
    const [localAnswers, setLocalAnswers] = useState<Record<number, number>>({});
    const [localAnswerRemarks, setLocalAnswerRemarks] = useState<Record<number, string>>({});
    const [localActualValues, setLocalActualValues] = useState<Record<number, number | ''>>({});
    const [localTotalValues, setLocalTotalValues] = useState<Record<number, number | ''>>({});
    const [localSpecificValues, setLocalSpecificValues] = useState<Record<number, string>>({});

    useEffect(() => {
        if (initialYear) setSelectedYear(initialYear);
    }, [initialYear]);

    useEffect(() => {
        if (!ipo) return;
        fetchAssessmentData();
        const params = new URLSearchParams(window.location.hash.split('?')[1] || '');
        params.set('id', String(ipo.id));
        params.set('year', String(selectedYear));
        window.history.replaceState(null, '', `#/lod-details?${params.toString()}`);
    }, [ipo, selectedYear]);

    const resetLocalAssessment = () => {
        setAssessment(null);
        setAnswers([]);
        setLocalAnswers({});
        setLocalAnswerRemarks({});
        setLocalActualValues({});
        setLocalTotalValues({});
        setLocalSpecificValues({});
        setManualLevel('');
        setManualOverrideReason('');
        setRemarks('');
        setIsCarriedOver(false);
        setIsDropped(false);
    };

    const fetchAssessmentData = async () => {
        const sequence = ++loadSequence.current;
        setLoading(true);
        setDataReady(false);
        setLoadError('');
        setSaveError('');
        if (!supabase || !ipo) {
            setLoadError('Database connection is unavailable.');
            setLoading(false);
            return;
        }

        try {
            const assessmentResult = await supabase
                .from('lod_assessments')
                .select('*')
                .eq('ipo_id', ipo.id)
                .eq('year', selectedYear)
                .maybeSingle();
            if (assessmentResult.error) throw assessmentResult.error;
            const currentAssessment = assessmentResult.data as LodAssessment | null;

            const versionQuery = currentAssessment?.questionnaire_version_id
                ? supabase.from('lod_questionnaire_versions').select('*').eq('id', currentAssessment.questionnaire_version_id).maybeSingle()
                : supabase.from('lod_questionnaire_versions').select('*').lte('effective_year', selectedYear)
                    .order('effective_year', { ascending: false }).order('version_number', { ascending: false }).limit(1).maybeSingle();
            const answersQuery = currentAssessment
                ? supabase.from('lod_answers').select('*').eq('assessment_id', currentAssessment.id)
                : Promise.resolve({ data: [] as LodAnswer[], error: null });
            const priorQuery = supabase.from('lod_assessments').select('*')
                .eq('ipo_id', ipo.id).lt('year', selectedYear)
                .order('year', { ascending: false }).order('id', { ascending: false });

            const [versionResult, answersResult, priorResult] = await Promise.all([versionQuery, answersQuery, priorQuery]);
            if (versionResult.error) throw versionResult.error;
            if (answersResult.error) throw answersResult.error;
            if (priorResult.error) throw priorResult.error;
            if (!versionResult.data) throw new Error(`No LOD questionnaire configuration is available for ${selectedYear}.`);
            if (sequence !== loadSequence.current) return;

            const version = versionResult.data as LodQuestionnaireVersion;
            const config = version.config;
            if (!Array.isArray(config?.sections) || !Array.isArray(config?.questions)
                || !Array.isArray(config?.choices) || !Array.isArray(config?.levels)) {
                throw new Error('The selected questionnaire version is incomplete. Saving is disabled.');
            }

            const priorAssessments = (priorResult.data || []) as LodAssessment[];
            const validPrior = priorAssessments.find(item => isLodPublishedState(getLodEffectiveState(item))) || null;
            const persistedSource = currentAssessment?.carried_over_from_assessment_id
                ? priorAssessments.find(item => Number(item.id) === Number(currentAssessment.carried_over_from_assessment_id)) || null
                : null;
            setSections(config.sections.slice().sort((left, right) => left.order - right.order));
            setQuestions(config.questions.slice().sort((left, right) => left.order - right.order));
            setChoices(config.choices.slice().sort((left, right) => left.order - right.order));
            setLevelConfigs(config.levels.slice().sort((left, right) => left.level - right.level));
            setCarrySource(persistedSource || validPrior);
            setAvailableYears(Array.from(new Set([
                selectedYear,
                new Date().getFullYear(),
                ...priorAssessments.map(item => Number(item.year)),
            ])).sort((left, right) => right - left));

            resetLocalAssessment();
            if (currentAssessment) {
                setAssessment(currentAssessment);
                setManualLevel(currentAssessment.is_complete ? '' : (currentAssessment.manual_level ?? ''));
                setManualOverrideReason(currentAssessment.is_complete ? '' : (currentAssessment.manual_override_reason ?? ''));
                setRemarks(currentAssessment.remarks ?? '');
                setIsCarriedOver(!currentAssessment.is_complete && Boolean(currentAssessment.is_carried_over));
                setIsDropped(Boolean(currentAssessment.is_dropped));
            }

            const loadedAnswers = (answersResult.data || []) as LodAnswer[];
            setAnswers(loadedAnswers);
            const initialAnswers: Record<number, number> = {};
            const initialRemarks: Record<number, string> = {};
            const initialActuals: Record<number, number | ''> = {};
            const initialTotals: Record<number, number | ''> = {};
            const initialSpecifics: Record<number, string> = {};
            loadedAnswers.forEach(answer => {
                const questionId = Number(answer.question_id);
                if (answer.choice_id !== null) initialAnswers[questionId] = Number(answer.choice_id);
                if (answer.remarks) initialRemarks[questionId] = answer.remarks;
                initialActuals[questionId] = answer.actual_value ?? '';
                initialTotals[questionId] = answer.total_value ?? '';
                initialSpecifics[questionId] = answer.specific_answer_value ?? '';
            });
            setLocalAnswers(initialAnswers);
            setLocalAnswerRemarks(initialRemarks);
            setLocalActualValues(initialActuals);
            setLocalTotalValues(initialTotals);
            setLocalSpecificValues(initialSpecifics);
            setExpandedSections(Object.fromEntries(config.sections.map((section, index) => [section.id, index === 0])));
            setDataReady(true);
        } catch (error: any) {
            if (sequence !== loadSequence.current) return;
            console.error('LOD assessment load error:', error);
            setLoadError(error?.message || 'Unable to load the complete LOD assessment.');
        } finally {
            if (sequence === loadSequence.current) setLoading(false);
        }
    };

    const handleAnswerChange = (questionId: number, choiceId: number) => {
        if (isLocked) return;
        const qId = Number(questionId);
        const cId = Number(choiceId);
        setLocalAnswers(prev => ({
            ...prev,
            [qId]: cId
        }));
    };

    const handleAnswerRemarkChange = (questionId: number, remark: string) => {
        if (isLocked) return;
        setLocalAnswerRemarks(prev => ({
            ...prev,
            [questionId]: remark
        }));
    };

    const calculateScore = () => calculateLodScore({
        sections,
        questions,
        choices,
        answers: Object.entries(localAnswers).map(([questionId, choiceId]) => ({
            question_id: Number(questionId),
            choice_id: Number(choiceId),
        })),
        levelConfigs,
    });

    const removeLocalValue = <T,>(values: Record<number, T>, questionId: number) => {
        const next = { ...values };
        delete next[questionId];
        return next;
    };

    const handleClearAnswer = (questionId: number) => {
        if (isLocked) return;
        setLocalAnswers(previous => removeLocalValue(previous, questionId));
        setLocalAnswerRemarks(previous => removeLocalValue(previous, questionId));
        setLocalActualValues(previous => removeLocalValue(previous, questionId));
        setLocalTotalValues(previous => removeLocalValue(previous, questionId));
        setLocalSpecificValues(previous => removeLocalValue(previous, questionId));
    };

    const handleClearAllAnswers = () => {
        if (isLocked) return;
        setLocalAnswers({});
        setLocalAnswerRemarks({});
        setLocalActualValues({});
        setLocalTotalValues({});
        setLocalSpecificValues({});
        setShowClearAllConfirm(false);
    };

    const handleSave = async () => {
        if (isLocked || !dataReady || loadError) return;
        if (!ipo || !supabase) return;
        setSaveError('');
        setSaving(true);

        const score = calculateScore();
        const validQuestionIds = new Set(questions.map(question => Number(question.id)));
        const validChoiceIds = new Set(choices.map(choice => Number(choice.id)));
        const answersPayload = Object.entries(localAnswers)
            .filter(([qIdStr, cId]) => {
                const qId = Number(qIdStr);
                const choiceId = Number(cId);
                return Number.isFinite(qId)
                    && Number.isFinite(choiceId)
                    && validQuestionIds.has(qId)
                    && validChoiceIds.has(choiceId);
            })
            .map(([qIdStr, cId]) => {
                const qId = Number(qIdStr);
                const choiceId = Number(cId);
                const remark = localAnswerRemarks[qId] || null;
                const actual = localActualValues[qId];
                const total = localTotalValues[qId];
                const safeNum = (val: number | '' | undefined) => {
                    if (val === '' || val === undefined || val === null) return null;
                    const n = Number(val);
                    return Number.isFinite(n) ? n : null;
                };

                return {
                    question_id: qId,
                    choice_id: choiceId,
                    remarks: remark,
                    actual_value: safeNum(actual),
                    total_value: safeNum(total),
                    specific_answer_value: localSpecificValues[qId] || null,
                };
            });

        const requestedManualLevel = canManageLod
            ? (manualLevel === '' ? null : Number(manualLevel))
            : (assessment?.manual_level ?? null);
        const manualLevelToSave = score.isComplete ? null : requestedManualLevel;
        const manualReasonToSave = manualLevelToSave !== null
            ? (manualOverrideReason || assessment?.manual_override_reason || '')
            : null;

        if (manualLevelToSave !== null && !manualReasonToSave?.trim()) {
            setSaveError('Enter a reason before retaining or applying a manual level override.');
            setSaving(false);
            return;
        }

        const carryEnabled = !score.isComplete
            && (canManageLod ? isCarriedOver : Boolean(assessment?.is_carried_over));
        const carrySourceId = carryEnabled
            ? (canManageLod ? carrySource?.id : assessment?.carried_over_from_assessment_id)
            : null;
        if (carryEnabled && !carrySourceId) {
            setSaveError('Select a valid earlier published assessment before enabling carry-over.');
            setSaving(false);
            return;
        }

        try {
            const { error } = await supabase.rpc('save_lod_assessment', {
                p_ipo_id: ipo.id,
                p_year: selectedYear,
                p_answers: answersPayload,
                p_manual_level: manualLevelToSave,
                p_manual_override_reason: manualReasonToSave,
                p_is_carried_over: carryEnabled,
                p_carried_over_from_assessment_id: carrySourceId,
                p_is_dropped: canManageLod ? isDropped : Boolean(assessment?.is_dropped),
                p_remarks: remarks || null,
                p_assessed_by: currentUser?.id ?? null,
                p_assessor_name: currentUser?.fullName || currentUser?.email || null,
            });
            if (error) throw error;

            const verification = await supabase.from('lod_assessments').select('*')
                .eq('ipo_id', ipo.id).eq('year', selectedYear).single();
            if (verification.error || !verification.data) {
                throw verification.error || new Error('The saved assessment could not be verified.');
            }
            const persisted = verification.data as LodAssessment;
            const persistedState = getLodEffectiveState(persisted);
            const expectedKind = (canManageLod ? isDropped : assessment?.is_dropped)
                ? 'dropped'
                : score.isComplete
                    ? 'computed'
                    : manualLevelToSave !== null
                        ? 'manual'
                        : carryEnabled
                            ? 'carried-over'
                            : answersPayload.length > 0
                                ? 'incomplete'
                                : 'for-assessment';
            const expectedLevel = score.isComplete
                ? score.computedLevel
                : manualLevelToSave ?? (carryEnabled ? getLodEffectiveState(carrySource).level : null);
            if (persistedState.kind !== expectedKind
                || (expectedLevel !== null && Number(persistedState.level) !== Number(expectedLevel))) {
                throw new Error(`Saved LOD verification failed. Expected ${expectedLevel ? `Level ${expectedLevel}` : expectedKind}, but received ${persistedState.label}.`);
            }

            setAssessment(persisted);
            logAction(
                'Updated LOD Assessment',
                `IPO: ${ipo.name}, Year: ${selectedYear}, State: ${persistedState.label}`,
                ipo.name,
                'LOD Assessment',
                String(persisted.id),
                manualLevelToSave !== null ? buildLodOverrideAuditMetadata({
                    ipoId: ipo.id,
                    ipoName: ipo.name,
                    year: selectedYear,
                    previousAssessment: assessment,
                    newLevel: manualLevelToSave,
                    reason: manualReasonToSave || '',
                    actorName: currentUser?.fullName || currentUser?.email || '',
                    actorRole: currentUser?.role || '',
                    source: 'lod_detail',
                }) : undefined
            );
            notifyLodDataChanged({
                ipoId: ipo.id,
                year: selectedYear,
                reason: isDropped ? 'drop' : score.isComplete ? 'save' : manualLevelToSave !== null ? 'override' : answersPayload.length === 0 ? 'clear' : 'save',
            });
            await fetchAssessmentData();
            setShowSuccessModal(true);
        } catch (error: any) {
            console.error('LOD save error:', error);
            setSaveError(error?.message || 'The assessment could not be saved.');
        } finally {
            setSaving(false);
        }
    };

    if (!ipo) return <div>Loading IPO...</div>;

    const score = calculateScore();
    const previewManualLevel = manualLevel === '' ? null : Number(manualLevel);
    const effectiveState = getLodEffectiveState({
        manual_level: previewManualLevel,
        computed_level: score.computedLevel,
        is_complete: score.isComplete,
        is_dropped: isDropped,
        is_carried_over: isCarriedOver,
        carried_over_level: getLodEffectiveState(carrySource).level,
        answered_question_count: score.answeredQuestionCount,
    });

    const toggleSection = (sectionId: number) => {
        setExpandedSections(prev => ({
            ...prev,
            [sectionId]: !prev[sectionId]
        }));
    };

    const calculateSectionScore = (sectionId: number) => {
        return score.sectionScores.find(section => section.sectionId === sectionId)?.weightedScore ?? 0;
    };

    return (
        <div className="lod-assessment detail-page">
            {/* Header */}
            <div className="detail-header">
                <div className="detail-heading">
                    <h2 className="detail-title">{ipo.name}</h2>
                    <p className="detail-meta">{ipo.location}</p>
                </div>
                <div className="form-check-group">
                    <label className="form-label form-label--inline">Assessment Year:</label>
                    <select
                        value={selectedYear}
                        onChange={(e) => setSelectedYear(Number(e.target.value))}
                        className="form-control lod-assessment__year"
                    >
                        {availableYears.map(y => (
                            <option key={y} value={y}>{y}</option>
                        ))}
                    </select>
                </div>
            </div>

            {/* Score Card */}
            <div className="detail-metric-grid">
                <div className="detail-metric lod-assessment-metric">
                    <h4 className="detail-metric-label">Effective LOD</h4>
                    <div className="lod-assessment-metric__value">
                        <span>{effectiveState.label}</span>
                    </div>
                    <p className="form-help">
                        Computed: {score.computedLevel ? `Level ${score.computedLevel}` : 'Not published'}
                        {manualLevel !== '' ? ` / Manual: Level ${manualLevel}` : ''}
                        {isCarriedOver && (assessment?.carried_over_from_year || carrySource?.year)
                            ? ` / Carried from ${assessment?.carried_over_from_year || carrySource?.year}`
                            : ''}
                    </p>
                </div>
                <div className="detail-metric lod-assessment-metric">
                    <h4 className="detail-metric-label">{score.isComplete ? 'Total Score' : 'Score Preview'}</h4>
                    <div className="lod-assessment-metric__value">
                        <span>{score.totalScore.toFixed(1)}</span>
                        <small>/ {score.maxPossibleScore.toFixed(1)}</small>
                    </div>
                    {!score.isComplete && <p className="form-help">Incomplete scores are not published.</p>}
                </div>
                <div className="detail-metric lod-assessment-metric">
                    <h4 className="detail-metric-label">Answer Coverage</h4>
                    <div className="lod-assessment-metric__value">
                        <span>{score.answeredQuestionCount}</span>
                        <small>/ {score.requiredQuestionCount}</small>
                    </div>
                    <div className="mt-2 space-y-1">
                        <p className="detail-meta">{score.coveragePercent.toFixed(0)}% answered</p>
                        {assessment?.updated_at && <span className="detail-meta">Updated {new Date(assessment.updated_at).toLocaleDateString()}</span>}
                        {assessment?.assessor_name && (
                            <p className="lod-assessment-metric__assessor">
                                <span className="detail-label">Assessed By:</span>
                                {assessment.assessor_name}
                            </p>
                        )}
                    </div>
                </div>
            </div>

            {/* Questionnaire */}
            <div className="detail-card lod-questionnaire">
                <div className="lod-questionnaire__header">
                    <h3 className="detail-card-title">Assessment Questionnaire</h3>
                    {!isLocked && Object.keys(localAnswers).length > 0 && (
                        <button type="button" className="btn btn-secondary" onClick={() => setShowClearAllConfirm(true)}>
                            <RotateCcw aria-hidden="true" />
                            Clear all answers
                        </button>
                    )}
                </div>

                {loadError && <div className="notice notice--error" role="alert"><p>{loadError}</p></div>}
                {loading ? (
                    <div className="detail-empty">Loading assessment data...</div>
                ) : loadError ? null : (
                    <div className="lod-questionnaire__sections">
                        {sections.map(section => {
                            const sectionQuestions = questions.filter(q => q.section_id === section.id);
                            if (sectionQuestions.length === 0) return null;

                            const isExpanded = !!expandedSections[section.id];
                            const sectionScore = calculateSectionScore(section.id);
                            const sectionScoreData = score.sectionScores.find(item => item.sectionId === section.id);
                            const answeredCount = sectionScoreData?.answeredQuestions ?? 0;
                            const requiredCount = sectionScoreData?.requiredQuestions ?? sectionQuestions.length;

                            return (
                                <div key={section.id} className="lod-questionnaire__section">
                                    <button
                                        onClick={() => toggleSection(section.id)}
                                        className="lod-questionnaire__toggle"
                                    >
                                        <div className="lod-questionnaire__section-heading">
                                            <div className="lod-questionnaire__section-number">
                                                {section.order}
                                            </div>
                                            <h4 className="lod-questionnaire__section-title">{section.title}</h4>
                                        </div>
                                        <div className="lod-questionnaire__section-summary">
                                            <span className={`lod-questionnaire__completion ${answeredCount === requiredCount ? 'is-complete' : ''}`}>{answeredCount} / {requiredCount} answered</span>
                                            <div className="lod-questionnaire__score">
                                                Section Score: <strong>{sectionScore.toFixed(2)}</strong>
                                                <span className="lod-questionnaire__weight-total">/ {section.weight}</span>
                                            </div>
                                            <svg
                                                xmlns="http://www.w3.org/2000/svg"
                                                className={`lod-questionnaire__chevron ${isExpanded ? 'is-open' : ''}`}
                                                fill="none"
                                                viewBox="0 0 24 24"
                                                stroke="currentColor"
                                            >
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                            </svg>
                                        </div>
                                    </button>

                                    {isExpanded && (
                                        <div className="lod-questionnaire__question-list">
                                            {sectionQuestions.map(question => {
                                                const qChoices = choices.filter(c => c.question_id === question.id);
                                                const hasQuestionData = localAnswers[question.id] !== undefined
                                                    || Boolean(localAnswerRemarks[question.id])
                                                    || localActualValues[question.id] !== undefined
                                                    || localTotalValues[question.id] !== undefined
                                                    || Boolean(localSpecificValues[question.id]);
                                                return (
                                                    <div key={question.id} className={`lod-questionnaire__question-block ${localAnswers[question.id] === undefined ? 'is-unanswered' : ''}`}>
                                                        <div className="lod-questionnaire__question-header">
                                                            <div className="lod-questionnaire__question-heading">
                                                                <p className="lod-questionnaire__question">
                                                                    {question.text}
                                                                    <span className="lod-questionnaire__weight">(Weight: {question.weight})</span>
                                                                </p>
                                                                {question.description && (
                                                                    <p className="lod-questionnaire__description">
                                                                        {question.description}
                                                                    </p>
                                                                )}

                                                                {/* Calculation Fields */}
                                                                {question.is_calculation_mode && (
                                                                    <div className="lod-questionnaire__calculation">
                                                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                                                            <div>
                                                                                <label className="form-label form-label--compact">{question.actual_label || 'Actual Value'}</label>
                                                                                <input
                                                                                    type="number"
                                                                                    value={localActualValues[question.id] ?? ''}
                                                                                    onChange={(e) => setLocalActualValues(prev => ({ ...prev, [question.id]: e.target.value === '' ? '' : Number(e.target.value) }))}
                                                                                    className="form-control form-control--compact"
                                                                                    placeholder="Enter actual number"
                                                                                    disabled={isLocked}
                                                                                />
                                                                            </div>
                                                                            <div>
                                                                                <label className="form-label form-label--compact">{question.total_label || 'Total Value'}</label>
                                                                                <input
                                                                                    type="number"
                                                                                    value={localTotalValues[question.id] ?? ''}
                                                                                    onChange={(e) => setLocalTotalValues(prev => ({ ...prev, [question.id]: e.target.value === '' ? '' : Number(e.target.value) }))}
                                                                                    className="form-control form-control--compact"
                                                                                    placeholder="Enter total number"
                                                                                    disabled={isLocked}
                                                                                />
                                                                            </div>
                                                                        </div>
                                                                        {Number(localActualValues[question.id]) >= 0 && Number(localTotalValues[question.id]) > 0 && (
                                                                            <div className="lod-questionnaire__result">
                                                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                                                                                </svg>
                                                                                Computed Result: {((Number(localActualValues[question.id]) / Number(localTotalValues[question.id])) * 100).toFixed(2)}%
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                )}

                                                                {/* Specific Answer Field */}
                                                                {question.is_specific_answer_mode && (
                                                                    <div className="lod-questionnaire__calculation lod-questionnaire__calculation--specific">
                                                                        <label className="form-label form-label--compact">{question.specific_answer_label || 'Specific Answer'}</label>
                                                                        <input
                                                                            type="text"
                                                                            value={localSpecificValues[question.id] || ''}
                                                                            onChange={(e) => {
                                                                                if (isLocked) return;
                                                                                setLocalSpecificValues(prev => ({ ...prev, [question.id]: e.target.value }));
                                                                            }}
                                                                            className="form-control form-control--compact"
                                                                            placeholder="Enter specific answer"
                                                                            disabled={isLocked}
                                                                        />
                                                                    </div>
                                                                )}
                                                            </div>
                                                            {!isLocked && hasQuestionData && (
                                                                <button
                                                                    type="button"
                                                                    className="btn btn-link lod-questionnaire__clear-answer"
                                                                    onClick={() => handleClearAnswer(question.id)}
                                                                    aria-label={`Clear answer for ${question.text}`}
                                                                >
                                                                    Clear
                                                                </button>
                                                            )}
                                                        </div>

                                                        <div className="lod-choice-grid">
                                                            {qChoices.map(choice => (
                                                                <label key={choice.id} className={`lod-choice ${Number(localAnswers[question.id]) === Number(choice.id) ? 'is-selected' : ''}`}>
                                                                    <input
                                                                        type="radio"
                                                                        name={`q-${question.id}`}
                                                                        value={choice.id}
                                                                        checked={Number(localAnswers[question.id]) === Number(choice.id)}
                                                                        onChange={() => handleAnswerChange(question.id, choice.id)}
                                                                        className="form-checkbox"
                                                                        disabled={isLocked}
                                                                    />
                                                                    <span className="lod-choice__text">{choice.text}</span>
                                                                    <span className="lod-choice__points">{Number(choice.points.toFixed(1))} pts</span>
                                                                </label>
                                                            ))}
                                                        </div>
                                                        <textarea
                                                            value={localAnswerRemarks[question.id] || ''}
                                                            onChange={(e) => handleAnswerRemarkChange(question.id, e.target.value)}
                                                            className="form-control lod-questionnaire__remarks"
                                                            placeholder="Add remarks (optional)..."
                                                            disabled={isLocked}
                                                        />
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}

            </div>

            {isLocked && (
                <div className="notice notice--warning lod-assessment__readonly">
                    <p>You have view-only access to this assessment. Request Level of Development edit permission to modify LOD records.</p>
                </div>
            )}

            <section className="detail-card lod-remarks-card">
                <header className="lod-card-header"><h3 className="detail-card-title">Overall Remarks / Notes</h3></header>
                <div className="lod-card-body">
                    <textarea value={remarks} onChange={(e) => setRemarks(e.target.value)} className="form-control lod-questionnaire__overall-remarks" placeholder="Enter any observations or notes..." disabled={isLocked} />
                </div>
            </section>

            {canManageLod && (
                <section className="detail-card lod-admin-card">
                    <header className="lod-card-header">
                        <div className="lod-admin-card__title"><ShieldCheck aria-hidden="true" /><h3 className="detail-card-title">Administrator Controls</h3></div>
                    </header>
                    <div className="lod-card-body lod-admin-controls">
                        <div className="lod-admin-controls__override">
                            <label className="form-label">Manual Level Override</label>
                            <div className="lod-manual-override-grid">
                                <select value={manualLevel} onChange={(e) => { const value = e.target.value === '' ? '' : Number(e.target.value); if (value !== manualLevel) setManualOverrideReason(''); setManualLevel(value); }} className="form-control lod-assessment__manual-level" disabled={score.isComplete}>
                                    <option value="">Auto</option>
                                    {[1, 2, 3, 4, 5].map(level => <option key={level} value={level}>Level {level}</option>)}
                                </select>
                                <input type="text" value={manualOverrideReason} onChange={(event) => setManualOverrideReason(event.target.value)} className="form-control" placeholder="Required reason for manual override" disabled={score.isComplete || manualLevel === ''} />
                            </div>
                            <span className="form-help">Manual levels apply while the questionnaire is incomplete. A completed questionnaire uses its computed level.</span>
                        </div>
                        <div className="lod-admin-controls__flags">
                            <label className="form-check lod-admin-option">
                                <input type="checkbox" checked={isCarriedOver} onChange={(e) => setIsCarriedOver(e.target.checked)} className="form-checkbox" disabled={score.isComplete || (!carrySource && !assessment?.carried_over_from_assessment_id)} />
                                <span><strong>Carry over from previous year</strong>{(assessment?.carried_over_from_year || carrySource?.year) && <small className="form-help">Source: {assessment?.carried_over_from_year || carrySource?.year} / {assessment?.carried_over_level ? `Level ${assessment.carried_over_level}` : getLodEffectiveState(carrySource).label}</small>}</span>
                            </label>
                            <label className="form-check lod-admin-option">
                                <input type="checkbox" checked={isDropped} onChange={(e) => setIsDropped(e.target.checked)} className="form-checkbox" />
                                <span><strong>IPO is Dropped</strong><small className="form-help">Excludes this IPO from the selected reporting year.</small></span>
                            </label>
                        </div>
                        {!carrySource && !assessment?.carried_over_from_assessment_id && <p className="form-help lod-admin-controls__help">No earlier published LOD is available to carry into {selectedYear}.</p>}
                    </div>
                </section>
            )}

            <section className="detail-card lod-assessment-actions">
                {saveError && <div className="notice notice--error" role="alert"><p>{saveError}</p></div>}
                <div className="form-footer">
                    <span className="lod-assessment__active-year">Assessment year <strong>{selectedYear}</strong></span>
                    <button onClick={onBack} className="btn btn-secondary">Cancel</button>
                    {!isLocked && (
                        <button onClick={handleSave} disabled={saving || !dataReady || Boolean(loadError)} className="btn btn-primary">
                            {saving ? 'Saving...' : 'Save Assessment'}
                        </button>
                    )}
                </div>
            </section>

            {showClearAllConfirm && (
                <ConfirmDialog
                    title="Clear all LOD answers?"
                    description="All selected answers and their remarks, calculation values, and specific-answer values will be removed when you save the assessment."
                    confirmLabel="Clear all answers"
                    onConfirm={handleClearAllAnswers}
                    onCancel={() => setShowClearAllConfirm(false)}
                />
            )}

            {/* Success Modal */}
            {showSuccessModal && (
                <div className="modal-backdrop" role="presentation">
                    <section className="modal-card lod-success-modal animate-in fade-in zoom-in duration-300" role="dialog" aria-modal="true" aria-labelledby="lod-success-title">
                        <div className="lod-success-modal__icon">
                            <svg xmlns="http://www.w3.org/2000/svg" className="lod-success-modal__check" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                            </svg>
                        </div>
                        <h3 id="lod-success-title">Success!</h3>
                        <p>The LOD assessment for {ipo.name} has been saved successfully.</p>
                        <button
                            onClick={() => setShowSuccessModal(false)}
                            className="btn btn-primary btn-block"
                        >
                            Great, thanks!
                        </button>
                    </section>
                </div>
            )}
        </div>
    );
};

export default LODDetails;
