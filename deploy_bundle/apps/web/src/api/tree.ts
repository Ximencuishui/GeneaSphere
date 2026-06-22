import request from '@/utils/request';

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
   * Move a subtree to a new parent
   */
  moveSubTree: (subtreeRootId: string, newParentId: string) =>
    request.patch('/api/tree/move-subtree', {
      subtree_root_id: subtreeRootId,
      new_parent_id: newParentId,
    }),
};

export default treeApi;