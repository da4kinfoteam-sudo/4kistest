declare const PptxGenJS: any;
declare const JSZip: any;

export interface FinancialPptBucket {
    label: string;
    allocation: number;
    obligation: number;
    disbursement: number;
}

export interface FinancialPptMonthlyRow {
    month: string;
    obligation: number;
    disbursement: number;
    cumulativeObligation: number;
    cumulativeDisbursement: number;
}

export interface FinancialPptAdjustmentSlice {
    label: string;
    value: number;
}

export interface FinancialPowerPointInput {
    selectedYear: string;
    selectedOu: string;
    selectedTier: string;
    selectedFundType: string;
    totals: {
        allocation: number;
        obligation: number;
        disbursement: number;
        savings: number;
        realignment: number;
        cancelled: number;
    };
    componentRows: FinancialPptBucket[];
    monthlyRows: FinancialPptMonthlyRow[];
    savingsByComponent: FinancialPptAdjustmentSlice[];
    realignmentByComponent: FinancialPptAdjustmentSlice[];
}

const COMPONENT_COLORS: Record<string, string> = {
    'Social Preparation': '2563EB',
    'Production and Livelihood': '16A34A',
    'Marketing and Enterprise': '7C3AED',
    'Program Management': 'F59E0B',
};

const money = (amount: number) => new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
}).format(Math.ceil(amount));

const compactMoney = (amount: number) => {
    const absolute = Math.abs(amount);
    if (absolute >= 1e9) return `PHP ${(amount / 1e9).toFixed(1)}B`;
    if (absolute >= 1e6) return `PHP ${(amount / 1e6).toFixed(1)}M`;
    if (absolute >= 1e3) return `PHP ${(amount / 1e3).toFixed(0)}K`;
    return `PHP ${Math.ceil(amount).toLocaleString('en-PH')}`;
};

const rate = (value: number, base: number) => base !== 0 ? (value / base) * 100 : 0;
const percent = (value: number) => `${value.toFixed(1)}%`;
const sanitizeFileSegment = (value: string) => value.replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '') || 'All';

const toDataUri = async (url: string) => {
    try {
        const response = await fetch(url);
        if (!response.ok) return '';
        const blob = await response.blob();
        return await new Promise<string>(resolve => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(typeof reader.result === 'string' ? reader.result : '');
            reader.onerror = () => resolve('');
            reader.readAsDataURL(blob);
        });
    } catch {
        return '';
    }
};

