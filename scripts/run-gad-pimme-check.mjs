import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GAD_PIMME_CHECKLIST, GAD_PIMME_MAX_SCORE, GAD_PIMME_QUESTION_COUNT, GAD_PIMME_QUESTIONS } from '../lib/gadPimmeChecklist.ts';
import { buildGadPimmeDetailPath, getGadPimmeAccess, getVisibleGadPimmeOperatingUnits } from '../lib/gadPimmeAccess.ts';
import { calculateGadPimmeScore, getGadPimmeClassification, getGadPimmeListStatus } from '../lib/gadPimmeScoring.ts';

const require = createRequire(import.meta.url);

assert.equal(GAD_PIMME_QUESTION_COUNT, 22);
assert.equal(GAD_PIMME_MAX_SCORE, 20);
assert.equal(GAD_PIMME_CHECKLIST[0].maxScore, 8);
assert.equal(GAD_PIMME_CHECKLIST[1].maxScore, 12);
assert.equal(GAD_PIMME_QUESTIONS[0].text, 'Is the project leadership (project steering/advisory committee or management) supportive of GAD or gender equality goals? For instance, has it mobilized adequate resources to support strategies that address gender issues or constraints to women’s and men’s participation during project implementation? (possible scores: 0, 0.5, 1.0)');
assert.equal(GAD_PIMME_QUESTIONS.at(-1)?.text, 'Have women and men been involved in or consulted on the assessment of the gender impacts of the project? (possible scores: 0, 0.5, 1.0)');
assert.equal(new Set(GAD_PIMME_QUESTIONS.map(question => question.key)).size, 22);
assert.ok(GAD_PIMME_QUESTIONS.every(question => question.choices.map(choice => choice.response).join('|') === 'No|Partly Yes|Yes'));
const checklistHash = createHash('sha256').update(GAD_PIMME_QUESTIONS.map(question => `${question.key}|${question.text}|${question.choices.map(choice => `${choice.response}:${choice.points}`).join(',')}`).join('\n')).digest('hex');
assert.equal(checklistHash, '2480602eee86a56f2fc05e77624719cd88ae73960ffe2b115c2ea28292b47d98', 'The versioned workbook transcription changed.');

const workbookPath = resolve(dirname(fileURLToPath(import.meta.url)), '../../../Testing/Reference/WORKSHOP TEMPLATE - PIMME CHECKLIST.xlsx');
if (existsSync(workbookPath)) {
    const XLSX = require('xlsx');
    const workbook = XLSX.readFile(workbookPath, { cellDates: false });
    const sheet = workbook.Sheets['PIMME CHECKLIST'];
    assert.ok(sheet, 'The authoritative PIMME CHECKLIST worksheet must exist.');

    const questionRows = [6, 8, 11, 13, 15, 18, 20, 23, 25, 27, 29, 37, 39, 42, 44, 46, 48, 51, 53, 55, 58, 60];
    const workbookQuestions = questionRows.map(row => String(sheet[`B${row}`]?.v || '').replace(/^\d+\.\d+[\s\u00a0]+/, ''));
    assert.deepEqual(workbookQuestions, GAD_PIMME_QUESTIONS.map(question => question.text), 'Question wording must match the workbook exactly.');

    workbookQuestions.forEach((questionText, index) => {
        const possibleScores = questionText.match(/\(possible scores:\s*([^)]+)\)$/i)?.[1]
            .split(',').map(value => Number(value.trim()));
        assert.deepEqual(possibleScores, GAD_PIMME_QUESTIONS[index].choices.map(choice => choice.points), `${GAD_PIMME_QUESTIONS[index].key} score mapping must match the workbook.`);
    });

    const headingRows = [5, 10, 17, 22, 36, 41, 50, 57];
    const workbookHeadings = headingRows.map(row => String(sheet[`B${row}`]?.v || '').replace(/^\d+\.\d+[\s\u00a0]+/, ''));
    const applicationHeadings = GAD_PIMME_CHECKLIST.flatMap(box => box.elements)
        .filter(element => element.key !== 'box17-element-4')
        .map(element => element.title);
    assert.deepEqual(applicationHeadings, workbookHeadings, 'Element headings must match the workbook exactly.');
    assert.equal(GAD_PIMME_CHECKLIST[0].title, sheet.B2.v);
    assert.equal(GAD_PIMME_CHECKLIST[1].title, sheet.B33.v);
}

const allYes = GAD_PIMME_QUESTIONS.map(question => ({ questionKey: question.key, response: 'Yes' }));
const maximum = calculateGadPimmeScore(allYes);
assert.equal(maximum.box16Score, 8);
assert.equal(maximum.box17Score, 12);
assert.equal(maximum.totalScore, 20);
assert.equal(maximum.status, 'Completed');
assert.equal(maximum.elementScores['box16-element-2'], 2, '0.67 x 3 must be capped at the declared element maximum.');

