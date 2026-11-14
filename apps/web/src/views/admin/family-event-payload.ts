export type FamilyEventWriteForm = {
  event_name: string
  event_type: string
  event_date: string
  event_year?: number
  location: string
  description: string
  media_ids: number[]
}

/**
 * event_year 是独立字段。有具体日期时从日期字符串的公历年写入，
 * 让它和日期年份一致；没有日期时沿用单独填写的年份。
 */
export function yearFromEventDateInput(value: string): number {
  const matched = /^(\d{4})/.exec(value.trim())
  if (!matched) {
    throw new Error(`无法从日期解析年份: ${value}`)
  }
  return Number(matched[1])
}

export function buildFamilyEventWritePayload(form: FamilyEventWriteForm) {
  const payload: {
    event_name: string
    event_type: string
    location?: string
    description?: string
    media_ids: number[]
    event_date?: string
    event_year?: number
  } = {
    event_name: form.event_name,
    event_type: form.event_type,
    location: form.location || undefined,
    description: form.description || undefined,
    media_ids: form.media_ids,
  }
  if (form.event_date) {
    payload.event_date = new Date(form.event_date).toISOString()
    payload.event_year = yearFromEventDateInput(form.event_date)
  } else if (form.event_year) {
    payload.event_year = form.event_year
  }
  return payload
}
