export interface LodSectionLike {
    id: number;
    weight?: number | string | null;
}

export interface LodQuestionLike {
    id: number;
    section_id: number;
}

export interface LodChoiceLike {
    id: number;
    question_id: number;
    points?: number | string | null;
}

export interface LodAnswerLike {
    question_id: number;
    choice_id?: number | null;
}

export interface LodLevelConfigLike {
    level: number;
    min_score: number | string;
    max_score: number | string;
}

export interface LodAssessmentLike {
    id?: number;
    manual_level?: number | null;
    computed_level?: number | null;
    is_complete?: boolean | null;
    is_dropped?: boolean | null;
    is_carried_over?: boolean | null;
    carried_over_level?: number | null;
    answered_question_count?: number | null;
}

export interface LodSectionScore {
    sectionId: number;
    earned: number;
    possible: number;
    weightedScore: number | null;
    sectionWeight: number;
    answeredQuestions: number;
    requiredQuestions: number;
}

export interface LodScoreResult {
    totalScore: number;
    maxPossibleScore: number;
    computedLevel: number | null;
    isComplete: boolean;
    answeredQuestionCount: number;
    requiredQuestionCount: number;
    coveragePercent: number;
    sectionScores: LodSectionScore[];
}

export type LodEffectiveStateKind = 'dropped' | 'manual' | 'computed' | 'carried-over' | 'incomplete' | 'for-assessment';

export interface LodEffectiveState {
    kind: LodEffectiveStateKind;
    label: string;
    level: number | null;
    source: 'dropped' | 'manual' | 'computed' | 'carried-over' | 'incomplete' | 'none';
}

export interface LodLevelValidationIssue {
    code: 'missing-level' | 'invalid-range' | 'nonascending-max' | 'gap' | 'overlap';
    level?: number;
    message: string;
}

const toFiniteNumber = (value: unknown, fallback = 0) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
};

const isPublishedLevel = (value: unknown): value is number => {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed >= 1 && parsed <= 5;
};

export const resolveLodLevel = (
    score: number,
    configs: LodLevelConfigLike[]
): number | null => {
    const sorted = configs
        .map(config => ({
            level: Number(config.level),
            min: toFiniteNumber(config.min_score),
            max: toFiniteNumber(config.max_score),
        }))
        .filter(config => isPublishedLevel(config.level) && config.max >= config.min)
        .sort((left, right) => left.max - right.max || left.level - right.level);

    if (sorted.length === 0 || !Number.isFinite(score)) return null;
    return (sorted.find(config => score <= config.max) || sorted[sorted.length - 1]).level;
};

export const validateLodLevelConfigs = (
    configs: LodLevelConfigLike[]
): LodLevelValidationIssue[] => {
    const issues: LodLevelValidationIssue[] = [];
    const byLevel = new Map(configs.map(config => [Number(config.level), config]));

    for (let level = 1; level <= 5; level += 1) {
        if (!byLevel.has(level)) {
            issues.push({
                code: 'missing-level',
                level,
                message: `Level ${level} is missing.`,
            });
        }
    }

    const sorted = configs
        .map(config => ({
            level: Number(config.level),
            min: toFiniteNumber(config.min_score),
            max: toFiniteNumber(config.max_score),
        }))
        .filter(config => isPublishedLevel(config.level))
        .sort((left, right) => left.level - right.level);

    sorted.forEach((config, index) => {
        if (config.min > config.max) {
            issues.push({
                code: 'invalid-range',
                level: config.level,
                message: `Level ${config.level} minimum cannot exceed its maximum.`,
            });
        }
        if (index === 0) return;

        const previous = sorted[index - 1];
        if (config.max <= previous.max) {
            issues.push({
                code: 'nonascending-max',
                level: config.level,
                message: `Level ${config.level} maximum must be greater than Level ${previous.level}.`,
            });
        }
        if (config.min > previous.max) {
            issues.push({
                code: 'gap',
                level: config.level,
                message: `Level ${previous.level} and Level ${config.level} leave a decimal-score gap. Set Level ${config.level} minimum to ${previous.max}.`,
            });
        } else if (config.min < previous.max) {
            issues.push({
                code: 'overlap',
                level: config.level,
                message: `Level ${previous.level} and Level ${config.level} overlap. Set Level ${config.level} minimum to ${previous.max}.`,
            });
        }
    });

    return issues;
};

