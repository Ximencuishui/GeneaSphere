import request from '@/utils/request';
import type { PersonDetail } from '@/types';

/**
 * 家族成员搜索结果项（轻量级，用于人物下拉搜索）
 */
export interface PersonSearchResult {
  id: string | number;
  full_name: string;
  gender?: string;
  birth_date?: string;
  death_date?: string;
}

/**
 * 血缘校验结果
 */
export interface KinshipCheckResult {
  isConsanguineous: boolean;
  commonAncestors: {
    ancestor_id: string;
    from_a_depth: number;
    from_b_depth: number;
  }[];
  relationship?: 'self' | 'parent-child' | 'sibling' | 'grandparent-grandchild' | 'cousin' | 'uncle-nephew' | 'other';
}

export const treeApi = {
  /**
   * Get subtree rooted at a specific person
   */
  getSubTree: (rootPersonId: string) =>
    request.get(`/api/tree/subtree/${rootPersonId}`),

  /**
   * Get full clan tree data with avatar info and main lineage
   */
  getClanFullTree: (clanId: string, userId?: string) =>
    request.get(`/api/tree/clan/${clanId}/full`, {
      params: userId ? { userId } : {},
    }),

  /**
   * Get single person detail (parents / spouses / children)
   * - 用于侧栏编辑抽屉打开时一次性拉取
   */
  getPersonDetail: (personId: string) =>
    request.get<PersonDetail>(`/api/tree/person/${personId}/detail`),

  /**
   * Search persons by name within a clan (for person picker)
   */
  searchPersons: (query: string, clanId: string | number) =>
    request.get<PersonSearchResult[], PersonSearchResult[]>('/api/tree/persons/search', {
      params: { q: query, clan_id: clanId },
    }),

  /**
   * Create a new person in the tree
   */
  createPerson: (data: {
    clan_id: string;
    full_name: string;
    gender: string;
    birth_date?: string;
    death_date?: string;
    is_living?: boolean;
    parent_id?: string;
  }) => request.post('/api/tree/person', data),

  /**
   * 更新人物基础信息（侧栏编辑保存）
   */
  updatePerson: (
    personId: string,
    updates: {
      full_name?: string;
      gender?: string;
      birth_date?: string | null;
      death_date?: string | null;
      is_living?: boolean;
      birth_place?: string | null;
      death_place?: string | null;
      migration_branch?: string | null;
    },
  ) => request.patch(`/api/tree/person/${personId}`, updates),

  /**
   * 创建婚姻（FamilyUnit）
   * - 内置血缘校验；近亲返回 409
   */
  createMarriage: (data: {
    clan_id: string | number;
    husband_id: string | number;
    wife_id: string | number;
    marriage_date?: string;
    end_date?: string;
    end_reason?: 'divorce' | 'widowed';
    is_current?: boolean;
    note?: string;
  }) => request.post('/api/tree/marriage', data),

  /**
   * 血缘校验（创建婚姻前预检）
   */
  checkKinship: (personAId: string | number, personBId: string | number) =>
    request.post<KinshipCheckResult>('/api/tree/kinship-check', {
      person_a_id: personAId,
      person_b_id: personBId,
    }),

  /**
   * Move a subtree to a new parent
   */
  moveSubTree: (subtreeRootId: string, newParentId: string) =>
    request.patch('/api/tree/move-subtree', {
      subtree_root_id: subtreeRootId,
      new_parent_id: newParentId,
    }),

  /**
   * 软删除人物（用于「撤销栈」自动回滚）
   */
  deletePerson: (personId: string) =>
    request.delete(`/api/tree/person/${personId}`),

  /**
   * 恢复软删除的人物（撤销栈使用）
   */
  restorePerson: (personId: string) =>
    request.patch(`/api/tree/person/${personId}/restore`),

  /**
   * 删除婚姻（FamilyUnit），用于撤销栈回滚
   */
  deleteMarriage: (familyId: string) =>
    request.delete(`/api/tree/marriage/${familyId}`),
};

export default treeApi;