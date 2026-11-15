/**
 * 首页姓氏迁徙路线
 * 保证各姓沿走廊走到台湾、东南亚等远处，而不是从郡望一笔甩过整片海。
 */
import { describe, expect, it } from 'vitest'
import {
  OCEAN_EXITS,
  maxSegmentSpan,
  migrationHubs,
  pathPointAt,
  sameLngLat,
  surnames,
} from './surname-migrations'

interface Box {
  minLng: number
  maxLng: number
  minLat: number
  maxLat: number
}

const box = (minLng: number, maxLng: number, minLat: number, maxLat: number): Box => ({
  minLng,
  maxLng,
  minLat,
  maxLat,
})

const PORT = {
  台湾: box(120, 122, 22.4, 25.3),
  马尼拉: box(120.5, 121.3, 14.2, 15.0),
  宿务: box(123.4, 124.3, 9.9, 10.8),
  新加坡: box(103.6, 104.1, 1.1, 1.5),
  雅加达: box(106.5, 107.2, -6.5, -5.8),
  泗水: box(112.3, 113.2, -7.7, -6.8),
  曼谷: box(100.2, 100.8, 13.4, 14.1),
  西贡: box(106.3, 107.1, 10.4, 11.2),
  金边: box(104.5, 105.4, 11.2, 12.0),
  马六甲: box(102.0, 102.6, 1.9, 2.5),
  棉兰: box(98.3, 99.1, 3.2, 4.0),
  槟城: box(100.0, 100.7, 5.1, 5.8),
  仰光: box(95.8, 96.6, 16.5, 17.3),
  横滨: box(139.2, 140.1, 35.1, 35.9),
} as const

function reaches(name: string, region: Box): boolean {
  const surname = surnames.find((s) => s.name === name)
  if (!surname) return false
  return surname.paths.some((path) =>
    path.some(
      (p) =>
        p.lng >= region.minLng &&
        p.lng <= region.maxLng &&
        p.lat >= region.minLat &&
        p.lat <= region.maxLat,
    ),
  )
}

describe('姓氏迁徙路线', () => {
  it('每条路线从本姓郡望出发，并至少走出五条支线', () => {
    expect(surnames).toHaveLength(10)
    for (const surname of surnames) {
      expect(surname.paths.length, surname.name).toBeGreaterThanOrEqual(5)
      for (const path of surname.paths) {
        expect(path[0]).toEqual(surname.origin)
        expect(path.length, surname.name).toBeGreaterThanOrEqual(3)
      }
    }
  })

  it('单段跨度有限，路线沿走廊推进而不是直线跨越', () => {
    for (const surname of surnames) {
      for (const path of surname.paths) {
        expect(maxSegmentSpan(path), surname.name).toBeLessThanOrEqual(8.5)
      }
    }
  })

  it('十个大姓的树根仍覆盖关东，以及河西或川滇', () => {
    for (const surname of surnames) {
      const ends = surname.paths.map((path) => path[path.length - 1])
      const hit = (pred: (p: { lng: number; lat: number }) => boolean) => ends.some(pred)
      expect(hit((p) => p.lat > 41 && p.lng > 122), `${surname.name} 关东`).toBe(true)
      expect(
        hit((p) => p.lng < 100 || (p.lng < 106 && p.lat < 32 && p.lat > 21)),
        `${surname.name} 西或西南`,
      ).toBe(true)
    }
  })

  it('地图内的海外落点按侨乡分开', () => {
    const assigned: Record<string, (keyof typeof PORT)[]> = {
      李: ['新加坡', '曼谷', '西贡'],
      王: ['台湾', '马尼拉', '新加坡', '横滨'],
      张: ['曼谷', '新加坡', '棉兰'],
      刘: ['马六甲', '西贡', '金边'],
      陈: ['台湾', '马尼拉', '宿务', '雅加达'],
      杨: ['仰光', '曼谷', '新加坡'],
      赵: ['西贡', '曼谷', '金边'],
      黄: ['马尼拉', '槟城', '泗水'],
      周: ['西贡', '金边', '曼谷'],
      吴: ['台湾', '新加坡', '雅加达', '仰光'],
    }
    for (const [name, ports] of Object.entries(assigned)) {
      for (const port of ports) {
        expect(reaches(name, PORT[port]), `${name} → ${port}`).toBe(true)
      }
    }
  })

  it('远洋出框方向跟姓氏对应', () => {
    const exitOf = (id: string) => OCEAN_EXITS.find((exit) => exit.id === id)!
    const assigned: Record<string, string[]> = {
      李: ['americas', 'oceania'],
      王: ['americas'],
      张: ['americas', 'oceania'],
      刘: ['americas'],
      陈: ['americas'],
      杨: ['oceania'],
      赵: ['europe'],
      黄: ['americas'],
      周: ['europe'],
      吴: ['americas'],
    }
    for (const surname of surnames) {
      const ends = surname.paths.map((path) => path[path.length - 1])
      for (const id of assigned[surname.name]) {
        const exit = exitOf(id)
        expect(ends.some((end) => sameLngLat(end, exit.target)), `${surname.name} → ${exit.label}`).toBe(true)
      }
    }
    expect(OCEAN_EXITS.map((exit) => exit.label)).toEqual(['北美', '澳新', '欧洲'])
  })

  it('侨居港口在图上有名字', () => {
    const names = migrationHubs.map((h) => h.name)
    for (const name of ['台湾', '马尼拉', '宿务', '新加坡', '雅加达', '泗水', '槟城', '棉兰', '曼谷', '仰光', '横滨']) {
      expect(names).toContain(name)
    }
  })

  it('插值按路程而不是按折点数', () => {
    const path = [
      { lng: 0, lat: 0 },
      { lng: 10, lat: 0 },
      { lng: 10, lat: 1 },
    ]
    const mid = pathPointAt(path, 0.5)
    expect(mid.lng).toBeGreaterThan(5)
    expect(mid.lng).toBeLessThan(6)
    expect(mid.lat).toBe(0)
    expect(pathPointAt(path, 0)).toEqual(path[0])
    expect(pathPointAt(path, 1)).toEqual(path[2])
  })
})
