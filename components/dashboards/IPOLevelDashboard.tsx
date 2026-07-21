// Author: 4K
import React, { useEffect, useMemo, useState } from 'react';
import {
    AlertTriangle,
    Award,
    BarChart3,
    ChevronDown,
    Download,
    Gauge,
    MapPin,
    Minus,
    RefreshCw,
    Search,
    TrendingDown,
    TrendingUp,
    Users,
} from 'lucide-react';
import {
    Bar,
    BarChart,
    CartesianGrid,
    Cell,
    Line,
    LineChart,
    Pie,
    PieChart,
    PolarAngleAxis,
    PolarGrid,
    PolarRadiusAxis,
    Radar,
    RadarChart,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from 'recharts';
import { IPO, LodAnswer, LodAssessment, LodChoice, LodLevelConfig, LodQuestion, LodSection } from '../../constants';
import { supabase } from '../../supabaseClient';
import { parseLocation } from '../LocationPicker';

interface IPOLevelDashboardProps {
    ipos: IPO[];
    selectedYear: string;
    onSelectLodIpo?: (ipo: IPO, year?: number) => void;
}

type ProgressionStatus = 'Improved' | 'Maintained' | 'Declined' | 'New / No Baseline' | 'Needs Assessment';

interface ComponentScore {
    weighted: number | null;
    normalized: number | null;
    percent: number | null;
    weight: number;
}

interface QuestionGapScore {
    id: number;
    question: string;
    averageScore: number | null;
    maxScore: number;
    gap: number | null;
    answeredCount: number;
    isBelowHalfWeight: boolean;
}

interface SectionGapScore {
    id: number;
    title: string;
    averageScore: number | null;
    weight: number;
    gap: number | null;
    answeredCount: number;
    questions: QuestionGapScore[];
}

interface LodDashboardRow {
    ipo: IPO;
    region: string;
    province: string;
    currentAssessment: LodAssessment | null;
    previousAssessment: LodAssessment | null;
    currentLevel: number | null;
    previousLevel: number | null;
    change: number | null;
    componentScores: Record<number, ComponentScore>;
    previousComponentScores: Record<number, ComponentScore>;
    status: ProgressionStatus;
    isHighPerforming: boolean;
    isAtRisk: boolean;
    isReadyForScaleUp: boolean;
    history: { year: number; level: number }[];
}

interface LodDashboardData {
    assessments: LodAssessment[];
    answers: LodAnswer[];
    questions: LodQuestion[];
    choices: LodChoice[];
    sections: LodSection[];
    levelConfigs: LodLevelConfig[];
}

const EMPTY_DATA: LodDashboardData = {
    assessments: [],
    answers: [],
    questions: [],
    choices: [],
    sections: [],
    levelConfigs: [],
};

const LEVEL_COLORS: Record<number, string> = {
    1: '#ef4444',
    2: '#f59e0b',
    3: '#3b82f6',
    4: '#16a34a',
    5: '#0f766e',
};

const FOR_ASSESSMENT_COLOR = '#94a3b8';

const STATUS_COLORS: Record<ProgressionStatus, string> = {
    Improved: '#16a34a',
    Maintained: '#2563eb',
    Declined: '#dc2626',
    'New / No Baseline': '#f59e0b',
    'Needs Assessment': '#94a3b8',
};

const STATUS_TEXT_CLASS: Record<ProgressionStatus, string> = {
    Improved: 'lod-status-text--green',
    Maintained: 'lod-status-text--blue',
    Declined: 'lod-status-text--red',
    'New / No Baseline': 'lod-status-text--orange',
    'Needs Assessment': 'lod-status-text--gray',
};

const LEVEL_LABELS: Record<number, string> = {
    1: 'Level 1',
    2: 'Level 2',
    3: 'Level 3',
    4: 'Level 4',
    5: 'Level 5',
};

const formatScore = (value: number | null | undefined, digits = 2) => {
    if (value === null || value === undefined || Number.isNaN(value)) return 'No Data';
    return value.toFixed(digits);
};

const formatComponentScore = (value: number | null | undefined, weight: number | null | undefined) => {
    if (value === null || value === undefined || Number.isNaN(value)) return 'No Data';
    return `${value.toFixed(2)} / ${(Number(weight) || 0).toFixed(2)}`;
};

const formatPercentagePoints = (value: number | null | undefined) => {
    if (value === null || value === undefined || Number.isNaN(value)) return 'No Data';
    return `${(value * 100).toFixed(1)} pp`;
};

const wrapLabel = (value: string, maxLineLength = 16) => {
    const words = value.split(/\s+/).filter(Boolean);
    const lines: string[] = [];

    words.forEach(word => {
        const last = lines[lines.length - 1];
        if (!last || `${last} ${word}`.length > maxLineLength) {
            lines.push(word);
        } else {
            lines[lines.length - 1] = `${last} ${word}`;
        }
    });

    return lines.length > 0 ? lines : [value];
};

const average = (values: number[]) => {
    if (values.length === 0) return null;
    return values.reduce((sum, value) => sum + value, 0) / values.length;
};

const percent = (part: number, total: number) => {
    if (total <= 0) return '0.0%';
    return `${((part / total) * 100).toFixed(1)}%`;
};

const getEffectiveLevel = (assessment: LodAssessment | null | undefined, levelConfigs: LodLevelConfig[]) => {
    if (!assessment) return null;

    const explicitLevel = Number(assessment.manual_level ?? assessment.computed_level);
    if (explicitLevel >= 1 && explicitLevel <= 5) return Math.round(explicitLevel);

    const score = Number(assessment.total_score);
    const matchedConfig = levelConfigs.find(config => score >= Number(config.min_score) && score <= Number(config.max_score));
    return matchedConfig ? Number(matchedConfig.level) : null;
};

const getAssessmentKey = (assessmentId: number, questionId: number) => `${assessmentId}:${questionId}`;

const getComponentScores = (
    assessment: LodAssessment | null,
    sections: LodSection[],
    questionsBySection: Map<number, LodQuestion[]>,
    choicesByQuestion: Map<number, LodChoice[]>,
    answersByAssessmentQuestion: Map<string, LodAnswer>
) => {
    const scores: Record<number, ComponentScore> = {};

    sections.forEach(section => {
        const sectionWeight = Number(section.weight) || 0;
        if (!assessment) {
            scores[section.id] = { weighted: null, normalized: null, percent: null, weight: sectionWeight };
            return;
        }

        const questions = questionsBySection.get(section.id) || [];
        let earned = 0;
        let possible = 0;
        let hasAnswer = false;

        questions.forEach(question => {
            const choices = choicesByQuestion.get(question.id) || [];
            const maxChoicePoints = choices.reduce((max, choice) => Math.max(max, Number(choice.points) || 0), 0);
            const questionWeight = Number(question.weight) || 1;

            if (maxChoicePoints > 0) {
                possible += maxChoicePoints * questionWeight;
            }

            const answer = answersByAssessmentQuestion.get(getAssessmentKey(assessment.id, question.id));
            if (answer) {
                hasAnswer = true;
                earned += Number(answer.points_earned) || 0;
            }
        });

        if (hasAnswer && possible > 0) {
            const sectionPercent = Math.max(0, Math.min(1, earned / possible));
            scores[section.id] = {
                weighted: sectionPercent * sectionWeight,
                normalized: sectionPercent * 5,
                percent: sectionPercent * 100,
                weight: sectionWeight,
            };
        } else {
            scores[section.id] = { weighted: null, normalized: null, percent: null, weight: sectionWeight };
        }
    });

    return scores;
};

const resolveIpoProvince = (ipo: IPO) => {
    const parsed = parseLocation(ipo.location || '');
    return parsed.province || ipo.location || 'Unspecified Province';
};

const buildSparklinePoints = (history: { year: number; level: number }[]) => {
    if (history.length === 0) return '';
    const width = 70;
    const height = 28;
    const maxLevel = 5;
    const minLevel = 1;
    const span = Math.max(1, history.length - 1);

    return history.map((point, index) => {
        const x = history.length === 1 ? width / 2 : (index / span) * width;
        const y = height - ((point.level - minLevel) / (maxLevel - minLevel)) * height;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');
};

const getInsightToneClass = (status: 'green' | 'blue' | 'orange' | 'red' | 'gray') => `lod-insight lod-insight--${status}`;

const IPOLevelDashboard: React.FC<IPOLevelDashboardProps> = ({ ipos, selectedYear, onSelectLodIpo }) => {
    const [data, setData] = useState<LodDashboardData>(EMPTY_DATA);
    const [loading, setLoading] = useState(true);
    const [fetchError, setFetchError] = useState<string | null>(null);
    const [yearFilter, setYearFilter] = useState(selectedYear || new Date().getFullYear().toString());
    const [regionFilter, setRegionFilter] = useState('All');
    const [provinceFilter, setProvinceFilter] = useState('All');
    const [statusFilter, setStatusFilter] = useState('All');
    const [levelFilter, setLevelFilter] = useState('All');
    const [searchTerm, setSearchTerm] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(10);
    const [filtersOpen, setFiltersOpen] = useState(() => typeof window === 'undefined' ? true : window.innerWidth >= 768);
    const [filtersTouched, setFiltersTouched] = useState(false);
    const [selectedGapSection, setSelectedGapSection] = useState<SectionGapScore | null>(null);
    const [isCompactChartViewport, setIsCompactChartViewport] = useState(() => typeof window !== 'undefined' && window.innerWidth < 760);

    useEffect(() => {
        setYearFilter(selectedYear || new Date().getFullYear().toString());
    }, [selectedYear]);

    useEffect(() => {
        const handleResize = () => {
            setIsCompactChartViewport(window.innerWidth < 760);
            if (!filtersTouched) {
                setFiltersOpen(window.innerWidth >= 768);
            }
        };

        window.addEventListener('resize', handleResize);
        handleResize();

        return () => window.removeEventListener('resize', handleResize);
    }, [filtersTouched]);

    useEffect(() => {
        const fetchDashboardData = async () => {
            if (!supabase) {
                setData(EMPTY_DATA);
                setLoading(false);
                return;
            }

            setLoading(true);
            setFetchError(null);

            const [
                assessmentsResult,
                answersResult,
                questionsResult,
                choicesResult,
                sectionsResult,
                levelConfigsResult,
            ] = await Promise.all([
                supabase.from('lod_assessments').select('*'),
                supabase.from('lod_answers').select('*'),
                supabase.from('lod_questions').select('*'),
                supabase.from('lod_choices').select('*'),
                supabase.from('lod_sections').select('*').order('order', { ascending: true }),
                supabase.from('lod_level_configs').select('*').order('level', { ascending: true }),
            ]);

            const firstError = assessmentsResult.error || answersResult.error || questionsResult.error || choicesResult.error || sectionsResult.error || levelConfigsResult.error;
            if (firstError) {
                console.error('Error fetching LOD dashboard data:', firstError);
                setFetchError(firstError.message || 'Unable to load LOD dashboard data.');
                setData(EMPTY_DATA);
            } else {
                setData({
                    assessments: assessmentsResult.data || [],
                    answers: answersResult.data || [],
                    questions: questionsResult.data || [],
                    choices: choicesResult.data || [],
                    sections: (sectionsResult.data || []).sort((a, b) => (a.order || 0) - (b.order || 0)),
                    levelConfigs: levelConfigsResult.data || [],
                });
            }

            setLoading(false);
        };

        fetchDashboardData();
    }, []);

    const model = useMemo(() => {
        const visibleIpoIds = new Set((ipos || []).map(ipo => Number(ipo.id)));
        const visibleAssessments = data.assessments.filter(assessment => visibleIpoIds.has(Number(assessment.ipo_id)));
        const availableYears = Array.from(
            new Set(visibleAssessments.map(assessment => Number(assessment.year)).filter(year => Number.isFinite(year)))
        ).sort((a: number, b: number) => b - a);
        const assessmentYearsByIpo = new Map<number, LodAssessment[]>();
        const questionsBySection = new Map<number, LodQuestion[]>();
        const choicesByQuestion = new Map<number, LodChoice[]>();
        const answersByAssessmentQuestion = new Map<string, LodAnswer>();

        data.questions.forEach(question => {
            const list = questionsBySection.get(question.section_id) || [];
            list.push(question);
            questionsBySection.set(question.section_id, list);
        });
        questionsBySection.forEach(list => list.sort((a, b) => (a.order || 0) - (b.order || 0)));

        data.choices.forEach(choice => {
            const list = choicesByQuestion.get(choice.question_id) || [];
            list.push(choice);
            choicesByQuestion.set(choice.question_id, list);
        });
        choicesByQuestion.forEach(list => list.sort((a, b) => (a.order || 0) - (b.order || 0)));

        data.answers.forEach(answer => {
            answersByAssessmentQuestion.set(getAssessmentKey(answer.assessment_id, answer.question_id), answer);
        });

        visibleAssessments.forEach(assessment => {
            const ipoId = Number(assessment.ipo_id);
            const list = assessmentYearsByIpo.get(ipoId) || [];
            list.push(assessment);
            assessmentYearsByIpo.set(ipoId, list);
        });
        assessmentYearsByIpo.forEach(list => list.sort((a, b) => Number(b.year) - Number(a.year)));

        const targetYear = yearFilter === 'All' ? null : Number(yearFilter);
        const rows = (ipos || []).map(ipo => {
            const ipoAssessments = assessmentYearsByIpo.get(Number(ipo.id)) || [];
            const currentAssessment = targetYear
                ? ipoAssessments.find(assessment => Number(assessment.year) === targetYear) || null
                : ipoAssessments[0] || null;
            const previousAssessment = currentAssessment
                ? ipoAssessments.find(assessment => Number(assessment.year) < Number(currentAssessment.year)) || null
                : null;
            const currentLevel = getEffectiveLevel(currentAssessment, data.levelConfigs);
            const previousLevel = getEffectiveLevel(previousAssessment, data.levelConfigs);
            const change = currentLevel !== null && previousLevel !== null ? currentLevel - previousLevel : null;
            const componentScores = getComponentScores(currentAssessment, data.sections, questionsBySection, choicesByQuestion, answersByAssessmentQuestion);
            const previousComponentScores = getComponentScores(previousAssessment, data.sections, questionsBySection, choicesByQuestion, answersByAssessmentQuestion);
            const requiredScaleUpSections = data.sections.filter(section => {
                const sectionWeight = Number(section.weight) || 0;
                const questionCount = questionsBySection.get(section.id)?.length || 0;
                return sectionWeight > 0 && questionCount > 0;
            });
            const scaleUpComponentsPass = requiredScaleUpSections.length > 0 && requiredScaleUpSections.every(section => {
                const score = componentScores[section.id];
                if (!score || score.percent === null || score.percent === undefined) return false;
                return score.percent >= 60;
            });
            const history = ipoAssessments
                .slice()
                .sort((a, b) => Number(a.year) - Number(b.year))
                .map(assessment => ({ year: Number(assessment.year), level: getEffectiveLevel(assessment, data.levelConfigs) }))
                .filter((entry): entry is { year: number; level: number } => entry.level !== null);

            let status: ProgressionStatus = 'Needs Assessment';
            if (currentAssessment && previousLevel === null) {
                status = 'New / No Baseline';
            } else if (change !== null && change > 0) {
                status = 'Improved';
            } else if (change !== null && change < 0) {
                status = 'Declined';
            } else if (change !== null) {
                status = 'Maintained';
            }

            return {
                ipo,
                region: ipo.region || 'Unspecified Region',
                province: resolveIpoProvince(ipo),
                currentAssessment,
                previousAssessment,
                currentLevel,
                previousLevel,
                change,
                componentScores,
                previousComponentScores,
                status,
                isHighPerforming: currentLevel !== null && currentLevel >= 4,
                isAtRisk: status === 'Declined' || (currentLevel !== null && currentLevel <= 1),
                isReadyForScaleUp: Boolean(
                    currentLevel !== null &&
                    currentLevel >= 3 &&
                    status !== 'Declined' &&
                    scaleUpComponentsPass
                ),
                history,
            } satisfies LodDashboardRow;
        });

        return {
            rows,
            visibleAssessments,
            availableYears,
            assessmentsByIpo: assessmentYearsByIpo,
            questionsBySection,
            choicesByQuestion,
            answersByAssessmentQuestion,
        };
    }, [data, ipos, yearFilter]);

    const regionOptions = useMemo(() => {
        return Array.from(new Set(model.rows.map(row => row.region).filter(Boolean))).sort();
    }, [model.rows]);

    const provinceOptions = useMemo(() => {
        return Array.from(new Set(model.rows
            .filter(row => regionFilter === 'All' || row.region === regionFilter)
            .map(row => row.province)
            .filter(Boolean)
        )).sort();
    }, [model.rows, regionFilter]);

    useEffect(() => {
        if (provinceFilter !== 'All' && !provinceOptions.includes(provinceFilter)) {
            setProvinceFilter('All');
        }
    }, [provinceFilter, provinceOptions]);

    const filteredRows = useMemo(() => {
        return model.rows.filter(row => {
            if (regionFilter !== 'All' && row.region !== regionFilter) return false;
            if (provinceFilter !== 'All' && row.province !== provinceFilter) return false;
            if (statusFilter !== 'All' && row.status !== statusFilter) return false;
            if (levelFilter !== 'All' && row.currentLevel !== Number(levelFilter)) return false;
            return true;
        });
    }, [levelFilter, model.rows, provinceFilter, regionFilter, statusFilter]);

    const assessedRows = filteredRows.filter(row => row.currentAssessment && row.currentLevel !== null);
    const forAssessmentRows = filteredRows.filter(row => !row.currentAssessment || row.currentLevel === null);

    const metrics = useMemo(() => {
        const assessedTotal = assessedRows.length;
        const avgLevel = average(assessedRows.map(row => row.currentLevel).filter((value): value is number => value !== null));
        const improved = filteredRows.filter(row => row.status === 'Improved').length;
        const declined = filteredRows.filter(row => row.status === 'Declined').length;
        const maintained = filteredRows.filter(row => row.status === 'Maintained').length;
        const highPerforming = filteredRows.filter(row => row.isHighPerforming).length;
        const atRisk = filteredRows.filter(row => row.isAtRisk).length;
        const readyForScaleUp = filteredRows.filter(row => row.isReadyForScaleUp).length;
        const provinceGroups = new Map<string, number[]>();

        assessedRows.forEach(row => {
            if (row.currentLevel === null) return;
            const values = provinceGroups.get(row.province) || [];
            values.push(row.currentLevel);
            provinceGroups.set(row.province, values);
        });

        const topProvince = Array.from(provinceGroups.entries())
            .map(([province, values]) => ({ province, average: average(values) || 0, count: values.length }))
            .sort((a, b) => b.average - a.average || b.count - a.count)[0] || null;

        return {
            assessedTotal,
            avgLevel,
            improved,
            declined,
            maintained,
            highPerforming,
            atRisk,
            readyForScaleUp,
            topProvince,
        };
    }, [assessedRows, filteredRows]);

    const levelDistribution = useMemo(() => {
        const totalRows = filteredRows.length;
        const assessedLevels = [1, 2, 3, 4, 5].map(level => {
            const count = assessedRows.filter(row => row.currentLevel === level).length;
            return {
                level,
                key: `level-${level}`,
                name: LEVEL_LABELS[level],
                count,
                color: LEVEL_COLORS[level],
                percent: totalRows > 0 ? (count / totalRows) * 100 : 0,
            };
        });

        return [
            ...assessedLevels,
            {
                level: 'for-assessment' as const,
                key: 'for-assessment',
                name: 'For Assessment',
                count: forAssessmentRows.length,
                color: FOR_ASSESSMENT_COLOR,
                percent: totalRows > 0 ? (forAssessmentRows.length / totalRows) * 100 : 0,
            },
        ];
    }, [assessedRows, filteredRows.length, forAssessmentRows.length]);

    const progressionByYear = useMemo(() => {
        const includedIpoIds = new Set(filteredRows.map(row => Number(row.ipo.id)));
        const years = Array.from(new Set([
            ...model.availableYears,
            ...(yearFilter !== 'All' && Number.isFinite(Number(yearFilter)) ? [Number(yearFilter)] : []),
        ])).sort((a, b) => a - b);
        const yearGroups = new Map<number, { year: number; level1: number; level2: number; level3: number; level4: number; level5: number; forAssessment: number; levels: number[] }>();

        years.forEach(year => {
            const group = { year, level1: 0, level2: 0, level3: 0, level4: 0, level5: 0, forAssessment: 0, levels: [] as number[] };

            includedIpoIds.forEach(ipoId => {
                const assessment = model.assessmentsByIpo.get(ipoId)?.find(item => Number(item.year) === year) || null;
                const level = getEffectiveLevel(assessment, data.levelConfigs);

                if (level === null) {
                    group.forAssessment += 1;
                    return;
                }

                group[`level${level}` as 'level1'] += 1;
                group.levels.push(level);
            });

            yearGroups.set(year, group);
        });

        return Array.from(yearGroups.values())
            .sort((a, b) => a.year - b.year)
            .map(group => ({
                year: group.year,
                level1: group.level1,
                level2: group.level2,
                level3: group.level3,
                level4: group.level4,
                level5: group.level5,
                forAssessment: group.forAssessment,
                average: Number((average(group.levels) || 0).toFixed(2)),
            }));
    }, [data.levelConfigs, filteredRows, model.assessmentsByIpo, model.availableYears, yearFilter]);

    const componentAverages = useMemo(() => {
        return data.sections.map(section => {
            const weightedValues = assessedRows
                .map(row => row.componentScores[section.id]?.weighted)
                .filter((value): value is number => value !== null && value !== undefined);
            const percentValues = assessedRows
                .map(row => row.componentScores[section.id]?.percent)
                .filter((value): value is number => value !== null && value !== undefined);
            return {
                id: section.id,
                component: section.title,
                score: average(weightedValues),
                percent: average(percentValues),
                weight: Number(section.weight) || 0,
                count: weightedValues.length,
            };
        });
    }, [assessedRows, data.sections]);

    const componentGapAnalysis = useMemo(() => {
        const componentsWithUtilization = componentAverages.map(component => ({
            ...component,
            utilization: component.score !== null && component.weight > 0 ? component.score / component.weight : null,
        }));
        const scoredComponents = componentsWithUtilization.filter(component => component.utilization !== null);
        const highest = scoredComponents.length > 0 ? Math.max(...scoredComponents.map(component => component.utilization || 0)) : null;

        return componentsWithUtilization.map(component => ({
            ...component,
            gap: component.utilization !== null && highest !== null ? highest - component.utilization : null,
        })).sort((a, b) => (b.gap || 0) - (a.gap || 0));
    }, [componentAverages]);

    const detailedGapAnalysis = useMemo<SectionGapScore[]>(() => {
        const componentById = new Map<number, typeof componentGapAnalysis[number]>();
        componentGapAnalysis.forEach(component => {
            componentById.set(component.id, component);
        });

        return data.sections.map(section => {
            const sectionWeight = Number(section.weight) || 0;
            const questions = model.questionsBySection.get(section.id) || [];
            const questionMaxScores = new Map<number, number>();
            const sectionMaxScore = questions.reduce((total, question) => {
                const choices = model.choicesByQuestion.get(question.id) || [];
                const maxChoicePoints = choices.reduce((max, choice) => Math.max(max, Number(choice.points) || 0), 0);
                const maxScore = maxChoicePoints * (Number(question.weight) || 1);
                questionMaxScores.set(question.id, maxScore);
                return total + maxScore;
            }, 0);

            const questionScores = questions.map(question => {
                const questionMaxScore = questionMaxScores.get(question.id) || 0;
                const maxWeightedContribution = sectionMaxScore > 0 ? (questionMaxScore / sectionMaxScore) * sectionWeight : 0;
                const values = assessedRows
                    .map(row => {
                        if (!row.currentAssessment || questionMaxScore <= 0 || sectionMaxScore <= 0) return null;
                        const answer = model.answersByAssessmentQuestion.get(getAssessmentKey(row.currentAssessment.id, question.id));
                        if (!answer) return null;
                        return ((Number(answer.points_earned) || 0) / sectionMaxScore) * sectionWeight;
                    })
                    .filter((value): value is number => value !== null);

                return {
                    id: question.id,
                    question: question.text,
                    averageScore: average(values),
                    maxScore: maxWeightedContribution,
                    gap: null,
                    answeredCount: values.length,
                    isBelowHalfWeight: false,
                } satisfies QuestionGapScore;
            });

            const questionsWithGaps = questionScores.map(question => ({
                ...question,
                gap: question.averageScore !== null ? Math.max(0, question.maxScore - question.averageScore) : null,
                isBelowHalfWeight: question.averageScore !== null && question.maxScore > 0 && question.averageScore < (question.maxScore * 0.5),
            }));

            const component = componentById.get(section.id);
            const answeredCount = assessedRows.filter(row => {
                const score = row.componentScores[section.id];
                return score?.weighted !== null && score?.weighted !== undefined;
            }).length;

            return {
                id: section.id,
                title: section.title,
                averageScore: component?.score ?? null,
                weight: sectionWeight,
                gap: component?.gap ?? null,
                answeredCount,
                questions: questionsWithGaps,
            };
        }).sort((a, b) => (b.gap || 0) - (a.gap || 0));
    }, [assessedRows, componentGapAnalysis, data.sections, model.answersByAssessmentQuestion, model.choicesByQuestion, model.questionsBySection]);

    const regionalAverages = useMemo(() => {
        const regionGroups = new Map<string, number[]>();
        assessedRows.forEach(row => {
            if (row.currentLevel === null) return;
            const values = regionGroups.get(row.region) || [];
            values.push(row.currentLevel);
            regionGroups.set(row.region, values);
        });

        return Array.from(regionGroups.entries())
            .map(([region, values]) => ({ region, score: average(values) || 0, count: values.length }))
            .sort((a, b) => b.score - a.score || b.count - a.count);
    }, [assessedRows]);

    const provinceAverages = useMemo(() => {
        const provinceGroups = new Map<string, number[]>();
        assessedRows.forEach(row => {
            if (row.currentLevel === null) return;
            const values = provinceGroups.get(row.province) || [];
            values.push(row.currentLevel);
            provinceGroups.set(row.province, values);
        });

        return Array.from(provinceGroups.entries())
            .map(([province, values]) => ({ province, score: average(values) || 0, count: values.length }))
            .sort((a, b) => b.score - a.score || b.count - a.count)
            .slice(0, 8);
    }, [assessedRows]);

    const statusDistribution = useMemo(() => {
        const statuses: ProgressionStatus[] = ['Improved', 'Maintained', 'Declined', 'New / No Baseline', 'Needs Assessment'];
        return statuses.map(status => ({
            status,
            count: filteredRows.filter(row => row.status === status).length,
        }));
    }, [filteredRows]);

    const insights = useMemo(() => {
        const strongest = componentAverages
            .filter(component => component.score !== null && component.weight > 0)
            .sort((a, b) => ((b.score || 0) / b.weight) - ((a.score || 0) / a.weight))[0] || null;
        const weakest = componentAverages
            .filter(component => component.score !== null && component.weight > 0)
            .sort((a, b) => ((a.score || 0) / a.weight) - ((b.score || 0) / b.weight))[0] || null;
        const topRegion = regionalAverages[0] || null;

        const componentDeltas = data.sections.map(section => {
            const deltas = filteredRows
                .map(row => {
                    const current = row.componentScores[section.id]?.weighted;
                    const previous = row.previousComponentScores[section.id]?.weighted;
                    return current !== null && current !== undefined && previous !== null && previous !== undefined ? current - previous : null;
                })
                .filter((value): value is number => value !== null);
            return { component: section.title, delta: average(deltas), count: deltas.length };
        }).filter(item => item.delta !== null && item.count > 0).sort((a, b) => (b.delta || 0) - (a.delta || 0))[0] || null;

        return [
            {
                tone: 'green' as const,
                text: `${metrics.improved} IPOs (${percent(metrics.improved, Math.max(1, metrics.assessedTotal))}) improved from their previous assessment.`,
            },
            {
                tone: metrics.declined > 0 ? 'red' as const : 'blue' as const,
                text: `${metrics.declined} IPOs declined and may need management review.`,
            },
            strongest ? {
                tone: 'green' as const,
                text: `${strongest.component} is the strongest component with an average score of ${formatComponentScore(strongest.score, strongest.weight)}.`,
            } : null,
            weakest ? {
                tone: 'orange' as const,
                text: `${weakest.component} is the weakest component with an average score of ${formatComponentScore(weakest.score, weakest.weight)}.`,
            } : null,
            topRegion ? {
                tone: 'blue' as const,
                text: `${topRegion.region} has the highest regional average LOD score at ${formatScore(topRegion.score)}.`,
            } : null,
            componentDeltas ? {
                tone: (componentDeltas.delta || 0) >= 0 ? 'green' as const : 'red' as const,
                text: `${componentDeltas.component} is the fastest moving component with a ${componentDeltas.delta && componentDeltas.delta >= 0 ? '+' : ''}${formatScore(componentDeltas.delta)} change.`,
            } : null,
            {
                tone: metrics.atRisk > 0 ? 'red' as const : 'gray' as const,
                text: `${metrics.atRisk} IPOs are currently tagged as at-risk.`,
            },
        ].filter((item): item is { tone: 'green' | 'blue' | 'orange' | 'red' | 'gray'; text: string } => Boolean(item));
    }, [componentAverages, data.sections, filteredRows, metrics.assessedTotal, metrics.atRisk, metrics.declined, metrics.improved, regionalAverages]);

    const searchedRows = useMemo(() => {
        const query = searchTerm.trim().toLowerCase();
        if (!query) return filteredRows;
        return filteredRows.filter(row => [
            row.ipo.name,
            row.region,
            row.province,
            row.status,
            row.currentAssessment?.year?.toString(),
        ].some(value => (value || '').toLowerCase().includes(query)));
    }, [filteredRows, searchTerm]);

    useEffect(() => {
        setCurrentPage(1);
    }, [yearFilter, regionFilter, provinceFilter, statusFilter, levelFilter, searchTerm, itemsPerPage]);

    const paginatedRows = useMemo(() => {
        const start = (currentPage - 1) * itemsPerPage;
        return searchedRows.slice(start, start + itemsPerPage);
    }, [currentPage, itemsPerPage, searchedRows]);

    const pageCount = Math.max(1, Math.ceil(searchedRows.length / itemsPerPage));

    const handleResetFilters = () => {
        setYearFilter(selectedYear || new Date().getFullYear().toString());
        setRegionFilter('All');
        setProvinceFilter('All');
        setStatusFilter('All');
        setLevelFilter('All');
        setSearchTerm('');
    };

    const handleExport = () => {
        const headers = [
            'IPO Name',
            'Region',
            'Province',
            'Assessment Year',
            'Current LOD Score',
            'Previous LOD Score',
            'Change',
            ...data.sections.map(section => section.title),
            'Status',
        ];
        const rows = searchedRows.map(row => [
            row.ipo.name,
            row.region,
            row.province,
            row.currentAssessment?.year || '',
            row.currentLevel ?? '',
            row.previousLevel ?? '',
            row.change ?? '',
            ...data.sections.map(section => {
                const score = row.componentScores[section.id];
                return score?.weighted !== null && score?.weighted !== undefined ? formatComponentScore(score.weighted, score.weight) : '';
            }),
            row.status,
        ]);
        const csv = [headers, ...rows]
            .map(row => row.map(value => `"${String(value).replace(/"/g, '""')}"`).join(','))
            .join('\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `lod-dashboard-${yearFilter.toLowerCase()}-${new Date().toISOString().slice(0, 10)}.csv`;
        link.click();
        URL.revokeObjectURL(url);
    };

    const renderMetricCard = (
        title: string,
        value: React.ReactNode,
        detail: string,
        icon: React.ReactNode,
        tone: 'green' | 'blue' | 'orange' | 'red' | 'gray' | 'purple' = 'blue'
    ) => (
        <article className={`lod-kpi-card lod-kpi-card--${tone}`}>
            <div className="lod-kpi-card__icon">{icon}</div>
            <div className="lod-kpi-card__body">
                <p>{title}</p>
                <strong>{value}</strong>
                <span>{detail}</span>
            </div>
        </article>
    );

    const radarChartMargin = isCompactChartViewport
        ? { top: 34, right: 54, bottom: 34, left: 54 }
        : { top: 34, right: 76, bottom: 34, left: 76 };

    const componentTickLabels = new Map<string, { lines: string[]; score: string }>();
    componentAverages.forEach(component => {
        componentTickLabels.set(component.component, {
            lines: wrapLabel(component.component, 15),
            score: formatComponentScore(component.score, component.weight),
        });
    });

    const renderComponentRadarTick = (props: any) => {
        const { x, y, cx, cy, payload } = props;
        const value = String(payload?.value || '');
        const label = componentTickLabels.get(value) || { lines: wrapLabel(value, 15), score: '' };
        const anchor = x > cx + 8 ? 'start' : x < cx - 8 ? 'end' : 'middle';
        const offsetX = x > cx + 8 ? 8 : x < cx - 8 ? -8 : 0;
        const offsetY = y > cy + 8 ? 10 : y < cy - 8 ? -10 : 0;
        const lineHeight = 12;
        const totalLines = label.lines.length + (label.score ? 1 : 0);
        const startY = y + offsetY - ((totalLines - 1) * lineHeight) / 2;

        return (
            <text x={x + offsetX} y={startY} textAnchor={anchor} className="lod-radar-label">
                {label.lines.map((line, index) => (
                    <tspan key={`${value}-${line}-${index}`} x={x + offsetX} dy={index === 0 ? 0 : lineHeight}>
                        {line}
                    </tspan>
                ))}
                {label.score && (
                    <tspan x={x + offsetX} dy={lineHeight} className="lod-radar-label__score">
                        {label.score}
                    </tspan>
                )}
            </text>
        );
    };

    const renderSectionIcon = (title: string, index: number) => {
        const normalizedTitle = title.toLowerCase();
        let icon: React.ReactNode = <BarChart3 />;
        if (normalizedTitle.includes('organization') || normalizedTitle.includes('maturity')) {
            icon = <Award />;
        } else if (normalizedTitle.includes('farm') || normalizedTitle.includes('income') || normalizedTitle.includes('productivity')) {
            icon = <TrendingUp />;
        } else if (normalizedTitle.includes('gender') || normalizedTitle.includes('gad')) {
            icon = <Users />;
        } else if (normalizedTitle.includes('social') || normalizedTitle.includes('service')) {
            icon = <Gauge />;
        }

        return (
            <span className={`lod-gap-section__icon lod-gap-section__icon--${(index % 5) + 1}`} aria-hidden="true">
                {icon}
            </span>
        );
    };

    const handleToggleFilters = () => {
        setFiltersTouched(true);
        setFiltersOpen(open => !open);
    };

    const handleOpenLodDetails = (row: LodDashboardRow) => {
        if (!onSelectLodIpo) return;
        const selectedDashboardYear = yearFilter !== 'All' && Number.isFinite(Number(yearFilter))
            ? Number(yearFilter)
            : row.currentAssessment?.year ? Number(row.currentAssessment.year) : undefined;
        onSelectLodIpo(row.ipo, selectedDashboardYear);
    };

    const activeFilterLabels = [
        yearFilter === 'All' ? 'Latest' : yearFilter,
        regionFilter === 'All' ? 'All Regions' : regionFilter,
        provinceFilter === 'All' ? 'All Provinces' : provinceFilter,
        statusFilter === 'All' ? 'All Statuses' : statusFilter,
        levelFilter === 'All' ? 'All Levels' : LEVEL_LABELS[Number(levelFilter)] || 'All Levels',
    ];

    if (loading) {
        return <div className="dashboard-empty dashboard-empty--center">Loading LOD dashboard data...</div>;
    }

    if (fetchError) {
        return (
            <div className="dashboard-panel">
                <p className="dashboard-empty dashboard-empty--center">{fetchError}</p>
            </div>
        );
    }

    return (
        <div className="lod-dashboard dashboard-view animate-fadeIn">
            <section className="lod-dashboard-hero" aria-labelledby="lod-dashboard-title">
                <div>
                    <p className="lod-dashboard-eyebrow">IPO Level of Development</p>
                    <h3 id="lod-dashboard-title" className="dashboard-module-title">LOD Dashboard</h3>
                </div>
                <div className="lod-dashboard-hero__meta">
                    <span>{metrics.assessedTotal} assessed IPOs</span>
                    <span>{yearFilter === 'All' ? 'Latest assessments' : `Assessment year ${yearFilter}`}</span>
                </div>
            </section>

            <section className={`lod-filter-shell ${filtersOpen ? 'is-open' : 'is-collapsed'}`} aria-label="LOD dashboard filters">
                <button type="button" className="lod-filter-toggle" onClick={handleToggleFilters} aria-expanded={filtersOpen}>
                    <span>
                        <strong>Filters</strong>
                        <small>{activeFilterLabels.join(' / ')}</small>
                    </span>
                    <ChevronDown aria-hidden="true" />
                </button>
                {filtersOpen && (
                    <div className="lod-filter-panel">
                        <div className="dashboard-filter">
                            <label htmlFor="lod-year-filter">Year</label>
                            <select id="lod-year-filter" value={yearFilter} onChange={event => setYearFilter(event.target.value)}>
                                <option value="All">All / Latest</option>
                                {model.availableYears.map(year => (
                                    <option key={year} value={year}>{year}</option>
                                ))}
                            </select>
                        </div>
                        <div className="dashboard-filter">
                            <label htmlFor="lod-region-filter">Region</label>
                            <select id="lod-region-filter" value={regionFilter} onChange={event => setRegionFilter(event.target.value)}>
                                <option value="All">All Regions</option>
                                {regionOptions.map(region => (
                                    <option key={region} value={region}>{region}</option>
                                ))}
                            </select>
                        </div>
                        <div className="dashboard-filter">
                            <label htmlFor="lod-province-filter">Province</label>
                            <select id="lod-province-filter" value={provinceFilter} onChange={event => setProvinceFilter(event.target.value)}>
                                <option value="All">All Provinces</option>
                                {provinceOptions.map(province => (
                                    <option key={province} value={province}>{province}</option>
                                ))}
                            </select>
                        </div>
                        <div className="dashboard-filter">
                            <label htmlFor="lod-status-filter">Status</label>
                            <select id="lod-status-filter" value={statusFilter} onChange={event => setStatusFilter(event.target.value)}>
                                <option value="All">All Statuses</option>
                                {(['Improved', 'Maintained', 'Declined', 'New / No Baseline', 'Needs Assessment'] as ProgressionStatus[]).map(status => (
                                    <option key={status} value={status}>{status}</option>
                                ))}
                            </select>
                        </div>
                        <div className="dashboard-filter">
                            <label htmlFor="lod-level-filter">LOD Level</label>
                            <select id="lod-level-filter" value={levelFilter} onChange={event => setLevelFilter(event.target.value)}>
                                <option value="All">All Levels</option>
                                {[1, 2, 3, 4, 5].map(level => (
                                    <option key={level} value={level}>{LEVEL_LABELS[level]}</option>
                                ))}
                            </select>
                        </div>
                        <button type="button" className="btn btn-secondary lod-reset-button" onClick={handleResetFilters}>
                            <RefreshCw size={16} />
                            Reset
                        </button>
                    </div>
                )}
            </section>

            <section className="lod-kpi-grid" aria-label="Executive KPI cards">
                {renderMetricCard('Total IPOs Assessed', metrics.assessedTotal.toLocaleString(), `Out of ${filteredRows.length.toLocaleString()} IPOs`, <Users />, 'blue')}
                {renderMetricCard('Average LOD Score', formatScore(metrics.avgLevel), 'Primary score uses LOD level', <BarChart3 />, 'green')}
                {renderMetricCard('IPOs Improved', metrics.improved.toLocaleString(), `${percent(metrics.improved, metrics.assessedTotal)} of assessed`, <TrendingUp />, 'green')}
                {renderMetricCard('IPOs Declined', metrics.declined.toLocaleString(), `${percent(metrics.declined, metrics.assessedTotal)} of assessed`, <TrendingDown />, 'red')}
                {renderMetricCard('IPOs Maintained', metrics.maintained.toLocaleString(), `${percent(metrics.maintained, metrics.assessedTotal)} of assessed`, <Minus />, 'blue')}
                {renderMetricCard('High-Performing IPOs', metrics.highPerforming.toLocaleString(), 'At Level 4 or 5', <Award />, 'purple')}
                {renderMetricCard('At-Risk IPOs', metrics.atRisk.toLocaleString(), 'Level 1 or declining', <AlertTriangle />, 'orange')}
                {renderMetricCard('Top Province', metrics.topProvince?.province || 'No Data', metrics.topProvince ? `Avg LOD ${formatScore(metrics.topProvince.average)}` : 'No assessed IPOs', <MapPin />, 'gray')}
            </section>

            <section className="lod-dashboard-grid lod-dashboard-grid--three">
                <article className="dashboard-panel lod-chart-card">
                    <div className="dashboard-panel__header">
                        <h4 className="dashboard-panel__title">LOD Level Distribution</h4>
                    </div>
                    {filteredRows.length > 0 ? (
                        <div className="lod-donut-layout">
                            <div className="lod-donut-chart-shell">
                                <ResponsiveContainer width="100%" height={240}>
                                    <PieChart>
                                    <Pie data={levelDistribution.filter(item => item.count > 0)} dataKey="count" nameKey="name" innerRadius={62} outerRadius={94} paddingAngle={2}>
                                        {levelDistribution.filter(item => item.count > 0).map(item => (
                                            <Cell key={item.key} fill={item.color} />
                                        ))}
                                    </Pie>
                                    <Tooltip formatter={(value: number, name: string) => [`${value} IPOs`, name]} />
                                    </PieChart>
                                </ResponsiveContainer>
                                <div className="lod-donut-center">
                                    <strong>{filteredRows.length.toLocaleString()}</strong>
                                    <span>Total IPOs</span>
                                </div>
                            </div>
                            <div className="lod-chart-legend">
                                {levelDistribution.map(item => (
                                    <div key={item.key} className="lod-legend-row">
                                        <span style={{ background: item.color }}></span>
                                        <p>{item.name}</p>
                                        <strong>{item.count} ({item.percent.toFixed(1)}%)</strong>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ) : (
                        <p className="dashboard-empty dashboard-empty--center">No Data</p>
                    )}
                </article>

                <article className="dashboard-panel lod-chart-card lod-chart-card--wide">
                    <div className="dashboard-panel__header">
                        <h4 className="dashboard-panel__title">LOD Progression Over Time</h4>
                    </div>
                    {progressionByYear.length > 0 ? (
                        <div className="lod-progression-stack">
                            <ResponsiveContainer width="100%" height={130}>
                                <LineChart data={progressionByYear} margin={{ top: 14, right: 18, bottom: 4, left: 4 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
                                    <XAxis dataKey="year" tick={{ fontSize: 11 }} />
                                    <YAxis domain={[1, 5]} tick={{ fontSize: 11 }} width={28} />
                                    <Tooltip formatter={(value: number) => [formatScore(value), 'Average LOD Score']} />
                                    <Line type="monotone" dataKey="average" name="Average LOD Score" stroke="#0f766e" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                                </LineChart>
                            </ResponsiveContainer>
                            <ResponsiveContainer width="100%" height={220}>
                                <BarChart data={progressionByYear} margin={{ top: 10, right: 18, bottom: 4, left: 4 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
                                    <XAxis dataKey="year" tick={{ fontSize: 11 }} />
                                    <YAxis allowDecimals={false} tick={{ fontSize: 11 }} width={32} />
                                    <Tooltip />
                                    <Bar stackId="levels" dataKey="forAssessment" name="For Assessment" fill={FOR_ASSESSMENT_COLOR} />
                                    {[1, 2, 3, 4, 5].map(level => (
                                        <Bar key={level} stackId="levels" dataKey={`level${level}`} name={LEVEL_LABELS[level]} fill={LEVEL_COLORS[level]} />
                                    ))}
                                </BarChart>
                            </ResponsiveContainer>
                            <div className="lod-chart-legend lod-chart-legend--inline">
                                {[...levelDistribution.filter(item => item.level !== 'for-assessment'), levelDistribution.find(item => item.level === 'for-assessment')!].map(item => (
                                    <div key={item.key} className="lod-legend-row">
                                        <span style={{ background: item.color }}></span>
                                        <p>{item.name}</p>
                                    </div>
                                ))}
                                <div className="lod-legend-row">
                                    <span className="lod-line-marker"></span>
                                    <p>Average LOD Score</p>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <p className="dashboard-empty dashboard-empty--center">No Data</p>
                    )}
                </article>

                <article className="dashboard-panel lod-chart-card">
                    <div className="dashboard-panel__header">
                        <h4 className="dashboard-panel__title">LOD Component Average Scores</h4>
                    </div>
                    {componentAverages.some(component => component.score !== null) ? (
                        <div className="lod-component-score-layout">
                            <div className="lod-radar-chart-shell">
                                <ResponsiveContainer width="100%" height={390}>
                                    <RadarChart
                                        data={componentAverages.map(component => ({
                                            component: component.component,
                                            fullName: component.component,
                                            score: Number((component.score || 0).toFixed(2)),
                                            label: formatComponentScore(component.score, component.weight),
                                        }))}
                                        margin={radarChartMargin}
                                        outerRadius={isCompactChartViewport ? '58%' : '64%'}
                                    >
                                        <PolarGrid />
                                        <PolarAngleAxis dataKey="component" tick={renderComponentRadarTick} />
                                        <PolarRadiusAxis angle={90} domain={[0, Math.max(1, ...componentAverages.map(component => component.weight || 0))]} tick={false} axisLine={false} />
                                        <Radar name="Weighted Score" dataKey="score" stroke="#2563eb" fill="#3b82f6" fillOpacity={0.22} />
                                        <Tooltip formatter={(_value: number, _name: string, props: any) => [props.payload.label, props.payload.fullName]} />
                                    </RadarChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                    ) : (
                        <p className="dashboard-empty dashboard-empty--center">No Data</p>
                    )}
                </article>
            </section>

            <section className="lod-dashboard-grid lod-dashboard-grid--three">
                <article className="dashboard-panel lod-chart-card">
                    <div className="dashboard-panel__header">
                        <h4 className="dashboard-panel__title">Top Provinces by Average LOD</h4>
                    </div>
                    {provinceAverages.length > 0 ? (
                        <div className="lod-rank-list">
                            {provinceAverages.map(item => (
                                <div key={item.province} className="lod-rank-row">
                                    <div>
                                        <strong>{item.province}</strong>
                                        <span>{item.count} assessed IPOs</span>
                                    </div>
                                    <div className="lod-rank-bar">
                                        <span style={{ width: `${Math.min(100, (item.score / 5) * 100)}%` }}></span>
                                    </div>
                                    <b>{formatScore(item.score)}</b>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <p className="dashboard-empty dashboard-empty--center">No Data</p>
                    )}
                </article>

                <article className="dashboard-panel lod-chart-card">
                    <div className="dashboard-panel__header">
                        <h4 className="dashboard-panel__title">LOD Component Gap Analysis</h4>
                    </div>
                    {detailedGapAnalysis.some(section => section.averageScore !== null) ? (
                        <div className="lod-gap-analysis">
                            {detailedGapAnalysis.map((section, index) => (
                                <button
                                    key={section.id}
                                    type="button"
                                    className="lod-gap-section"
                                    onClick={() => setSelectedGapSection(section)}
                                >
                                    <span className="lod-gap-section__summary">
                                        {renderSectionIcon(section.title, index)}
                                        <span className="lod-gap-section__name">
                                            <strong>{section.title}</strong>
                                        </span>
                                    </span>
                                    <span className="lod-gap-section__metrics">
                                        <span className="lod-gap-section__metric">
                                            <small>Average</small>
                                            <strong>{formatComponentScore(section.averageScore, section.weight)}</strong>
                                        </span>
                                        <span className="lod-gap-section__metric">
                                            <small>Gap</small>
                                            <strong>{formatPercentagePoints(section.gap)}</strong>
                                        </span>
                                    </span>
                                </button>
                            ))}
                        </div>
                    ) : (
                        <p className="dashboard-empty dashboard-empty--center">No answered LOD question data. Manual override assessments can still appear in the dashboard, but detailed component gaps need saved answers.</p>
                    )}
                </article>

                <article className="dashboard-panel lod-chart-card">
                    <div className="dashboard-panel__header">
                        <h4 className="dashboard-panel__title">Development Gap Analysis</h4>
                    </div>
                    <div className="lod-insight-list">
                        {insights.map((insight, index) => (
                            <div key={`${insight.text}-${index}`} className={getInsightToneClass(insight.tone)}>
                                <span></span>
                                <p>{insight.text}</p>
                            </div>
                        ))}
                    </div>
                </article>
            </section>

            <section className="lod-dashboard-grid lod-dashboard-grid--three">
                <article className="dashboard-panel lod-chart-card">
                    <div className="dashboard-panel__header">
                        <h4 className="dashboard-panel__title">LOD Average Score by Region</h4>
                    </div>
                    {regionalAverages.length > 0 ? (
                        <div className="lod-rank-list lod-rank-list--region">
                            <div className="lod-average-benchmark">Philippine Average: <strong>{formatScore(metrics.avgLevel)}</strong></div>
                            {regionalAverages.map(item => (
                                <div key={item.region} className="lod-rank-row">
                                    <div>
                                        <strong>{item.region}</strong>
                                        <span>{item.count} IPOs</span>
                                    </div>
                                    <div className="lod-rank-bar">
                                        <span style={{ width: `${Math.min(100, (item.score / 5) * 100)}%` }}></span>
                                    </div>
                                    <b>{formatScore(item.score)}</b>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <p className="dashboard-empty dashboard-empty--center">No Data</p>
                    )}
                </article>

                <article className="dashboard-panel lod-chart-card">
                    <div className="dashboard-panel__header">
                        <h4 className="dashboard-panel__title">IPOs by Progression Status</h4>
                    </div>
                    {filteredRows.length > 0 ? (
                        <div className="lod-donut-layout">
                            <ResponsiveContainer width="100%" height={250}>
                                <PieChart>
                                    <Pie data={statusDistribution.filter(item => item.count > 0)} dataKey="count" nameKey="status" innerRadius={64} outerRadius={96}>
                                        {statusDistribution.filter(item => item.count > 0).map(item => (
                                            <Cell key={item.status} fill={STATUS_COLORS[item.status]} />
                                        ))}
                                    </Pie>
                                    <Tooltip formatter={(value: number, name: string) => [`${value} IPOs`, name]} />
                                </PieChart>
                            </ResponsiveContainer>
                            <div className="lod-chart-legend">
                                {statusDistribution.map(item => (
                                    <div key={item.status} className="lod-legend-row">
                                        <span style={{ background: STATUS_COLORS[item.status] }}></span>
                                        <p>{item.status}</p>
                                        <strong>{item.count}</strong>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ) : (
                        <p className="dashboard-empty dashboard-empty--center">No Data</p>
                    )}
                </article>

                <article className="dashboard-panel lod-scale-card">
                    <div className="dashboard-panel__header">
                        <h4 className="dashboard-panel__title">IPOs Ready for Scale-Up</h4>
                    </div>
                    <div className="lod-scale-gauge" style={{ '--ready-pct': `${Math.min(100, metrics.assessedTotal > 0 ? (metrics.readyForScaleUp / metrics.assessedTotal) * 100 : 0)}%` } as React.CSSProperties}>
                        <div>
                            <Gauge />
                            <strong>{metrics.readyForScaleUp.toLocaleString()}</strong>
                            <span>{percent(metrics.readyForScaleUp, metrics.assessedTotal)} of assessed IPOs</span>
                        </div>
                    </div>
                    <p className="lod-scale-note">Current LOD level must be at least 3, not declining, and every weighted section with questions must have answered data scoring at least 60% of its section weight.</p>
                </article>
            </section>

            <section className="data-table-card lod-monitoring-card" aria-labelledby="lod-monitoring-table-title">
                <div className="data-table-toolbar">
                    <div className="data-toolbar-row">
                        <div className="data-toolbar-group">
                            <h4 id="lod-monitoring-table-title" className="dashboard-panel__title">IPO Level of Development Monitoring Table</h4>
                        </div>
                        <div className="data-toolbar-group data-toolbar-group--actions">
                            <div className="data-table-search-wrap">
                                <Search aria-hidden="true" />
                                <input
                                    type="search"
                                    className="data-table-search"
                                    placeholder="Search IPO..."
                                    value={searchTerm}
                                    onChange={event => setSearchTerm(event.target.value)}
                                />
                            </div>
                            <button type="button" className="btn btn-secondary" onClick={handleExport}>
                                <Download size={16} />
                                Export
                            </button>
                        </div>
                    </div>
                </div>

                <div className="data-table-scroll custom-scrollbar lod-monitoring-table-scroll">
                    <table className="data-table lod-monitoring-table">
                        <thead>
                            <tr>
                                <th>IPO Name</th>
                                <th>Region</th>
                                <th>Province</th>
                                <th className="data-table__numeric">Year</th>
                                <th className="data-table__numeric">Current LOD</th>
                                <th className="data-table__numeric">Previous LOD</th>
                                <th className="data-table__numeric">Change</th>
                                {data.sections.map(section => (
                                    <th key={section.id} className="data-table__numeric" title={section.title}>{section.title}</th>
                                ))}
                                <th>Status</th>
                                <th>Trend</th>
                            </tr>
                        </thead>
                        <tbody>
                            {paginatedRows.length > 0 ? paginatedRows.map(row => (
                                <tr key={row.ipo.id} className={onSelectLodIpo ? 'lod-monitoring-row--clickable' : undefined} onClick={() => handleOpenLodDetails(row)}>
                                    <td>
                                        {onSelectLodIpo ? (
                                            <button type="button" className="table-link lod-ipo-link" onClick={(event) => { event.stopPropagation(); handleOpenLodDetails(row); }}>
                                                {row.ipo.name}
                                            </button>
                                        ) : (
                                            <strong>{row.ipo.name}</strong>
                                        )}
                                    </td>
                                    <td>{row.region}</td>
                                    <td>{row.province}</td>
                                    <td className="data-table__numeric">{row.currentAssessment?.year || 'No Data'}</td>
                                    <td className="data-table__numeric">{formatScore(row.currentLevel)}</td>
                                    <td className="data-table__numeric">{formatScore(row.previousLevel)}</td>
                                    <td className={`data-table__numeric ${row.change !== null && row.change < 0 ? 'lod-negative' : row.change !== null && row.change > 0 ? 'lod-positive' : ''}`}>
                                        {row.change === null ? 'No Data' : `${row.change > 0 ? '+' : ''}${formatScore(row.change)}`}
                                    </td>
                                    {data.sections.map(section => (
                                        <td key={section.id} className="data-table__numeric">{formatComponentScore(row.componentScores[section.id]?.weighted, row.componentScores[section.id]?.weight)}</td>
                                    ))}
                                    <td>
                                        <span className={`lod-status-text ${STATUS_TEXT_CLASS[row.status]}`}>{row.status}</span>
                                    </td>
                                    <td>
                                        {row.history.length > 0 ? (
                                            <svg className="lod-sparkline" viewBox="0 0 70 28" role="img" aria-label={`${row.ipo.name} LOD trend`}>
                                                <polyline points={buildSparklinePoints(row.history)} fill="none" stroke={row.status === 'Declined' ? '#dc2626' : '#16a34a'} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                                            </svg>
                                        ) : (
                                            <span className="detail-empty">No Data</span>
                                        )}
                                    </td>
                                </tr>
                            )) : (
                                <tr>
                                    <td colSpan={10 + data.sections.length}>
                                        <p className="dashboard-empty dashboard-empty--center">No Data</p>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>

                <div className="data-table-pagination">
                    <div className="data-table-pagination__page-size">
                        <span className="data-table-pagination__entries-label">Show</span>
                        <select value={itemsPerPage} onChange={event => setItemsPerPage(Number(event.target.value))}>
                            {[10, 25, 50].map(size => <option key={size} value={size}>{size}</option>)}
                        </select>
                        <span className="data-table-pagination__entries-label">per page</span>
                    </div>
                    <div className="data-table-pagination__status">
                        <span className="data-table-pagination__range">
                            Showing {searchedRows.length === 0 ? 0 : ((currentPage - 1) * itemsPerPage) + 1} to {Math.min(currentPage * itemsPerPage, searchedRows.length)} of {searchedRows.length} IPOs
                        </span>
                        <span className="data-table-pagination__compact-range">
                            {searchedRows.length === 0 ? '0 IPOs' : `${((currentPage - 1) * itemsPerPage) + 1}-${Math.min(currentPage * itemsPerPage, searchedRows.length)} of ${searchedRows.length}`}
                        </span>
                    </div>
                    <div className="data-table-pagination__controls">
                        <button type="button" disabled={currentPage <= 1} onClick={() => setCurrentPage(page => Math.max(1, page - 1))}>Previous</button>
                        <span>{currentPage} / {pageCount}</span>
                        <button type="button" disabled={currentPage >= pageCount} onClick={() => setCurrentPage(page => Math.min(pageCount, page + 1))}>Next</button>
                    </div>
                </div>
            </section>

            {selectedGapSection && (
                <div className="dashboard-modal-backdrop" onClick={() => setSelectedGapSection(null)} role="presentation">
                    <div
                        className="dashboard-modal dashboard-modal--wide lod-gap-modal"
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="lod-gap-modal-title"
                        onClick={event => event.stopPropagation()}
                    >
                        <div className="dashboard-modal__header">
                            <div>
                                <h3 id="lod-gap-modal-title">{selectedGapSection.title}</h3>
                                <p className="dashboard-modal__metric-subtext">
                                    Average {formatComponentScore(selectedGapSection.averageScore, selectedGapSection.weight)} &middot; Gap {formatPercentagePoints(selectedGapSection.gap)}
                                </p>
                            </div>
                            <button type="button" className="dashboard-modal__close" onClick={() => setSelectedGapSection(null)} aria-label="Close LOD component questions">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>
                        <div className="dashboard-modal__body custom-scrollbar">
                            {selectedGapSection.questions.some(question => question.averageScore !== null) ? (
                                <div className="data-table-scroll custom-scrollbar">
                                    <table className="data-table lod-gap-question-table">
                                        <thead>
                                            <tr>
                                                <th>Question</th>
                                                <th className="data-table__numeric">Average</th>
                                                <th className="data-table__numeric">Weight</th>
                                                <th className="data-table__numeric">Gap</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {selectedGapSection.questions.map(question => (
                                                <tr key={question.id} className={question.isBelowHalfWeight ? 'lod-gap-question-row--warning' : undefined}>
                                                    <td>{question.question}</td>
                                                    <td className="data-table__numeric">{formatScore(question.averageScore)}</td>
                                                    <td className="data-table__numeric">{formatScore(question.maxScore)}</td>
                                                    <td className="data-table__numeric">{formatScore(question.gap)}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            ) : (
                                <p className="dashboard-empty dashboard-empty--center">No answered question records for this section. Manual override assessments are excluded from question-level averages.</p>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default IPOLevelDashboard;
