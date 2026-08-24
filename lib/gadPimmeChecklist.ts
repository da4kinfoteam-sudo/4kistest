export type GadPimmeResponse = 'No' | 'Partly Yes' | 'Yes';

export interface GadPimmeChoice {
    response: GadPimmeResponse;
    points: number;
}

export interface GadPimmeQuestionDefinition {
    key: string;
    label: string;
    text: string;
    choices: readonly GadPimmeChoice[];
}

export interface GadPimmeElementDefinition {
    key: string;
    label: string;
    title: string;
    maxScore: number;
    questions: readonly GadPimmeQuestionDefinition[];
}

export interface GadPimmeBoxDefinition {
    key: 'box16' | 'box17';
    title: string;
    maxScore: number;
    elements: readonly GadPimmeElementDefinition[];
}

const choices = (partlyYes: number, yes: number): readonly GadPimmeChoice[] => [
    { response: 'No', points: 0 },
    { response: 'Partly Yes', points: partlyYes },
    { response: 'Yes', points: yes },
];

export const GAD_PIMME_CHECKLIST_VERSION = 'PIMME-2026-v1';

export const GAD_PIMME_CHECKLIST: readonly GadPimmeBoxDefinition[] = [
    {
        key: 'box16',
        title: 'Box 16. GAD checklist for project management and implementation',
        maxScore: 8,
        elements: [
            {
                key: 'box16-element-1', label: '1.0', title: 'Supportive project management (max score: 2; for each item, 1.0)', maxScore: 2,
                questions: [
                    { key: 'box16-1.1', label: '1.1', text: 'Is the project leadership (project steering/advisory committee or management) supportive of GAD or gender equality goals? For instance, has it mobilized adequate resources to support strategies that address gender issues or constraints to women’s and men’s participation during project implementation? (possible scores: 0, 0.5, 1.0)', choices: choices(0.5, 1) },
                    { key: 'box16-1.2', label: '1.2', text: 'Has adequate gender expertise been made available throughout the project? For example, are gender issues adequately addressed in the project management contract and scope of services? (possible scores: 0, 0.5, 1.0)', choices: choices(0.5, 1) },
                ],
            },
            {
                key: 'box16-element-2', label: '2.0', title: 'Technically competent staff or consultants (max score: 2; for each item, 0.67)', maxScore: 2,
                questions: [
                    { key: 'box16-2.1', label: '2.1', text: 'Are the project staff members technically prepared to promote gender equality or integrate GAD in their respective positions/locations? OR, is there an individual or group responsible for promoting gender equality in the project? OR, has the project tapped local gender experts to assist its staff/partners in integrating gender equality in their activities or in project operations? (possible scores: 0, 0.33, 0.67)', choices: choices(0.33, 0.67) },
                    { key: 'box16-2.2', label: '2.2', text: 'Does the project require the presence of women and men in the project implementation team? (possible scores: 0, 0.33, 0.67)', choices: choices(0.33, 0.67) },
                    { key: 'box16-2.3', label: '2.3', text: 'Does project require its monitoring and evaluation team (personnel or consultants) to have technical competence for GAD evaluation? (possible scores: 0, 0.33, 0.67)', choices: choices(0.33, 0.67) },
                ],
            },
            {
                key: 'box16-element-3', label: '3.0', title: 'Committed Philippine government agency (max score: 2; for each item, 1)', maxScore: 2,
                questions: [
                    { key: 'box16-3.1', label: '3.1', text: 'Are regular agency personnel involved in implementing project GAD initiatives? OR, are agency officials or personnel participating in GAD training sponsored by the project? (possible scores: 0, 0.5, 1.0)', choices: choices(0.5, 1) },
                    { key: 'box16-3.2', label: '3.2', text: 'Has the agency included the project’s GAD efforts in its GAD plans? (possible scores: 0, 0.5, 1.0)', choices: choices(0.5, 1) },
                ],
            },
            {
                key: 'box16-element-4', label: '4.0', title: 'GAD implementation processes and procedures (max score: 2; for each item, 0.5)', maxScore: 2,
                questions: [
                    { key: 'box16-4.1', label: '4.1', text: 'Do project implementation documents incorporate a discussion of GAD concerns? IF APPLICABLE: Are subproject proposals required to have explicit GAD objectives and to have been supported by gender analysis? (possible scores: 0, 0.25, 0.50)', choices: choices(0.25, 0.5) },
                    { key: 'box16-4.2', label: '4.2', text: 'Does the project have an operational GAD strategy? Alternately, has the project been effective in integrating GAD into the development activity? (possible scores: 0, 0.25, 0.50)', choices: choices(0.25, 0.5) },
                    { key: 'box16-4.3', label: '4.3', text: 'Does the project have a budget for activities that will build capacities for doing GAD tasks (gender analysis, monitoring, etc.)  (possible scores: 0, 0.25, 0.50)', choices: choices(0.25, 0.5) },
                    { key: 'box16-4.4', label: '4.4', text: 'Does the project involve women and men in various phases of subprojects?   (possible scores: 0, 0.25, 0.50)', choices: choices(0.25, 0.5) },
                ],
            },
        ],
    },
    {
        key: 'box17',
        title: 'Box 17. GAD checklist for project monitoring and evaluation',
        maxScore: 12,
        elements: [
            {
                key: 'box17-element-1', label: '1.0', title: 'Project monitoring system being used by the project includes indicators that measure gender differences in outputs, results, and outcomes. (max score: 2; for each item, 1)', maxScore: 2,
                questions: [
                    { key: 'box17-1.1', label: '1.1', text: 'Does the project require gender-sensitive outputs and outcomes? (possible scores: 0, 0.5, 1.0)', choices: choices(0.5, 1) },
                    { key: 'box17-1.2', label: '1.2', text: 'Does the project monitor its activities, inputs, outputs, and results using GAD or gender equality indicators? (possible scores: 0, 0.5, 1.0)', choices: choices(0.5, 1) },
                ],
            },
            {
                key: 'box17-element-2', label: '2.0', title: 'Project database includes sex-disaggregated and gender-related information. (max score: 2; for each item, 0.5)', maxScore: 2,
                questions: [
                    { key: 'box17-2.1', label: '2.1', text: 'Does the project support studies to assess gender issues and impacts? OR, have sex-disaggregated data been collected on the project’s impact on women and men in connection with welfare, access to resources and benefits, awareness or consciousness raising, participation, and control? (possible scores: 0, 0.25, 0.50)', choices: choices(0.25, 0.5) },
                    { key: 'box17-2.2', label: '2.2', text: 'Have sex-disaggregated data been collected on the distribution of project resources to women and men, and on the participation of women and men in project activities and in decision making? IF APPLICABLE: Does the project require its subprojects to include sex-disaggregated data in their reports? (possible scores: 0, 0.25, 0.50)', choices: choices(0.25, 0.5) },
                    { key: 'box17-2.3', label: '2.3', text: 'Do project and subproject reports include sex-disaggregated data or cover gender equality or GAD concerns, initiatives, and results (that is, information on gender issues and how these are addressed)? (possible scores: 0, 0.25, 0.50)', choices: choices(0.25, 0.5) },
                    { key: 'box17-2.4', label: '2.4', text: 'Are sex-disaggregated data being “rolled up” from the field to the national level? (possible scores: 0, 0.25, 0.50)', choices: choices(0.25, 0.5) },
                ],
            },
            {
                key: 'box17-element-3', label: '3.0', title: 'Gender equality and women’s empowerment targets are being met. (max score: 4)', maxScore: 4,
                questions: [
                    { key: 'box17-3.1', label: '3.1', text: 'Has women’s welfare and status been improved as a result of the project? (possible scores: 0, 1.0, 2.0)', choices: choices(1, 2) },
                    { key: 'box17-3.2', label: '3.2', text: 'Has the project helped in developing the capacity of the implementing agency for implementing gender-sensitive projects? (possible scores: 0, 1.0, 2.0)', choices: choices(1, 2) },
                ],
            },
            {
                key: 'box17-element-4', label: '4.0', title: 'Project addresses gender issues arising from or during its implementation.', maxScore: 2,
                questions: [
                    { key: 'box17-4.0', label: '4.0', text: 'Project addresses gender issues arising from or during its implementation. (possible scores: 0, 1.0, 2.0)', choices: choices(1, 2) },
                ],
            },
            {
                key: 'box17-element-5', label: '5.0', title: 'Participatory monitoring and evaluation processes (max score: 2; for each item, 1)', maxScore: 2,
                questions: [
                    { key: 'box17-5.1', label: '5.1', text: 'Does the project involve or consult woman and man implementors during project monitoring and evaluation? Does it involve woman and man beneficiaries? (possible scores: 0, 0.5, 1.0)', choices: choices(0.5, 1) },
                    { key: 'box17-5.2', label: '5.2', text: 'Have women and men been involved in or consulted on the assessment of the gender impacts of the project? (possible scores: 0, 0.5, 1.0)', choices: choices(0.5, 1) },
                ],
            },
        ],
    },
] as const;

export const GAD_PIMME_QUESTIONS = GAD_PIMME_CHECKLIST.flatMap(box =>
    box.elements.flatMap(element => element.questions.map(question => ({ ...question, boxKey: box.key, elementKey: element.key })))
);

export const GAD_PIMME_QUESTION_COUNT = GAD_PIMME_QUESTIONS.length;
export const GAD_PIMME_MAX_SCORE = 20;