const sanitizePowerPointBlob = async (blob: Blob) => {
    if (typeof JSZip === 'undefined') return blob;
    const zip = await JSZip.loadAsync(blob);
    const contentTypesFile = zip.file('[Content_Types].xml');
    if (!contentTypesFile) return blob;
    const contentTypesXml = await contentTypesFile.async('string');
    const parser = new DOMParser();
    const documentXml = parser.parseFromString(contentTypesXml, 'application/xml');
    if (documentXml.getElementsByTagName('parsererror').length > 0) return blob;
    const overrides = Array.from(documentXml.getElementsByTagNameNS(
        'http://schemas.openxmlformats.org/package/2006/content-types',
        'Override'
    )) as Element[];
    let changed = false;
    overrides.forEach(override => {
        const partName = override.getAttribute('PartName') || '';
        if (partName.startsWith('/ppt/slideMasters/slideMaster') && !zip.file(partName.replace(/^\//, ''))) {
            override.parentNode?.removeChild(override);
            changed = true;
        }
    });
    if (!changed) return blob;
    zip.file('[Content_Types].xml', new XMLSerializer().serializeToString(documentXml));
    return zip.generateAsync({
        type: 'blob',
        mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    });
};

const downloadBlob = (blob: Blob, fileName: string) => {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
};

export const generateFinancialPowerPoint = async (input: FinancialPowerPointInput) => {
    if (typeof PptxGenJS === 'undefined') throw new Error('PowerPoint export library is unavailable.');

    const pptx = new PptxGenJS();
    pptx.layout = 'LAYOUT_WIDE';
    pptx.author = '4K Information System';
    pptx.subject = 'Financial Accomplishment Dashboard';
    pptx.title = 'Financial Accomplishment Dashboard';
    pptx.company = 'Department of Agriculture - 4K Program';
    pptx.lang = 'en-US';
    pptx.theme = { headFontFace: 'Aptos Display', bodyFontFace: 'Aptos', lang: 'en-US' };

    const logoData = await toDataUri('/assets/4klogo.png');
    const green = '0F8A4B';
    const deepGreen = '0B5F3A';
    const blue = '2563EB';
    const purple = '7C3AED';
    const red = 'DC2626';
    const gold = 'E9A23B';
    const darkText = '0F172A';
    const mutedText = '64748B';
    const borderColor = 'CBD5E1';
    const slideW = 13.333;
    const slideH = 7.5;
    const scopeLabel = input.selectedOu === 'All' ? 'All OUs' : input.selectedOu;
    const generatedDate = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    const scopeSubtitle = `${scopeLabel} | Fund Year ${input.selectedYear} | ${input.selectedTier} | ${input.selectedFundType}`;
    const totals = input.totals;
    const obligationRate = rate(totals.obligation, totals.allocation);
    const disbursementEfficiency = rate(totals.disbursement, totals.obligation);
    const unobligated = totals.allocation - totals.obligation;
    const undisbursed = totals.obligation - totals.disbursement;
    const totalAdjustments = totals.savings + totals.realignment + totals.cancelled;

    const addHeader = (slide: any, title: string, subtitle?: string) => {
        slide.background = { color: 'FFFFFF' };
        slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: slideW, h: 0.62, fill: { color: green }, line: { color: green, transparency: 100 } });
        if (logoData) slide.addImage({ data: logoData, x: 0.28, y: 0.09, w: 0.42, h: 0.42 });
        slide.addText(title, { x: 0.82, y: 0.12, w: 8.6, h: 0.34, fontSize: 17, bold: true, color: 'FFFFFF', margin: 0 });
        slide.addText(generatedDate, { x: 10.05, y: 0.17, w: 2.9, h: 0.25, fontSize: 9, color: 'FFFFFF', align: 'right', margin: 0 });
        if (subtitle) slide.addText(subtitle, { x: 0.5, y: 0.8, w: 12.2, h: 0.25, fontSize: 10.5, color: mutedText, margin: 0 });
    };
    const addFooter = (slide: any, page: number) => {
        slide.addShape(pptx.ShapeType.rect, { x: 0.5, y: slideH - 0.36, w: 12.3, h: 0.01, fill: { color: borderColor, transparency: 35 }, line: { color: borderColor, transparency: 100 } });
        slide.addText('4K Information System', { x: 0.5, y: slideH - 0.27, w: 4, h: 0.15, fontSize: 7, color: mutedText, margin: 0 });
        slide.addText(String(page), { x: 12.2, y: slideH - 0.27, w: 0.6, h: 0.15, fontSize: 7, color: mutedText, align: 'right', margin: 0 });
    };
    const addLabel = (slide: any, text: string, x: number, y: number, w: number, h: number, options: Record<string, unknown> = {}) => {
        slide.addText(text, {
            x, y, w, h, margin: 0.03, fit: 'shrink', breakLine: false,
            fontFace: 'Aptos', color: darkText, fontSize: 11, ...options,
        });
    };
    const addMetricTile = (slide: any, title: string, value: string, subtitle: string, x: number, y: number, w: number, h: number, color = green) => {
        slide.addShape(pptx.ShapeType.roundRect, { x, y, w, h, rectRadius: 0.08, fill: { color: 'FFFFFF' }, line: { color: borderColor, transparency: 15 } });
        slide.addShape(pptx.ShapeType.rect, { x, y, w: 0.08, h, fill: { color }, line: { color, transparency: 100 } });
        addLabel(slide, title.toUpperCase(), x + 0.18, y + 0.13, w - 0.28, 0.18, { fontSize: 7.5, bold: true, color: mutedText });
        addLabel(slide, value, x + 0.18, y + 0.36, w - 0.28, 0.35, { fontSize: 17, bold: true, color: darkText });
        addLabel(slide, subtitle, x + 0.18, y + h - 0.28, w - 0.28, 0.18, { fontSize: 8.2, color: mutedText });
    };
    const addTable = (slide: any, rows: Array<Array<string | number>>, x: number, y: number, rowH: number, colWidths: number[], options: { headerFill?: string; fontSize?: number; maxRows?: number; numericColumns?: number[] } = {}) => {
        rows.slice(0, options.maxRows || rows.length).forEach((row, rowIndex) => {
            let cursorX = x;
            const fillColor = rowIndex === 0 ? (options.headerFill || green) : (rowIndex % 2 === 0 ? 'FFFFFF' : 'F8FAFC');
            row.forEach((value, colIndex) => {
                const cw = colWidths[colIndex];
                const isHeader = rowIndex === 0;
                slide.addShape(pptx.ShapeType.rect, { x: cursorX, y: y + (rowIndex * rowH), w: cw, h: rowH, fill: { color: fillColor }, line: { color: borderColor, transparency: 25 } });
                addLabel(slide, String(value), cursorX + 0.04, y + (rowIndex * rowH) + 0.04, cw - 0.08, rowH - 0.08, {
                    fontSize: isHeader ? Math.max((options.fontSize || 9) - 1, 7) : (options.fontSize || 9),
                    bold: isHeader || colIndex === 0,
                    color: isHeader ? 'FFFFFF' : darkText,
                    align: options.numericColumns?.includes(colIndex) ? 'right' : 'left',
                });
                cursorX += cw;
            });
        });
    };
    const addTrendSegment = (slide: any, start: { x: number; y: number }, end: { x: number; y: number }, color: string) => {
        const dx = end.x - start.x;
        const dy = end.y - start.y;
        const length = Math.sqrt((dx * dx) + (dy * dy));
        if (length < 0.01) return;
        const angle = Math.atan2(dy, dx) * (180 / Math.PI);
        slide.addShape(pptx.ShapeType.rect, {
            x: ((start.x + end.x) / 2) - (length / 2), y: ((start.y + end.y) / 2) - 0.0125,
            w: length, h: 0.025, rotate: angle, fill: { color }, line: { color, transparency: 100 },
        });
    };
    const addPie = (slide: any, title: string, rows: Array<{ label: string; value: number }>, x: number, y: number, w: number, h: number) => {
        const chartRows = rows.filter(row => row.value > 0);
        slide.addShape(pptx.ShapeType.roundRect, { x, y, w, h, rectRadius: 0.06, fill: { color: 'FFFFFF' }, line: { color: borderColor, transparency: 15 } });
        addLabel(slide, title, x + 0.16, y + 0.12, w - 0.32, 0.22, { fontSize: 10, bold: true, align: 'center' });
        if (chartRows.length === 0) {
            addLabel(slide, 'No data available', x + 0.4, y + 1.15, w - 0.8, 0.25, { fontSize: 10, color: mutedText, align: 'center' });
            return;
        }
        slide.addChart(pptx.ChartType.pie, [{ name: title, labels: chartRows.map(row => row.label), values: chartRows.map(row => row.value) }], {
            x: x + 0.2, y: y + 0.42, w: w - 0.4, h: h - 0.52,
            chartColors: chartRows.map(row => COMPONENT_COLORS[row.label] || '94A3B8'),
            showLegend: true, legendPos: 'b', legendFontSize: 7,
            showPercent: true, showValue: false, showCategoryName: false,
            dataLabelPosition: 'bestFit', dataLabelColor: darkText, dataLabelFormatCode: '0.0%',
            showTitle: false, showBorder: false,
        });
    };

    // Slide 1: Financial summary
    const summarySlide = pptx.addSlide();
    addHeader(summarySlide, 'Financial Summary', scopeSubtitle);
    const summaryTiles: Array<[string, string, string, string]> = [
        ['Target Allocation', money(totals.allocation), 'After tagged exclusions', green],
        ['Actual Obligated', money(totals.obligation), `${percent(obligationRate)} of allocation`, blue],
        ['Actual Disbursed', money(totals.disbursement), `${percent(disbursementEfficiency)} of obligations`, green],
        ['Obligation Rate', percent(obligationRate), 'Obligated / allocation', blue],
        ['Disbursement Efficiency', percent(disbursementEfficiency), 'Disbursed / obligated', purple],
        [unobligated < 0 ? 'Over-obligated' : 'Unobligated Balance', money(Math.abs(unobligated)), 'Allocation - obligation', unobligated < 0 ? red : purple],
    ];
    summaryTiles.forEach((tile, index) => addMetricTile(
        summarySlide, tile[0], tile[1], tile[2],
        0.55 + ((index % 3) * 4.18), 1.22 + (Math.floor(index / 3) * 1.5), 3.85, 1.18, tile[3]
    ));
    addTable(summarySlide, [
        ['Report Scope', 'Selection'], ['Fund Year', input.selectedYear], ['Operating Unit', scopeLabel],
        ['Tier', input.selectedTier], ['Fund Type', input.selectedFundType], ['Generated', generatedDate],
    ], 3.55, 4.45, 0.34, [2.35, 3.9], { headerFill: deepGreen, fontSize: 9.5 });
    addFooter(summarySlide, 1);

    // Slide 2: Budget utilization
    const utilizationSlide = pptx.addSlide();
    addHeader(utilizationSlide, 'Budget Utilization', scopeSubtitle);
    utilizationSlide.addShape(pptx.ShapeType.line, { x: 4.04, y: 2.18, w: 0.74, h: 0, line: { color: blue, width: 1.7, endArrowType: 'triangle' } });
    utilizationSlide.addShape(pptx.ShapeType.line, { x: 8.29, y: 2.18, w: 0.74, h: 0, line: { color: green, width: 1.7, endArrowType: 'triangle' } });
    [
        { title: 'Target Allocation', value: totals.allocation, subtitle: '100%', x: 0.55, color: mutedText },
        { title: 'Obligated', value: totals.obligation, subtitle: `${percent(obligationRate)} of allocation`, x: 4.8, color: blue },
        { title: 'Disbursed', value: totals.disbursement, subtitle: `${percent(disbursementEfficiency)} of obligations`, x: 9.05, color: green },
    ].forEach(stage => {
        utilizationSlide.addShape(pptx.ShapeType.roundRect, { x: stage.x, y: 1.48, w: 3.5, h: 1.42, rectRadius: 0.08, fill: { color: 'FFFFFF' }, line: { color: borderColor, transparency: 10 } });
        utilizationSlide.addShape(pptx.ShapeType.rect, { x: stage.x, y: 1.48, w: 3.5, h: 0.08, fill: { color: stage.color }, line: { color: stage.color, transparency: 100 } });
        addLabel(utilizationSlide, stage.title.toUpperCase(), stage.x + 0.2, 1.72, 3.1, 0.2, { fontSize: 8, bold: true, color: mutedText, align: 'center' });
        addLabel(utilizationSlide, money(stage.value), stage.x + 0.2, 2.0, 3.1, 0.36, { fontSize: 19, bold: true, align: 'center' });
        addLabel(utilizationSlide, stage.subtitle, stage.x + 0.2, 2.48, 3.1, 0.2, { fontSize: 9, bold: true, color: stage.color, align: 'center' });
    });
    addLabel(utilizationSlide, percent(obligationRate), 4.05, 1.84, 0.72, 0.18, { fontSize: 8.5, bold: true, color: blue, align: 'center' });
    addLabel(utilizationSlide, percent(disbursementEfficiency), 8.3, 1.84, 0.72, 0.18, { fontSize: 8.5, bold: true, color: green, align: 'center' });
    addMetricTile(utilizationSlide, unobligated < 0 ? 'Over-obligated' : 'Unobligated Balance', money(Math.abs(unobligated)), 'Allocation - obligation', 1.45, 3.65, 4.75, 1.35, unobligated < 0 ? red : purple);
    addMetricTile(utilizationSlide, undisbursed < 0 ? 'Over-disbursed' : 'Undisbursed Obligations', money(Math.abs(undisbursed)), 'Obligation - disbursement', 7.15, 3.65, 4.75, 1.35, undisbursed < 0 ? red : gold);
    addLabel(utilizationSlide, 'Actual obligations and disbursements remain included for excluded budget lines under the selected fund year.', 1.15, 5.55, 11.0, 0.28, { fontSize: 9.5, color: mutedText, align: 'center', italic: true });
    addFooter(utilizationSlide, 2);

    // Slide 3: Component performance, two pie charts, and table breakdown
    const componentSlide = pptx.addSlide();
    addHeader(componentSlide, 'Financial Performance by Component', scopeSubtitle);
    addPie(componentSlide, 'Obligation Distribution', input.componentRows.map(row => ({ label: row.label, value: row.obligation })), 0.45, 1.15, 3.05, 3.1);
    addPie(componentSlide, 'Disbursement Distribution', input.componentRows.map(row => ({ label: row.label, value: row.disbursement })), 3.68, 1.15, 3.05, 3.1);
    addTable(componentSlide, [
        ['Component', 'Allocation', 'Obligated', 'Disbursed', 'Obl. Rate', 'Disb. Eff.'],
        ...input.componentRows.map(row => [row.label, compactMoney(row.allocation), compactMoney(row.obligation), compactMoney(row.disbursement), percent(rate(row.obligation, row.allocation)), percent(rate(row.disbursement, row.obligation))]),
        ['TOTAL', compactMoney(totals.allocation), compactMoney(totals.obligation), compactMoney(totals.disbursement), percent(obligationRate), percent(disbursementEfficiency)],
    ], 6.95, 1.15, 0.52, [1.7, 0.93, 0.93, 0.93, 0.82, 0.87], { headerFill: deepGreen, fontSize: 7.7, numericColumns: [1, 2, 3, 4, 5] });
    addLabel(componentSlide, 'Obligation', 1.08, 4.6, 0.78, 0.2, { fontSize: 8, bold: true, color: blue, align: 'center' });
    addLabel(componentSlide, money(totals.obligation), 0.65, 4.9, 2.4, 0.3, { fontSize: 15, bold: true, align: 'center' });
    addLabel(componentSlide, 'Disbursement', 4.52, 4.6, 0.95, 0.2, { fontSize: 8, bold: true, color: green, align: 'center' });
    addLabel(componentSlide, money(totals.disbursement), 3.95, 4.9, 2.5, 0.3, { fontSize: 15, bold: true, align: 'center' });
    addFooter(componentSlide, 3);

    // Slide 4: Budget adjustments
    const adjustmentSlide = pptx.addSlide();
    addHeader(adjustmentSlide, 'Budget Adjustments', scopeSubtitle);
    [
        ['Tagged Savings', totals.savings, green], ['Realigned Amount', totals.realignment, blue],
        ['Cancelled Amount', totals.cancelled, red], ['Total Adjustments', totalAdjustments, purple],
    ].forEach((tile, index) => addMetricTile(adjustmentSlide, String(tile[0]), money(Number(tile[1])), `${percent(rate(Number(tile[1]), totals.allocation))} of allocation`, 0.55 + (index * 3.13), 1.15, 2.88, 1.08, String(tile[2])));
    addPie(adjustmentSlide, 'Savings by Component', input.savingsByComponent, 0.75, 2.65, 5.75, 3.55);
    addPie(adjustmentSlide, 'Realignment by Component', input.realignmentByComponent, 6.82, 2.65, 5.75, 3.55);
    addFooter(adjustmentSlide, 4);

    // Slide 5: Monthly bars and cumulative trend lines
    const trendSlide = pptx.addSlide();
    addHeader(trendSlide, 'Monthly Financial Trends', `${scopeSubtitle} | Monthly and cumulative actuals`);
    const chartX = 0.55;
    const chartY = 1.38;
    const chartW = 7.55;
    const chartH = 4.65;
    const trendMax = Math.max(1, ...input.monthlyRows.flatMap(row => [row.obligation, row.disbursement, row.cumulativeObligation, row.cumulativeDisbursement]));
    const slotW = chartW / input.monthlyRows.length;
    trendSlide.addShape(pptx.ShapeType.rect, { x: chartX, y: chartY, w: chartW, h: chartH, fill: { color: 'FFFFFF' }, line: { color: borderColor, transparency: 10 } });
    [0, 0.25, 0.5, 0.75, 1].forEach(step => {
        const y = chartY + chartH - (chartH * step);
        trendSlide.addShape(pptx.ShapeType.rect, { x: chartX, y, w: chartW, h: 0.006, fill: { color: 'E2E8F0' }, line: { color: 'E2E8F0', transparency: 100 } });
        addLabel(trendSlide, compactMoney(trendMax * step), chartX - 0.5, y - 0.08, 0.45, 0.16, { fontSize: 6.5, color: mutedText, align: 'right' });
    });
    const obligationPoints: Array<{ x: number; y: number }> = [];
    const disbursementPoints: Array<{ x: number; y: number }> = [];
    input.monthlyRows.forEach((row, index) => {
        const baseX = chartX + (index * slotW) + (slotW * 0.16);
        const obligationH = (Math.max(row.obligation, 0) / trendMax) * (chartH - 0.2);
        const disbursementH = (row.disbursement / trendMax) * (chartH - 0.2);
        const obligationY = chartY + chartH - ((Math.max(row.cumulativeObligation, 0) / trendMax) * (chartH - 0.2));
        const disbursementY = chartY + chartH - ((row.cumulativeDisbursement / trendMax) * (chartH - 0.2));
        trendSlide.addShape(pptx.ShapeType.rect, { x: baseX, y: chartY + chartH - obligationH, w: slotW * 0.22, h: Math.max(obligationH, 0.01), fill: { color: '60A5FA' }, line: { color: '60A5FA', transparency: 100 } });
        trendSlide.addShape(pptx.ShapeType.rect, { x: baseX + (slotW * 0.27), y: chartY + chartH - disbursementH, w: slotW * 0.22, h: Math.max(disbursementH, 0.01), fill: { color: '22C55E' }, line: { color: '22C55E', transparency: 100 } });
        obligationPoints.push({ x: chartX + (index * slotW) + (slotW * 0.5), y: obligationY });
        disbursementPoints.push({ x: chartX + (index * slotW) + (slotW * 0.5), y: disbursementY });
        addLabel(trendSlide, row.month, chartX + (index * slotW), chartY + chartH + 0.08, slotW, 0.16, { fontSize: 7.2, align: 'center', color: mutedText });
    });
    const drawLine = (points: Array<{ x: number; y: number }>, color: string) => points.forEach((point, index) => {
        if (index > 0) addTrendSegment(trendSlide, points[index - 1], point, color);
        trendSlide.addShape(pptx.ShapeType.ellipse, { x: point.x - 0.04, y: point.y - 0.04, w: 0.08, h: 0.08, fill: { color }, line: { color } });
    });
    drawLine(obligationPoints, blue);
    drawLine(disbursementPoints, green);
    addLabel(trendSlide, 'Monthly obligation bars', 0.65, 6.32, 1.45, 0.16, { fontSize: 7.7, color: '60A5FA', bold: true });
    addLabel(trendSlide, 'Monthly disbursement bars', 2.15, 6.32, 1.65, 0.16, { fontSize: 7.7, color: '22C55E', bold: true });
    addLabel(trendSlide, 'Cumulative obligation line', 3.88, 6.32, 1.65, 0.16, { fontSize: 7.7, color: blue, bold: true });
    addLabel(trendSlide, 'Cumulative disbursement line', 5.62, 6.32, 1.85, 0.16, { fontSize: 7.7, color: green, bold: true });
    addTable(trendSlide, [
        ['Month', 'Obligation', 'Disbursement', 'Cum. Obl.', 'Cum. Disb.'],
        ...input.monthlyRows.map(row => [row.month, compactMoney(row.obligation), compactMoney(row.disbursement), compactMoney(row.cumulativeObligation), compactMoney(row.cumulativeDisbursement)]),
    ], 8.35, 1.05, 0.4, [0.58, 0.94, 0.94, 0.99, 0.99], { headerFill: deepGreen, fontSize: 7.2, numericColumns: [1, 2, 3, 4] });
    addFooter(trendSlide, 5);

    const fileName = `4K_Financial_Accomplishment_Dashboard_${sanitizeFileSegment(input.selectedYear)}_${sanitizeFileSegment(scopeLabel)}_${new Date().toISOString().split('T')[0]}.pptx`;
    const rawBlob = await pptx.write({ outputType: 'blob' });
    const sanitizedBlob = await sanitizePowerPointBlob(rawBlob);
    downloadBlob(sanitizedBlob, fileName);
};
