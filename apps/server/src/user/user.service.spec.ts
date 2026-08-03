// CosService 和 ImageProcessorService 内部依赖 uuid（ESM-only），这里用空 mock 避免
// 在 jest 环境下拉起整条 ESM 链；user center 三个聚合 API 不会真正调用这些服务。
jest.mock('../cos/cos.service', () => ({
  CosService: jest.fn().mockImplementation(() => ({
    getDriverType: () => 'local',
    uploadFile: jest.fn(),
  })),
}));
jest.mock('../cos/image-processor.service', () => ({
  ImageProcessorService: jest.fn().mockImplementation(() => ({})),
}));

import { UserService } from './user.service';

/**
 * UserService 用户中心聚合 API 是计划重点改造的对象：
 * - listToolHistory：按当前用户过滤的真实 ToolUsageLog 记录，绝不补造假数据；
 * - listUserGroups：仅返回当前用户作为成员、且 group 未删除的小组；
 * - listUserVideos：按 requester_id 过滤的真实 VideoProject 数据，不伪造 URL/时长/状态。
 *
 * 这些测试只覆盖上述三条聚合 API 在 tenant 隔离上的不变量，避免无意中混进别人的数据。
 */

function buildPrismaMock() {
  return {
    toolUsageLog: {
      findMany: jest.fn(),
      count: jest.fn(),
    },
    groupMember: {
      findMany: jest.fn(),
    },
    videoProject: {
      findMany: jest.fn(),
      count: jest.fn(),
    },
  };
}

function buildService(prisma: any) {
  // 三个聚合 API 不使用 cos/imageProcessor，传空对象即可
  return new UserService(prisma, {} as any, {} as any);
}

