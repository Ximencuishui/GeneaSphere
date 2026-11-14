import { describe, expect, it } from 'vitest'
import { buildFamilyEventWritePayload } from './family-event-payload'

const form = {
  event_name: '朱熹诞生',
  event_type: 'birth',
  event_date: '',
  event_year: undefined as number | undefined,
  location: '福建尤溪',
  description: '',
  media_ids: [] as number[],
}

describe('家族大事件提交', () => {
  it('带日期提交时 event_year 等于日期的年份', () => {
    const payload = buildFamilyEventWritePayload({
      ...form,
      event_date: '1130-09-15',
      event_year: 2000,
    })

    expect(payload.event_year).toBe(1130)
    expect(payload.event_date?.startsWith('1130-09-15')).toBe(true)
  })
})
