/** CSV 单元格：引号转义，并以引号前缀挡住以公式字符开头的内容。 */
export function csvCell(value: unknown): string {
  let text = value == null ? '' : String(value);
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

export function toCsv(headers: string[], rows: unknown[][]): string {
  const lines = [headers.map((header) => csvCell(header)).join(',')];
  for (const row of rows) lines.push(row.map((cell) => csvCell(cell)).join(','));
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}