describe('UserService 用户中心聚合 API', () => {
  describe('listToolHistory', () => {
    it('按 user_id 过滤、分页，并返回真实字段（不补造 URL 或 status）', async () => {
      const prisma = buildPrismaMock();
      const svc = buildService(prisma);

      const fakeRows = [
        {
          id: BigInt(1),
          tool_type: 'photo_restoration',
          status: 'COMPLETED',
          credits_used: 3,
          input_url: 'https://example.com/in1.jpg',
          output_url: 'https://example.com/out1.jpg',
          created_at: new Date('2026-06-23T10:00:00.000Z'),
          completed_at: new Date('2026-06-23T10:05:00.000Z'),
        },
        {
          id: BigInt(2),
          tool_type: 'face_colorize',
          status: 'FAILED',
          credits_used: 0,
          input_url: 'https://example.com/in2.jpg',
          output_url: null,
          created_at: new Date('2026-06-22T10:00:00.000Z'),
          completed_at: new Date('2026-06-22T10:05:00.000Z'),
        },
      ];
      prisma.toolUsageLog.findMany.mockResolvedValue(fakeRows);
      prisma.toolUsageLog.count.mockResolvedValue(2);

      const out = await svc.listToolHistory('user1', 1, 20);

      // 入参校验
      expect(prisma.toolUsageLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { user_id: 'user1' },
          orderBy: { created_at: 'desc' },
          skip: 0,
          take: 20,
        }),
      );
      expect(prisma.toolUsageLog.count).toHaveBeenCalledWith({
        where: { user_id: 'user1' },
      });

      expect(out.data).toHaveLength(2);
      expect(out.data[0].id).toBe('1');
      expect(out.data[0].status).toBe('COMPLETED');
      expect(out.data[0].credits_used).toBe(3);
      expect(out.data[1].status).toBe('FAILED');
      expect(out.data[1].output_url).toBeNull();
      expect(out.pagination).toEqual({
        page: 1,
        page_size: 20,
        total: 2,
        total_pages: 1,
      });
    });

    it('空数据 → data 为空且 total=0（不返回任何假记录）', async () => {
      const prisma = buildPrismaMock();
      prisma.toolUsageLog.findMany.mockResolvedValue([]);
      prisma.toolUsageLog.count.mockResolvedValue(0);
      const svc = buildService(prisma);

      const out = await svc.listToolHistory('user1', 1, 20);
      expect(out.data).toEqual([]);
      expect(out.pagination.total).toBe(0);
      expect(out.pagination.total_pages).toBe(0);
    });

    it('page=2 pageSize=5 → skip=5 take=5', async () => {
      const prisma = buildPrismaMock();
      prisma.toolUsageLog.findMany.mockResolvedValue([]);
      prisma.toolUsageLog.count.mockResolvedValue(0);
      const svc = buildService(prisma);

      await svc.listToolHistory('user1', 2, 5);
      expect(prisma.toolUsageLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 5, take: 5 }),
      );
    });
  });

  describe('listUserGroups', () => {
    it('仅返回当前用户作为成员的小组；带 topics 计算 topic_count', async () => {
      const prisma = buildPrismaMock();
      const joinedAt = new Date('2026-01-15T03:00:00.000Z');
      const lastTopicAt = new Date('2026-06-20T07:00:00.000Z');
      prisma.groupMember.findMany.mockResolvedValue([
        {
          group_id: BigInt(10),
          role: 'MEMBER',
          joined_at: joinedAt,
          group: {
            id: BigInt(10),
            name: '祠堂修缮组',
            description: '讨论老祠堂修缮',
            cover_url: 'https://example.com/cover.jpg',
            is_public: true,
            created_at: new Date('2025-01-01T00:00:00.000Z'),
            topics: [
              { id: BigInt(100), updated_at: lastTopicAt },
              { id: BigInt(99), updated_at: new Date('2026-01-01T00:00:00.000Z') },
            ],
          },
        },
      ]);

      const svc = buildService(prisma);
      const out = await svc.listUserGroups('user1');

      expect(prisma.groupMember.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { user_id: 'user1', group: { deleted_at: null } },
        }),
      );

      expect(out.data).toHaveLength(1);
      expect(out.data[0]).toMatchObject({
        id: '10',
        name: '祠堂修缮组',
        role: 'MEMBER',
        topic_count: 2,
      });
      expect(out.data[0].last_active_at).toBe(lastTopicAt.toISOString());
    });

    it('没有加入任何小组 → data 为空（不补造示例小组）', async () => {
      const prisma = buildPrismaMock();
      prisma.groupMember.findMany.mockResolvedValue([]);
      const svc = buildService(prisma);

      const out = await svc.listUserGroups('loner');
      expect(out.data).toEqual([]);
    });

    it('过滤已删除的小组（group.deleted_at !== null 不应被 findMany 返回）', async () => {
      // 由 where 子句本身保证：group: { deleted_at: null }
      const prisma = buildPrismaMock();
      prisma.groupMember.findMany.mockResolvedValue([]);
      const svc = buildService(prisma);
      await svc.listUserGroups('user1');
      const whereArg = prisma.groupMember.findMany.mock.calls[0][0].where;
      expect(whereArg.group.deleted_at).toBeNull();
    });
  });

  describe('listUserVideos', () => {
    it('按 requester_id 过滤、不补造 video_url/duration/状态', async () => {
      const prisma = buildPrismaMock();
      prisma.videoProject.findMany.mockResolvedValue([
        {
          id: BigInt(100),
          requester_id: 'user1',
          status: 'QUEUED',
          queue_position: 3,
          priority: 1,
          style: 'classic',
          video_url: null,
          duration_seconds: null,
          error_message: null,
          created_at: new Date('2026-06-23T10:00:00.000Z'),
          completed_at: null,
          target_person: {
            id: BigInt(50),
            full_name: '祖父',
            gender: 'MALE',
            birth_date: new Date('1920-05-01T00:00:00.000Z'),
            death_date: new Date('1990-12-01T00:00:00.000Z'),
          },
          materials: [{ media_id: BigInt(7) }, { media_id: BigInt(8) }],
        },
      ]);
      prisma.videoProject.count.mockResolvedValue(1);

      const svc = buildService(prisma);
      const out = await svc.listUserVideos('user1', 1, 20);

      expect(prisma.videoProject.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { requester_id: 'user1' },
        }),
      );

      expect(out.data).toHaveLength(1);
      expect(out.data[0].status).toBe('QUEUED');
      expect(out.data[0].video_url).toBeNull();
      expect(out.data[0].duration_seconds).toBeNull();
      expect(out.data[0].material_count).toBe(2);
      expect(out.data[0].target_person?.full_name).toBe('祖父');
    });

    it('FAILED 状态的 video 返回真实 error_message（不掩盖）', async () => {
      const prisma = buildPrismaMock();
      prisma.videoProject.findMany.mockResolvedValue([
        {
          id: BigInt(101),
          requester_id: 'user1',
          status: 'FAILED',
          queue_position: null,
          priority: 1,
          style: 'cinematic',
          video_url: null,
          duration_seconds: null,
          error_message: 'provider timeout',
          created_at: new Date('2026-06-22T10:00:00.000Z'),
          completed_at: new Date('2026-06-22T10:30:00.000Z'),
          target_person: null,
          materials: [],
        },
      ]);
      prisma.videoProject.count.mockResolvedValue(1);

      const svc = buildService(prisma);
      const out = await svc.listUserVideos('user1', 1, 20);

      expect(out.data[0].error_message).toBe('provider timeout');
      expect(out.data[0].status).toBe('FAILED');
    });
  });
});