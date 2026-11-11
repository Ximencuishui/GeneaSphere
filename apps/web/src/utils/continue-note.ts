/**
 * 世系接续的固定措辞。苏式版本A、版本B和欧式世系表共用。
 * 古式简注只写图号。新式详注在图号后补页码。
 */
export type ContinueNoteMode = 'brief' | 'full';

export interface ContinueNote {
  kind: 'cut' | 'resume';
  /** 要跳到的图，从 1 起。 */
  chartNo: number;
  /** 该图所在页，从 1 起。简注不印。 */
  pageNo?: number | null;
  /** 接上必须写的父名。截断不用。 */
  fatherName?: string;
}

export function continueNoteMode(value: unknown, script?: 'horizontal' | 'antique'): ContinueNoteMode {
  if (value === 'brief' || value === 'full') return value;
  return script === 'antique' ? 'brief' : 'full';
}

export function formatContinueNote(
  note: ContinueNote,
  mode: ContinueNoteMode,
): { lead: string; linkText: string; tail: string; text: string } {
  const linkText = `见第${note.chartNo}图`;
  const tail = mode === 'full' && note.pageNo ? `（第${note.pageNo}页）` : '';
  const lead = note.kind === 'cut'
    ? '支另见图，'
    : `接上：【${(note.fatherName || '').trim() || '本支'}】，`;
  return { lead, linkText, tail, text: `${lead}${linkText}${tail}` };
}
