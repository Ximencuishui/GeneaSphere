import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { PrismaService } from '@geneasphere/db';

export const SETTING_KEYS = {
  PRICING: 'pricing',
  CLAN_DEFAULTS: 'clan_defaults',
  FEATURE_SWITCHES: 'feature_switches',
} as const;

const DEFAULTS: Record<string, { value: any; description: string }> = {
  pricing: {
    value: {
      sms_unit_price: 0.05,
      ai_tool_pricing: { restore: 1, animate: 3, colorize: 2, denoise: 2 },
      free_quota: 10,
      print_base_prices: { basic: 199, premium: 399, deluxe: 699 },
    },
    description: '短信单价 / AI 工具定价 / 免费额度 / 印刷基价',
  },
  clan_defaults: {
    value: {
      daily_sms_limit: 50,
      member_monthly_receive_limit: 200,
      default_visitor_visibility: 'limited',
    },
    description: '新家族默认配置：每日短信上限 / 成员月接收上限 / 游客可见范围',
  },
  feature_switches: {
    value: {
      registration_review_enabled: true,
      sms_enabled: true,
      ai_tools_enabled: true,
    },
    description: '全局开关：注册审核 / 短信功能 / AI 工具',
  },
};

@Injectable()
export class SettingsService implements OnModuleInit {
  private readonly logger = new Logger(SettingsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    for (const [key, cfg] of Object.entries(DEFAULTS)) {
      const existing = await this.prisma.globalSetting.findUnique({
        where: { setting_key: key },
      });
      if (!existing) {
        await this.prisma.globalSetting.create({
          data: {
            setting_key: key,
            setting_value: cfg.value as any,
            description: cfg.description,
          },
        });
        this.logger.log(`初始化默认配置: ${key}`);
      }
    }
  }

  async get(key: string): Promise<any> {
    const row = await this.prisma.globalSetting.findUnique({
      where: { setting_key: key },
    });
    return row ? row.setting_value : DEFAULTS[key]?.value ?? null;
  }

  async set(key: string, value: any, description?: string): Promise<void> {
    await this.prisma.globalSetting.upsert({
      where: { setting_key: key },
      create: {
        setting_key: key,
        setting_value: value as any,
        description: description ?? DEFAULTS[key]?.description,
      },
      update: { setting_value: value as any, description },
    });
  }
}
