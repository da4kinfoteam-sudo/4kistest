import assert from 'node:assert/strict';
import {
    calculateLodScore,
    getLodEffectiveState,
    resolveLodLevel,
    resolveManualLevelForSave,
    validateLodLevelConfigs,
} from '../lib/lodScoring.ts';

const levelConfigs = [
    { level: 1, min_score: 0, max_score: 20 },
    { level: 2, min_score: 20, max_score: 40 },
    { level: 3, min_score: 40, max_score: 60 },
    { level: 4, min_score: 60, max_score: 80 },
    { level: 5, min_score: 80, max_score: 100 },
];

assert.equal(resolveLodLevel(20.5, levelConfigs), 2);
assert.equal(resolveLodLevel(40.5, levelConfigs), 3);
assert.equal(resolveLodLevel(60.5, levelConfigs), 4);
assert.equal(resolveLodLevel(80.5, levelConfigs), 5);
assert.deepEqual(validateLodLevelConfigs(levelConfigs), []);
assert.ok(validateLodLevelConfigs(levelConfigs.map(config => (
    config.level === 2 ? { ...config, min_score: 21 } : config
))).some(issue => issue.code === 'gap'));
assert.ok(validateLodLevelConfigs(levelConfigs.map(config => (
    config.level === 2 ? { ...config, min_score: 19 } : config
))).some(issue => issue.code === 'overlap'));
assert.ok(validateLodLevelConfigs(levelConfigs.filter(config => config.level !== 4))
    .some(issue => issue.code === 'missing-level' && issue.level === 4));

const score = calculateLodScore({
    sections: [{ id: 1, weight: 100 }],
    questions: [
        { id: 1, section_id: 1 },
        { id: 2, section_id: 1 },
    ],
    choices: [
        { id: 11, question_id: 1, points: 0 },
        { id: 12, question_id: 1, points: 90 },
        { id: 21, question_id: 2, points: 0 },
        { id: 22, question_id: 2, points: 10 },
    ],
    answers: [
        { question_id: 1, choice_id: 11 },
        { question_id: 2, choice_id: 22 },
    ],
    levelConfigs,
});

assert.equal(score.totalScore, 10);
assert.equal(score.isComplete, true);
assert.equal(score.answeredQuestionCount, 2);
assert.equal(score.requiredQuestionCount, 2);
assert.equal(score.computedLevel, 1);

const partial = calculateLodScore({
    sections: [{ id: 1, weight: 100 }],
    questions: [
        { id: 1, section_id: 1 },
        { id: 2, section_id: 1 },
    ],
    choices: [
        { id: 11, question_id: 1, points: 0 },
        { id: 12, question_id: 1, points: 90 },
        { id: 21, question_id: 2, points: 0 },
        { id: 22, question_id: 2, points: 10 },
    ],
    answers: [{ question_id: 1, choice_id: 12 }],
    levelConfigs,
});

assert.equal(partial.totalScore, 100);
assert.equal(partial.isComplete, false);
assert.equal(partial.computedLevel, null);
assert.equal(getLodEffectiveState({ computed_level: 5, is_complete: false }).label, 'Incomplete');
assert.equal(getLodEffectiveState({ computed_level: 5 }).label, 'Level 5');
assert.equal(getLodEffectiveState({ manual_level: 3, computed_level: 5, is_complete: false }).label, 'Level 3');
assert.equal(getLodEffectiveState({ manual_level: 3, computed_level: 5, is_complete: true }).label, 'Level 5');
assert.deepEqual(
    getLodEffectiveState({ is_carried_over: true, carried_over_level: 4, is_complete: false }),
    { kind: 'carried-over', label: 'Level 4', level: 4, source: 'carried-over' }
);
assert.equal(getLodEffectiveState({ is_carried_over: true, carried_over_level: 4, computed_level: 2, is_complete: true }).source, 'computed');
assert.equal(getLodEffectiveState({ is_carried_over: true, carried_over_level: 4, manual_level: 5, is_complete: false }).source, 'manual');
assert.equal(getLodEffectiveState({ is_carried_over: true, carried_over_level: null, is_complete: false }).label, 'Incomplete');
assert.equal(getLodEffectiveState({ answered_question_count: 0, is_complete: false }).label, 'For Assessment');
assert.equal(getLodEffectiveState({ answered_question_count: 0, computed_level: 4, is_complete: false }).label, 'For Assessment');
assert.equal(getLodEffectiveState({ answered_question_count: 0, manual_level: 3, is_complete: false }).label, 'Level 3');
assert.equal(getLodEffectiveState({ is_dropped: true, manual_level: 3, is_complete: true }).label, 'Dropped');
assert.equal(getLodEffectiveState(null).label, 'For Assessment');
assert.equal(resolveManualLevelForSave({
    canManageOverride: false,
    retainManualOverride: false,
    enteredManualLevel: 2,
    existingManualLevel: 2,
    existingAssessmentComplete: false,
    nextAssessmentComplete: true,
}), null);
assert.equal(resolveManualLevelForSave({
    canManageOverride: false,
    retainManualOverride: false,
    enteredManualLevel: 4,
    existingManualLevel: 4,
    existingAssessmentComplete: true,
    nextAssessmentComplete: true,
}), null);
assert.equal(resolveManualLevelForSave({
    canManageOverride: true,
    retainManualOverride: true,
    enteredManualLevel: 5,
    existingManualLevel: 2,
    existingAssessmentComplete: false,
    nextAssessmentComplete: true,
}), null);

console.log('LOD scoring checks passed.');
