import { describe, expect, it } from 'vitest'
import { SpatialGrid, diffIds } from '@/utils/viewport-cull'

describe('空间网格', () => {
  const grid = new SpatialGrid(
    [
      { id: 'a', x: 100, y: 100 },
      { id: 'b', x: 2500, y: 100 },
      { id: 'c', x: -100, y: -100 },
    ],
    2000,
  )

  it('只返回视口盖住的格子里的节点', () => {
    expect(grid.nodesInRect(0, 0, 1500, 1500).sort()).toEqual(['a'])
    expect(grid.nodesInRect(2000, 0, 3000, 500)).toEqual(['b'])
    expect(grid.nodesInRect(-500, -500, 100, 100).sort()).toEqual(['a', 'c'])
  })

  it('差分只包含进入和离开的 id', () => {
    const previous = new Set(['a', 'b'])
    const next = new Set(['b', 'c'])
    expect(diffIds(previous, next)).toEqual({ entered: ['c'], left: ['a'] })
  })
})
