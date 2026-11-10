/**
 * 与网页版 biography-index 同一套图号。
 * 册谱 PDF 不能引用网页包，所以这里留一份出现顺序。
 */
import type { EuropeanChart } from './european-chart';

export interface ChartAppearance {
  chartNo: number;
  sequence: number;
  chartNos: number[];
}

export function biographyAnchorId(name: string, chartNo: number): string {
  return `bio-${String(name).trim()}-${chartNo}`;
}

export function treeAnchorId(chartNo: number): string {
  return `tree-${chartNo}`;
}

export function indexChartAppearances(charts: readonly EuropeanChart[]): Map<string, ChartAppearance> {
  const seen = new Map<string, ChartAppearance>();
  let sequence = 0;
  const ordered = [...charts].sort((a, b) => a.index - b.index);
  for (const chart of ordered) {
    const cells = [...chart.cells].sort((a, b) => a.row - b.row || a.col - b.col);
    for (const cell of cells) {
      const chartNo = chart.index + 1;
      const found = seen.get(cell.personId);
      if (!found) {
        sequence += 1;
        seen.set(cell.personId, { chartNo, sequence, chartNos: [chartNo] });
        continue;
      }
      if (!found.chartNos.includes(chartNo)) found.chartNos.push(chartNo);
    }
  }
  return seen;
}
