/**
 * tree-layout.spacing.spec.ts - tree-layout.ts 间距函数单元测试
 *
 * [2026-09-01 P0 修复] 验证 computeAutoNodeSep 的 maxNodeSep 上限约束：
 *   - 大族谱（avgNodesPerGen > 20）默认 nodeSep 应被 maxNodeSep 截断
 *   - 中小族谱不受影响（avgNodesPerGen ≤ 5 时 nodeSep ≥ 16）
 */

import { describe, it, expect } from 'vitest'
import { computeAutoNodeSep, computeAutoRankSep } from '@/utils/tree-layout'

describe('tree-layout.ts 间距计算', () => {
  describe('computeAutoNodeSep - P0 maxNodeSep 上限约束', () => {
    it('avgNodesPerGen < 5（小型族谱）：默认 maxNodeSep=80 不生效', () => {
      // 10 节点 / 5 代 = 2
      const sep = computeAutoNodeSep(10, 5, 64)
      expect(sep).toBeGreaterThanOrEqual(16) // max(16, 64*0.25)=16
      expect(sep).toBeLessThanOrEqual(80)
    })

    it('avgNodesPerGen < 20（中等族谱）：默认 maxNodeSep=80 不生效', () => {
      // 100 节点 / 8 代 = 12.5
      const sep = computeAutoNodeSep(100, 8, 64)
      expect(sep).toBeGreaterThanOrEqual(12) // max(12, 64*0.19)≈12.16
      expect(sep).toBeLessThanOrEqual(80)
    })

    it('avgNodesPerGen ≥ 20（大型族谱）：maxNodeSep 上限生效', () => {
      // 86 节点 / 4 代 = 21.5 → 进入第三个分支 max(10, 64*0.13)=10
      // 默认 maxNodeSep=80，10 < 80 → 不截断
      const sepDefault = computeAutoNodeSep(86, 4, 64)
      expect(sepDefault).toBeGreaterThanOrEqual(10)

      // 自定义 maxNodeSep=10 时会截断
      const sepCapped = computeAutoNodeSep(86, 4, 64, 10)
      expect(sepCapped).toBeLessThanOrEqual(10)
    })

    it('极端大族谱 + maxNodeSep=80：nodeSep 上限严格生效', () => {
      // 500 节点 / 5 代 = 100（远超 20），原始 nodeSep = max(10, 64*0.13) = 10
      // 默认 maxNodeSep=80 → 不截断（10 < 80）
      const sepDefault = computeAutoNodeSep(500, 5, 64)
      expect(sepDefault).toBe(10) // 公式值就是 10，未触及上限

      // 自定义 maxNodeSep=5 时强制截断（极端紧凑族谱场景）
      const sepExtreme = computeAutoNodeSep(500, 5, 64, 5)
      expect(sepExtreme).toBe(5)
    })
  })

  describe('computeAutoRankSep', () => {
    it('nodeHeight=28 时返回 max(68, 70) = 70', () => {
      expect(computeAutoRankSep(28)).toBe(70)
    })

    it('nodeHeight=50 时返回 max(90, 125) = 125', () => {
      expect(computeAutoRankSep(50)).toBe(125)
    })

    it('nodeHeight=20 时返回 max(60, 50) = 60（保底 nodeHeight+40）', () => {
      expect(computeAutoRankSep(20)).toBe(60)
    })
  })
})