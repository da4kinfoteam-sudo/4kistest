import {
    GAD_PIMME_CHECKLIST,
    GAD_PIMME_MAX_SCORE,
    GAD_PIMME_QUESTION_COUNT,
} from './gadPimmeChecklist.ts';
import type { GadPimmeResponse } from './gadPimmeChecklist.ts';

export interface GadPimmeAnswerInput {
    questionKey: string;
    response?: GadPimmeResponse | null;
    remarks?: string;
}

export interface GadPimmeScoreResult {
    box16Score: number;
    box17Score: number;
    totalScore: number;
    answeredCount: number;
    status: 'Incomplete' | 'Completed';
    pointsByQuestion: Record<string, number>;
    elementScores: Record<string, number>;
}

export const GAD_PIMME_CLASSIFICATIONS = [
    'Gender-Responsive',
    'Gender-Sensitive',
    'Promising GAD Prospects',
    'GAD-Invisible',
] as const;

export type GadPimmeClassification = typeof GAD_PIMME_CLASSIFICATIONS[number];

export const getGadPimmeClassification = (score: number): GadPimmeClassification => {
    const normalizedScore = Number.isFinite(Number(score))
        ? Math.max(0, Math.min(GAD_PIMME_MAX_SCORE, Number(score)))
        : 0;
    if (normalizedScore >= 15) return 'Gender-Responsive';
    if (normalizedScore >= 8) return 'Gender-Sensitive';
    if (normalizedScore >= 4) return 'Promising GAD Prospects';
    return 'GAD-Invisible';
};

export const getGadPimmeListStatus = (assessment: { status?: string | null } | null | undefined) => {
    if (!assessment) return 'For Assessment' as const;
    return assessment.status === 'Completed' ? 'Completed' as const : 'Incomplete' as const;
};

const rounded = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

export const calculateGadPimmeScore = (answers: readonly GadPimmeAnswerInput[]): GadPimmeScoreResult => {
    const byQuestion = new Map(answers.map(answer => [answer.questionKey, answer]));
    const pointsByQuestion: Record<string, number> = {};
    const elementScores: Record<string, number> = {};
    const boxScores: Record<'box16' | 'box17', number> = { box16: 0, box17: 0 };
    let answeredCount = 0;

    GAD_PIMME_CHECKLIST.forEach(box => {
        box.elements.forEach(element => {
            let rawElementScore = 0;
            element.questions.forEach(question => {
                const response = byQuestion.get(question.key)?.response;
                if (!response) {
                    pointsByQuestion[question.key] = 0;
                    return;
                }
                const choice = question.choices.find(option => option.response === response);
                if (!choice) throw new Error(`Invalid response for ${question.key}.`);
                answeredCount += 1;
                pointsByQuestion[question.key] = choice.points;
                rawElementScore += choice.points;
            });
            const elementScore = rounded(Math.min(element.maxScore, rawElementScore));
            elementScores[element.key] = elementScore;
            boxScores[box.key] += elementScore;
        });
        boxScores[box.key] = rounded(Math.min(box.maxScore, boxScores[box.key]));
    });

    const totalScore = rounded(Math.min(GAD_PIMME_MAX_SCORE, boxScores.box16 + boxScores.box17));
    return {
        box16Score: boxScores.box16,
        box17Score: boxScores.box17,
        totalScore,
        answeredCount,
        status: answeredCount === GAD_PIMME_QUESTION_COUNT ? 'Completed' : 'Incomplete',
        pointsByQuestion,
        elementScores,
    };
};
