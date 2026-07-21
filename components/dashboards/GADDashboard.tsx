
// Author: 4K
import React, { useMemo } from 'react';
import { Training, OtherActivity, IPO, Subproject } from '../../constants';

interface GADDashboardProps {
    trainings: Training[];
    otherActivities: OtherActivity[];
    ipos: IPO[];
    subprojects: Subproject[];
}

const GADDashboard: React.FC<GADDashboardProps> = ({ trainings, ipos, subprojects }) => {

    const stats = useMemo(() => {
        let targetMale = 0;
        let targetFemale = 0;
        let actualMale = 0;
        let actualFemale = 0;

        (trainings || []).forEach(t => {
            targetMale += (t.participantsMale || 0);
            targetFemale += (t.participantsFemale || 0);
            actualMale += (t.actualParticipantsMale || 0);
            actualFemale += (t.actualParticipantsFemale || 0);
        });

        return {
            targetMale,
            targetFemale,
            actualMale,
            actualFemale,
            totalTarget: targetMale + targetFemale,
            totalActual: actualMale + actualFemale
        };
    }, [trainings]);

    const womenLedStats = useMemo(() => {
        // 1. Identify all Women-Led IPO names from the master list (ipos prop)
        // Note: The ipos prop passed here contains the registry needed for metadata lookup.
        const womenLedIpoNames = new Set((ipos || []).filter(ipo => ipo.isWomenLed).map(ipo => ipo.name));

        // 2. Identify Subprojects linked to WL IPOs
        // Note: 'subprojects' prop is already filtered by the selected Year/FundYear in the parent component
        const linkedSubprojects = (subprojects || []).filter(sp => womenLedIpoNames.has(sp.indigenousPeopleOrganization));

        // 3. Identify Trainings linked to WL IPOs
        // Note: 'trainings' prop is already filtered by the selected Year/FundYear in the parent component
        const linkedTrainings = (trainings || []).filter(t =>
            (t.participatingIpos || []).some(ipoName => womenLedIpoNames.has(ipoName))
        );

        // 4. Calculate Total Allocation
        // Sum of subproject budgets (price * units)
        const subprojectAllocation = linkedSubprojects.reduce((sum, sp) => {
            return sum + (sp.details || []).reduce((dSum, d) => dSum + (d.pricePerUnit * d.numberOfUnits), 0);
        }, 0);

        // Sum of training expenses
        const trainingAllocation = linkedTrainings.reduce((sum, t) => {
            return sum + (t.expenses || []).reduce((eSum, e) => eSum + e.amount, 0);
        }, 0);

        // 5. Count "Total Women-led IPOs" (Engaged)
        // Definition: IPOs that are tagged as Women-led with linked subprojects and trainings in the selected year
        const engagedWomenLedIPOs = new Set<string>();

        // Add from Subprojects
        linkedSubprojects.forEach(sp => engagedWomenLedIPOs.add(sp.indigenousPeopleOrganization));

        // Add from Trainings
        linkedTrainings.forEach(t => {
            (t.participatingIpos || []).forEach(ipo => {
                if (womenLedIpoNames.has(ipo)) {
                    engagedWomenLedIPOs.add(ipo);
                }
            });
        });

        return {
            totalIpos: engagedWomenLedIPOs.size,
            totalAllocation: subprojectAllocation + trainingAllocation,
            totalSubprojects: linkedSubprojects.length,
            totalTrainings: linkedTrainings.length
        };
    }, [ipos, subprojects, trainings]);

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(amount);
    };

    // Simple Bar Chart Component
    const SimpleComparisonChart = ({ label, male, female, type }: { label: string, male: number, female: number, type: 'Target' | 'Accomplishment' }) => {
        const total = male + female;
        const malePercent = total > 0 ? (male / total) * 100 : 0;
        const femalePercent = total > 0 ? (female / total) * 100 : 0;

        return (
            <div className="gad-comparison-chart">
                <div className="gad-comparison-chart__legend">
                    <span className="gad-sex-label gad-sex-label--male">Male: {male.toLocaleString()} ({malePercent.toFixed(1)}%)</span>
                    <span className="gad-sex-label gad-sex-label--female">Female: {female.toLocaleString()} ({femalePercent.toFixed(1)}%)</span>
                </div>
                <div className="gad-comparison-chart__track">
                    <div
                        className="gad-comparison-chart__segment gad-comparison-chart__segment--male"
                        style={{ width: `${malePercent}%` }}
                        title={`Male ${type}: ${male}`}
                    ></div>
                    <div
                        className="gad-comparison-chart__segment gad-comparison-chart__segment--female"
                        style={{ width: `${femalePercent}%` }}
                        title={`Female ${type}: ${female}`}
                    ></div>
                </div>
                <p className="gad-comparison-chart__total">{label}: {total.toLocaleString()}</p>
            </div>
        );
    };

    const WomenLedCard = ({ title, value, icon, tone, subtext }: { title: string, value: string, icon: React.ReactNode, tone: 'purple' | 'pink' | 'indigo' | 'violet', subtext?: string }) => (
        <article className={`gad-kpi gad-kpi--${tone}`}>
            <div>
                <p className="gad-kpi__label">{title}</p>
                <p className="gad-kpi__value">{value}</p>
                {subtext && <p className="gad-kpi__meta">{subtext}</p>}
            </div>
            <div className="gad-kpi__icon">
                {icon}
            </div>
        </article>
    );

    return (
        <div className="gad-dashboard dashboard-view animate-fadeIn">
            {/* Header Section */}
            <div className="content-card dashboard-module-hero">
                <div>
                    <h3 className="dashboard-module-title">Gender and Development (GAD) Dashboard</h3>
                    <p className="dashboard-module-copy">Monitoring sex-disaggregated data and support for women-led organizations.</p>
                </div>
                <div className="dashboard-module-icon">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                    </svg>
                </div>
            </div>

            {/* Women-Led IPOs Section */}
            <section className="gad-section" aria-labelledby="women-led-ipos">
                <h3 id="women-led-ipos" className="gad-section__title">Women-Led IPO Overview (Engaged)</h3>
                <div className="gad-kpi-grid">
                    <WomenLedCard
                        title="Total Women-Led IPOs"
                        value={womenLedStats.totalIpos.toLocaleString()}
                        subtext="Engaged via SP/Training"
                        tone="purple"
                        icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.653-.184-1.268-.5-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.653.184-1.268.5-1.857m0 0a5.002 5.002 0 019 0m-4.5 5.002v-10a4.5 4.5 0 00-9 0v10m9 0a4.5 4.5 0 00-9 0" /></svg>}
                    />
                    <WomenLedCard
                        title="Total Allocation"
                        value={formatCurrency(womenLedStats.totalAllocation)}
                        tone="pink"
                        icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
                    />
                    <WomenLedCard
                        title="Subprojects Granted"
                        value={womenLedStats.totalSubprojects.toLocaleString()}
                        tone="indigo"
                        icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>}
                    />
                    <WomenLedCard
                        title="Trainings Participated"
                        value={womenLedStats.totalTrainings.toLocaleString()}
                        tone="violet"
                        icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg>}
                    />
                </div>
            </section>

            {/* Sex Disaggregated Data Section */}
            <section className="gad-section" aria-labelledby="sex-disaggregated-data">
                <h3 id="sex-disaggregated-data" className="gad-section__title">Sex Disaggregated Data - Trainings</h3>

                <div className="gad-stat-grid">
                    {/* Stat Cards */}
                    <article className="gad-stat gad-stat--male">
                        <p className="gad-stat__label">Total Male Target</p>
                        <p className="gad-stat__value">{stats.targetMale.toLocaleString()}</p>
                    </article>
                    <article className="gad-stat gad-stat--female">
                        <p className="gad-stat__label">Total Female Target</p>
                        <p className="gad-stat__value">{stats.targetFemale.toLocaleString()}</p>
                    </article>
                    <article className="gad-stat gad-stat--male-actual">
                        <p className="gad-stat__label">Actual Male Participants</p>
                        <p className="gad-stat__value">{stats.actualMale.toLocaleString()}</p>
                        <p className="gad-stat__meta">
                            {stats.targetMale > 0 ? `${Math.round((stats.actualMale / stats.targetMale) * 100)}% of Target` : 'No Target'}
                        </p>
                    </article>
                    <article className="gad-stat gad-stat--female-actual">
                        <p className="gad-stat__label">Actual Female Participants</p>
                        <p className="gad-stat__value">{stats.actualFemale.toLocaleString()}</p>
                        <p className="gad-stat__meta">
                            {stats.targetFemale > 0 ? `${Math.round((stats.actualFemale / stats.targetFemale) * 100)}% of Target` : 'No Target'}
                        </p>
                    </article>
                </div>

                {/* Comparative Charts */}
                <div className="gad-chart-grid">
                    <article className="dashboard-panel gad-chart-card">
                        <h4 className="gad-chart-card__title">Target Distribution by Sex</h4>
                        <div className="flex items-center justify-center h-40">
                            <SimpleComparisonChart
                                label="Total Targets"
                                male={stats.targetMale}
                                female={stats.targetFemale}
                                type="Target"
                            />
                        </div>
                    </article>

                    <article className="dashboard-panel gad-chart-card">
                        <h4 className="gad-chart-card__title">Accomplishment Distribution by Sex</h4>
                        <div className="flex items-center justify-center h-40">
                            <SimpleComparisonChart
                                label="Total Accomplishment"
                                male={stats.actualMale}
                                female={stats.actualFemale}
                                type="Accomplishment"
                            />
                        </div>
                    </article>
                </div>
            </section>

            {/* Comparison Bar Chart: Target vs Actual per Sex */}
            <section className="dashboard-panel gad-target-card">
                <h4 className="gad-chart-card__title">Target vs Accomplishment Comparison</h4>
                <div className="gad-target-list">
                    <div className="gad-target-row">
                        <div className="gad-target-row__header">
                            <span className="gad-sex-label gad-sex-label--male">Male</span>
                            <span className="gad-target-row__value">
                                {stats.actualMale.toLocaleString()} / {stats.targetMale.toLocaleString()}
                            </span>
                        </div>
                        <div className="gad-target-row__track">
                            {/* Target Bar (Background/Basis) */}
                            <div className="gad-target-row__baseline"></div>
                            {/* Actual Bar */}
                            <div
                                className="gad-target-row__actual gad-target-row__actual--male"
                                style={{ width: `${stats.targetMale > 0 ? Math.min((stats.actualMale / stats.targetMale) * 100, 100) : 0}%` }}
                            ></div>
                        </div>
                    </div>

                    <div className="gad-target-row">
                        <div className="gad-target-row__header">
                            <span className="gad-sex-label gad-sex-label--female">Female</span>
                            <span className="gad-target-row__value">
                                {stats.actualFemale.toLocaleString()} / {stats.targetFemale.toLocaleString()}
                            </span>
                        </div>
                        <div className="gad-target-row__track">
                            {/* Target Bar (Background/Basis) */}
                            <div className="gad-target-row__baseline"></div>
                            {/* Actual Bar */}
                            <div
                                className="gad-target-row__actual gad-target-row__actual--female"
                                style={{ width: `${stats.targetFemale > 0 ? Math.min((stats.actualFemale / stats.targetFemale) * 100, 100) : 0}%` }}
                            ></div>
                        </div>
                    </div>
                </div>
            </section>
        </div>
    );
};

export default GADDashboard;