export const calculateLodScore = ({
    sections,
    questions,
    choices,
    answers,
    levelConfigs,
}: {
    sections: LodSectionLike[];
    questions: LodQuestionLike[];
    choices: LodChoiceLike[];
    answers: LodAnswerLike[];
    levelConfigs: LodLevelConfigLike[];
}): LodScoreResult => {
    const choicesByQuestion = new Map<number, LodChoiceLike[]>();
    choices.forEach(choice => {
        const list = choicesByQuestion.get(Number(choice.question_id)) || [];
        list.push(choice);
        choicesByQuestion.set(Number(choice.question_id), list);
    });

    const answersByQuestion = new Map<number, LodAnswerLike>();
    answers.forEach(answer => {
        answersByQuestion.set(Number(answer.question_id), answer);
    });

    const sectionScores: LodSectionScore[] = [];
    let configuredSectionWeight = 0;
    let answeredSectionWeight = 0;
    let earnedWeightedScore = 0;
    let answeredQuestionCount = 0;
    let requiredQuestionCount = 0;

    sections.forEach(section => {
        const sectionWeight = Math.max(0, toFiniteNumber(section.weight));
        const sectionQuestions = questions.filter(question => Number(question.section_id) === Number(section.id));
        let earned = 0;
        let possible = 0;
        let answeredQuestions = 0;
        let requiredQuestions = 0;

        sectionQuestions.forEach(question => {
            const questionChoices = choicesByQuestion.get(Number(question.id)) || [];
            const maxChoicePoints = questionChoices.reduce(
                (maximum, choice) => Math.max(maximum, toFiniteNumber(choice.points)),
                0
            );
            if (maxChoicePoints <= 0 || sectionWeight <= 0) return;

            requiredQuestions += 1;
            const answer = answersByQuestion.get(Number(question.id));
            const selectedChoice = answer
                ? questionChoices.find(choice => Number(choice.id) === Number(answer.choice_id))
                : undefined;
            if (!selectedChoice) return;

            answeredQuestions += 1;
            possible += maxChoicePoints;
            earned += Math.max(0, toFiniteNumber(selectedChoice.points));
        });

        if (requiredQuestions > 0) {
            configuredSectionWeight += sectionWeight;
            requiredQuestionCount += requiredQuestions;
        }

        let weightedScore: number | null = null;
        if (answeredQuestions > 0 && possible > 0) {
            weightedScore = Math.max(0, Math.min(1, earned / possible)) * sectionWeight;
            answeredSectionWeight += sectionWeight;
            earnedWeightedScore += weightedScore;
            answeredQuestionCount += answeredQuestions;
        }

        sectionScores.push({
            sectionId: Number(section.id),
            earned,
            possible,
            weightedScore,
            sectionWeight,
            answeredQuestions,
            requiredQuestions,
        });
    });

    const totalScore = answeredSectionWeight > 0 && configuredSectionWeight > 0
        ? (earnedWeightedScore / answeredSectionWeight) * configuredSectionWeight
        : 0;
    const isComplete = requiredQuestionCount > 0 && answeredQuestionCount === requiredQuestionCount;
    const coveragePercent = requiredQuestionCount > 0
        ? (answeredQuestionCount / requiredQuestionCount) * 100
        : 0;

    return {
        totalScore,
        maxPossibleScore: configuredSectionWeight,
        computedLevel: isComplete ? resolveLodLevel(totalScore, levelConfigs) : null,
        isComplete,
        answeredQuestionCount,
        requiredQuestionCount,
        coveragePercent,
        sectionScores,
    };
};

export const getLodEffectiveState = (
    assessment: LodAssessmentLike | null | undefined
): LodEffectiveState => {
    if (!assessment) {
        return { kind: 'for-assessment', label: 'For Assessment', level: null, source: 'none' };
    }
    if (assessment.is_dropped) {
        return { kind: 'dropped', label: 'Dropped', level: null, source: 'dropped' };
    }
    const isLegacyAssessment = assessment.is_complete === undefined || assessment.is_complete === null;
    if ((assessment.is_complete || isLegacyAssessment) && isPublishedLevel(assessment.computed_level)) {
        const level = Number(assessment.computed_level);
        return { kind: 'computed', label: `Level ${level}`, level, source: 'computed' };
    }
    if (isPublishedLevel(assessment.manual_level)) {
        const level = Number(assessment.manual_level);
        return { kind: 'manual', label: `Level ${level}`, level, source: 'manual' };
    }
    if (assessment.is_carried_over && isPublishedLevel(assessment.carried_over_level)) {
        const level = Number(assessment.carried_over_level);
        return { kind: 'carried-over', label: `Level ${level}`, level, source: 'carried-over' };
    }
    if (assessment.answered_question_count !== undefined
        && assessment.answered_question_count !== null
        && Number(assessment.answered_question_count) === 0) {
        return { kind: 'for-assessment', label: 'For Assessment', level: null, source: 'none' };
    }
    return { kind: 'incomplete', label: 'Incomplete', level: null, source: 'incomplete' };
};

export const isLodPublishedState = (state: LodEffectiveState) =>
    state.kind === 'manual' || state.kind === 'computed' || state.kind === 'carried-over';

export const resolveManualLevelForSave = ({
    canManageOverride,
    retainManualOverride,
    enteredManualLevel,
    existingManualLevel,
    existingAssessmentComplete,
    nextAssessmentComplete,
}: {
    canManageOverride: boolean;
    retainManualOverride: boolean;
    enteredManualLevel: number | null;
    existingManualLevel: number | null;
    existingAssessmentComplete: boolean;
    nextAssessmentComplete: boolean;
}): number | null => {
    const entered = isPublishedLevel(enteredManualLevel) ? Number(enteredManualLevel) : null;
    const existing = isPublishedLevel(existingManualLevel) ? Number(existingManualLevel) : null;

    if (canManageOverride) {
        if (nextAssessmentComplete) return null;
        if (retainManualOverride && entered !== null) return entered;
        return existing;
    }

    if (existing === null) return null;
    return nextAssessmentComplete ? null : existing;
};