const partial = calculateGadPimmeScore([{ questionKey: 'box16-1.1', response: 'Partly Yes' }]);
assert.equal(partial.totalScore, 0.5);
assert.equal(partial.answeredCount, 1);
assert.equal(partial.status, 'Incomplete');
assert.equal(getGadPimmeListStatus(null), 'For Assessment');
assert.equal(getGadPimmeListStatus({ status: 'Incomplete' }), 'Incomplete');
assert.equal(getGadPimmeListStatus({ status: 'Completed' }), 'Completed');
assert.equal(getGadPimmeClassification(0), 'GAD-Invisible');
assert.equal(getGadPimmeClassification(4), 'Promising GAD Prospects');
assert.equal(getGadPimmeClassification(8), 'Gender-Sensitive');
assert.equal(getGadPimmeClassification(15), 'Gender-Responsive');
assert.equal(getGadPimmeClassification(20), 'Gender-Responsive');

const testOus = ['NPMO', 'RPMO CAR', 'RPMO 1'];
assert.deepEqual(getVisibleGadPimmeOperatingUnits(testOus, 'All', 'RPMO 1'), testOus);
assert.deepEqual(getVisibleGadPimmeOperatingUnits(testOus, 'All OUs', 'RPMO 1'), testOus);
assert.deepEqual(getVisibleGadPimmeOperatingUnits(testOus, 'Own OU', 'RPMO 1'), ['RPMO 1']);
assert.deepEqual(getGadPimmeAccess({ canView: true, canEdit: false, visibilityScope: 'Own OU', userOperatingUnit: 'RPMO 1', targetOperatingUnit: 'RPMO 1' }), { canView: true, canEdit: false });
assert.deepEqual(getGadPimmeAccess({ canView: true, canEdit: true, visibilityScope: 'Own OU', userOperatingUnit: 'RPMO 1', targetOperatingUnit: 'RPMO CAR' }), { canView: false, canEdit: false });
assert.deepEqual(getGadPimmeAccess({ canView: true, canEdit: true, visibilityScope: 'All', userOperatingUnit: 'RPMO 1', targetOperatingUnit: 'RPMO CAR' }), { canView: true, canEdit: true });
assert.equal(buildGadPimmeDetailPath('RPMO CAR', 2026), '/gender-and-development/detail?ou=RPMO%20CAR&year=2026');

const migration = readFileSync(new URL('../supabase/migrations/202608050001_gad_pimme_assessments.sql', import.meta.url), 'utf8');
const driveSource = readFileSync(new URL('../supabase/functions/_shared/googleDrive.ts', import.meta.url), 'utf8');
const appSource = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
const accessSource = readFileSync(new URL('../lib/gadPimmeAccess.ts', import.meta.url), 'utf8');
const listSource = readFileSync(new URL('../components/GAD/GadPimmePage.tsx', import.meta.url), 'utf8');
const detailsSource = readFileSync(new URL('../components/GAD/GadPimmeDetails.tsx', import.meta.url), 'utf8');
assert.match(migration, /unique \(operating_unit, year\)/i, 'OU/year persistence must remain unique.');
assert.match(migration, /question_key text not null/i, 'Evidence and answers must use stable question keys.');
assert.match(migration, /source\.module = 'Level of Development'/, 'GAD permissions must be seeded from LOD permissions.');
assert.match(driveSource, /ensureFolder\(accessToken, GAD_PIMME_DRIVE_MODULE, connection\.root_folder_id\)[\s\S]*ensureFolder\(accessToken, String\(year\), moduleFolder\.id\)[\s\S]*ensureFolder\(accessToken, cleanDriveName\(operatingUnit, "Operating Unit"\), yearFolder\.id\)/, 'Drive hierarchy must remain Module / Year / OU.');
assert.match(driveSource, /withDriveFolderInitializationLock\([\s\S]*`gad-pimme:\$\{connection\.id\}:\$\{year\}:\$\{operatingUnit\}`/, 'GAD folder initialization must remain race-safe.');
assert.match(accessSource, /\/gender-and-development\/detail\?ou=/, 'Detail navigation must remain URL-addressable.');
assert.match(appSource, /requestAppNavigation\(currentPageRef\.current, nextPage\)/, 'Browser Back/Forward must honor unsaved-change navigation guards.');
assert.match(listSource, /onClick=\{event => event\.stopPropagation\(\)\}[\s\S]*onClick=\{\(\) => onSelectAssessment\(ou, year\)\}/, 'Year-cell navigation must not trigger current-year row navigation.');
assert.match(listSource, /onClick=\{\(\) => onSelectAssessment\(ou, currentYear\)\}/, 'OU row navigation must open the current year.');
assert.match(detailsSource, /disabled=\{!canEdit\}/, 'View-only users must not be able to change questionnaire controls.');
assert.match(detailsSource, /canEdit && <button[^>]+gad-pimme-evidence__upload/, 'Evidence uploads must be hidden from view-only users.');
assert.match(detailsSource, /Uploaded GAD PIMME Evidence[\s\S]*Deleted GAD PIMME Evidence/, 'Evidence changes must write audit entries.');

console.log('GAD PIMME checklist and scoring checks passed.');
