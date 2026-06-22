import { Injectable, BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '@geneasphere/db';
import { MemoryQuizStatus } from '@prisma/client';

@Injectable()
export class MemoryService {
  constructor(private prisma: PrismaService) {}

  // ==================== 题库 ====================

  /**
   * 获取随机3题（用于用户验证）
   */
  async getRandomQuizzes(location: string, decade?: number, excludeUserId?: string) {
    const where: any = {
      location: { contains: location, mode: 'insensitive' },
      status: MemoryQuizStatus.VERIFIED,
    };
    if (decade) {
      where.decade = decade;
    }
    if (excludeUserId) {
      where.creator_id = { not: excludeUserId };
    }

    const quizzes = await this.prisma.localMemoryQuiz.findMany({
      where,
      select: {
        id: true,
        location: true,
        decade: true,
        question: true,
        tags: true,
      },
      take: 50,
    });

    // Shuffle and pick 3
    const shuffled = quizzes.sort(() => 0.5 - Math.random());
    return shuffled.slice(0, 3);
  }

  /**
   * 提交验证答案
   */
  async submitQuizAnswers(
    userId: string,
    location: string,
    decade: number,
    answers: { quizId: number; answer: string }[],
  ) {
    if (answers.length < 3) {
      throw new BadRequestException('需要回答3道题目');
    }

    let correctCount = 0;
    const results: { quizId: number; correct: boolean; correctAnswer: string }[] = [];

    for (const ans of answers) {
      const quiz = await this.prisma.localMemoryQuiz.findUnique({
        where: { id: ans.quizId },
        select: { id: true, answer: true },
      });

      if (!quiz || !quiz.answer) {
        results.push({ quizId: ans.quizId, correct: false, correctAnswer: quiz?.answer || '' });
        continue;
      }

      const isCorrect = quiz.answer.trim().toLowerCase() === ans.answer.trim().toLowerCase();
      if (isCorrect) correctCount++;
      results.push({ quizId: ans.quizId, correct: isCorrect, correctAnswer: quiz.answer });
    }

    const passed = correctCount >= 2;

    // Record verified location
    if (passed) {
      await this.prisma.userVerifiedLocation.upsert({
        where: {
          user_id_location_decade: {
            user_id: userId,
            location,
            decade,
          },
        },
        update: { verified_at: new Date() },
        create: {
          user_id: userId,
          location,
          decade,
        },
      });

      // Check badge: 寻根引路人
      await this.checkAndAwardBadge(userId, '寻根引路人');
    }

    return {
      passed,
      correctCount,
      totalCount: answers.length,
      results,
    };
  }

  /**
   * 创建题目
   */
  async createQuiz(userId: string, data: {
    location: string;
    region?: string;
    decade: number;
    question: string;
    tags?: string;
  }) {
    const quiz = await this.prisma.localMemoryQuiz.create({
      data: {
        location: data.location,
        region: data.region,
        decade: data.decade,
        question: data.question,
        tags: data.tags,
        creator_id: userId,
        status: MemoryQuizStatus.PENDING,
      },
    });

    return quiz;
  }

  /**
   * 提交答案
   */
  async createAnswer(userId: string, quizId: number, content: string) {
    const quiz = await this.prisma.localMemoryQuiz.findUnique({
      where: { id: quizId },
      select: { id: true, status: true },
    });

    if (!quiz) throw new NotFoundException('题目不存在');
    if (quiz.status !== MemoryQuizStatus.VERIFIED) {
      throw new BadRequestException('该题目尚未审核通过');
    }

    const answer = await this.prisma.localMemoryAnswer.create({
      data: {
        quiz_id: quizId,
        user_id: userId,
        content,
      },
    });

    return answer;
  }

  /**
   * "我证实" - 为答案投票
   */
  async endorseAnswer(userId: string, answerId: number) {
    const answer = await this.prisma.localMemoryAnswer.findUnique({
      where: { id: answerId },
      include: { quiz: { select: { id: true, location: true, status: true } } },
    });

    if (!answer) throw new NotFoundException('答案不存在');
    if (answer.quiz.status !== MemoryQuizStatus.VERIFIED) {
      throw new BadRequestException('关联题目尚未审核通过');
    }

    const updated = await this.prisma.localMemoryAnswer.update({
      where: { id: answerId },
      data: { endorsements: { increment: 1 } },
    });

    // Auto-verify if endorsements >= 5
    if (updated.endorsements >= 5 && !updated.is_verified) {
      await this.prisma.localMemoryAnswer.update({
        where: { id: answerId },
        data: { is_verified: true },
      });

      // Set as standard answer for the quiz if not set
      const quiz = await this.prisma.localMemoryQuiz.findUnique({
        where: { id: answer.quiz_id },
      });
      if (quiz && !quiz.answer) {
        await this.prisma.localMemoryQuiz.update({
          where: { id: answer.quiz_id },
          data: { answer: updated.content },
        });
      }

      // Award badge to answer creator
      await this.checkAndAwardBadge(answer.user_id, '地方记忆守护者', answer.quiz.location);
    }

    return { endorsements: updated.endorsements, isVerified: updated.endorsements >= 5 };
  }

  // ==================== 留言墙 ====================

  /**
   * 获取地方记忆留言墙数据
   */
  async getMemoryWall(location: string, decade?: number, page = 1, pageSize = 20) {
    const where: any = {
      location: { contains: location, mode: 'insensitive' },
      status: MemoryQuizStatus.VERIFIED,
    };
    if (decade) where.decade = decade;

    const [quizzes, total] = await Promise.all([
      this.prisma.localMemoryQuiz.findMany({
        where,
        select: {
          id: true,
          location: true,
          region: true,
          decade: true,
          question: true,
          tags: true,
          created_at: true,
          creator: { select: { id: true, nickname: true } },
          answers: {
            select: {
              id: true,
              content: true,
              endorsements: true,
              is_verified: true,
              created_at: true,
              user: { select: { id: true, nickname: true } },
            },
            orderBy: { endorsements: 'desc' },
            take: 5,
          },
        },
        orderBy: { created_at: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.localMemoryQuiz.count({ where }),
    ]);

    return { quizzes, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  }

  // ==================== 徽章 ====================

  /**
   * 获取用户徽章
   */
  async getUserBadges(userId: string) {
    return this.prisma.memoryBadge.findMany({
      where: { user_id: userId },
      orderBy: { awarded_at: 'desc' },
    });
  }

  /**
   * 获取用户已验证的地区
   */
  async getUserVerifiedLocations(userId: string) {
    return this.prisma.userVerifiedLocation.findMany({
      where: { user_id: userId },
      orderBy: { verified_at: 'desc' },
    });
  }

  /**
   * 检查并颁发徽章
   */
  private async checkAndAwardBadge(userId: string, badgeType: string, location?: string) {
    const existing = await this.prisma.memoryBadge.findFirst({
      where: { user_id: userId, badge_type: badgeType },
    });
    if (existing) return;

    let shouldAward = false;
    let description = '';

    switch (badgeType) {
      case '地方记忆守护者': {
        const count = await this.prisma.localMemoryAnswer.count({
          where: { user_id: userId, is_verified: true },
        });
        if (count >= 1) {
          shouldAward = true;
          description = location ? `在 ${location} 的记忆被证实` : '记忆被社区证实';
        }
        break;
      }
      case '姓氏源头探索者': {
        const count = await this.prisma.localMemoryQuiz.count({
          where: { creator_id: userId },
        });
        if (count >= 5) {
          shouldAward = true;
          description = '创建了 5 个不同地点的记忆题目';
        }
        break;
      }
      case '寻根引路人': {
        const locCount = await this.prisma.userVerifiedLocation.count({
          where: { user_id: userId },
        });
        if (locCount >= 3) {
          shouldAward = true;
          description = '成功验证了 3 个地区的记忆';
        }
        break;
      }
    }

    if (shouldAward) {
      await this.prisma.memoryBadge.create({
        data: {
          user_id: userId,
          badge_type: badgeType,
          location,
          description,
        },
      });
    }
  }

  // ==================== 管理后台 ====================

  /**
   * 获取待审核题目
   */
  async getPendingQuizzes(page = 1, pageSize = 20) {
    const [quizzes, total] = await Promise.all([
      this.prisma.localMemoryQuiz.findMany({
        where: { status: MemoryQuizStatus.PENDING },
        include: {
          creator: { select: { id: true, nickname: true, phone: true } },
        },
        orderBy: { created_at: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.localMemoryQuiz.count({ where: { status: MemoryQuizStatus.PENDING } }),
    ]);

    return { quizzes, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  }

  /**
   * 审核题目
   */
  async reviewQuiz(quizId: number, status: MemoryQuizStatus, answer?: string) {
    const quiz = await this.prisma.localMemoryQuiz.findUnique({
      where: { id: quizId },
    });
    if (!quiz) throw new NotFoundException('题目不存在');

    const updateData: any = { status };
    if (answer) updateData.answer = answer;

    await this.prisma.localMemoryQuiz.update({
      where: { id: quizId },
      data: updateData,
    });

    // Award 姓氏源头探索者 badge
    if (status === MemoryQuizStatus.VERIFIED) {
      await this.checkAndAwardBadge(quiz.creator_id, '姓氏源头探索者');
    }

    return { success: true };
  }
}
