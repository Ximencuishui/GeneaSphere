import request from '@/utils/request';

// 工具类型
export type ToolType =
  | 'restore'
  | 'color'
  | 'expand'
  | 'remove'
  | 'compose'
  | 'enhance'
  | 'animate';

// 工具信息
export interface ToolInfo {
  type: ToolType;
  name: string;
  description: string;
  creditsCost: number;
  icon: string;
}

// 额度信息
export interface CreditInfo {
  free_remaining: number;
  paid_balance: number;
  shared_balance: number;
  total: number;
}

// 次数包配置
export interface PackageConfig {
  type: string;
  size: number;
  price: number;
  label: string;
  pricePerUnit: number;
  validityYears: number;
}

// 购买请求
export interface PurchaseRequest {
  package_type: string;
  amount: number;
}

// 购买结果
export interface PurchaseResult {
  success: boolean;
  purchaseId?: number;
  packageSize?: number;
  expiresAt?: string;
  message?: string;
}

// 处理请求
export interface ProcessRequest {
  tool_type: ToolType;
  image_url: string;
  mask_url?: string;
  person_ids?: string;
}

// 处理结果
export interface ProcessResult {
  success: boolean;
  jobId?: string;
  outputUrl?: string;
  creditsUsed?: number;
  remainingCredits?: number;
  message?: string;
  needPurchase?: boolean;
  error?: string;
}

// 使用记录
export interface UsageLog {
  id: string;
  tool_type: ToolType;
  credits_used: number;
  estimated_cost: number;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  input_url?: string;
  output_url?: string;
  created_at: string;
  completed_at?: string;
}

// 家族共享包
export interface FamilyPackage {
  id: string;
  packageSize: number;
  usedCredits: number;
  remainingCredits: number;
  purchasedAt: string;
  expiresAt: string;
  isActive: boolean;
}

// 成员分配
export interface MemberAllocation {
  userId: string;
  allocatedCredits: number;
  usedCredits: number;
  remainingCredits: number;
  createdAt: string;
}

// 工具箱API
const toolboxApi = {
  // 获取额度信息
  getCredits: () => {
    return request.get<any, CreditInfo>('/api/toolbox/credits');
  },

  // 获取次数包列表
  getPackages: () => {
    return request.get<any, PackageConfig[]>('/api/toolbox/packages');
  },

  // 购买次数包
  purchase: (data: PurchaseRequest) => {
    return request.post<any, PurchaseResult>('/api/toolbox/purchase', data);
  },

  // 提交图片处理
  process: (data: ProcessRequest) => {
    return request.post<any, ProcessResult>('/api/toolbox/process', data);
  },

  // 获取使用历史
  getHistory: (limit = 20, offset = 0) => {
    return request.get<any, { logs: UsageLog[]; total: number }>(
      `/api/toolbox/history?limit=${limit}&offset=${offset}`,
    );
  },

  // 获取购买记录
  getPurchaseHistory: () => {
    return request.get<any, any[]>('/api/toolbox/purchase-history');
  },

  // 获取家族共享包列表
  getFamilyPackages: () => {
    return request.get<any, FamilyPackage[]>('/api/toolbox/family/packages');
  },

  // 分配共享次数
  allocateCredits: (data: {
    shared_credit_id: number;
    user_id: string;
    credits: number;
  }) => {
    return request.post<any, any>('/api/toolbox/family/allocate', data);
  },

  // 获取成员分配情况
  getMemberAllocations: (packageId: string) => {
    return request.get<any, MemberAllocation[]>(
      `/api/toolbox/family/members?package_id=${packageId}`,
    );
  },

  // 购买家族共享包
  purchaseFamilyShared: (data: PurchaseRequest) => {
    return request.post<any, PurchaseResult>(
      '/api/toolbox/family/purchase-shared',
      data,
    );
  },
};

// 工具定义
export const TOOLS: ToolInfo[] = [
  {
    type: 'restore',
    name: '老照片修复',
    description: '去噪、去划痕、去折痕、超分辨率',
    creditsCost: 1,
    icon: 'magic-stick',
  },
  {
    type: 'color',
    name: 'AI上色',
    description: '黑白照片智能上色',
    creditsCost: 1,
    icon: 'palette',
  },
  {
    type: 'expand',
    name: 'AI扩图',
    description: '扩展画面边界，补全缺失部分',
    creditsCost: 1,
    icon: 'full-screen',
  },
  {
    type: 'remove',
    name: 'AI去物',
    description: '擦除不需要的人物/物体，智能填充背景',
    creditsCost: 1,
    icon: 'delete',
  },
  {
    type: 'compose',
    name: 'AI拼图',
    description: '将多人从不同照片中抠出，合成一张合影',
    creditsCost: 1,
    icon: 'connection',
  },
  {
    type: 'enhance',
    name: 'AI增强',
    description: '自动调色、提亮面部、增强细节',
    creditsCost: 1,
    icon: 'zoom-in',
  },
  {
    type: 'animate',
    name: 'AI动态化',
    description: '让静态照片中的人物眨眼、微笑、转头',
    creditsCost: 3,
    icon: 'video-play',
  },
];

export default toolboxApi;
