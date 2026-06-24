import axios, { type AxiosResponse } from 'axios';
import { ElMessage } from 'element-plus';
import router from '@/router';
import type { ApiErrorBody } from '@/types/api';

export type { ApiErrorBody };

// Create axios instance
const request = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/',
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor
request.interceptors.request.use(
  (config) => {
    // Get token from localStorage
    const token = localStorage.getItem('geneasphere_token') || localStorage.getItem('access_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  },
);

// 状态码 → 友好提示映射
const STATUS_MESSAGE: Record<number, string> = {
  400: '请求参数有误',
  401: '登录已过期，请重新登录',
  403: '没有权限访问此资源',
  404: '请求的资源不存在',
  409: '资源冲突，操作未完成',
  422: '提交的数据无法处理',
  429: '请求过于频繁，请稍后再试',
  500: '服务器内部错误',
  502: '网关错误',
  503: '服务暂不可用',
  504: '网关超时',
};

// 业务 code → 友好提示映射（覆盖后端高频业务错误）
const CODE_MESSAGE: Record<string, string> = {
  UNAUTHORIZED: '登录已过期，请重新登录',
  FORBIDDEN: '没有权限访问此资源',
  NOT_FOUND: '请求的资源不存在',
  BAD_REQUEST: '请求参数有误',
  TOO_MANY_REQUESTS: '请求过于频繁，请稍后再试',
};

// Response interceptor
// 通过显式声明 <T> 泛型，让 axios.get<T>(...) 推断的返回类型是 T 而非 AxiosResponse<T>。
request.interceptors.response.use(
  <T,>(response: AxiosResponse<T>) => {
    return response.data;
  },
  (error) => {
    if (error.response) {
      const { status, data } = error.response as { status: number; data: ApiErrorBody | string };
      // 兼容后端统一错误格式与旧格式（直接返回字符串）
      const body: ApiErrorBody | null =
        typeof data === 'object' && data !== null && 'code' in data
          ? (data as ApiErrorBody)
          : null;
      const message = body?.message || (typeof data === 'string' ? data : '') || '';

      // 401 强制登出（无论后端格式如何）
      if (status === 401) {
        ElMessage.error(message || STATUS_MESSAGE[401]);
        localStorage.removeItem('geneasphere_token');
        localStorage.removeItem('access_token');
        localStorage.removeItem('geneasphere_platform_token');
        // 仅在非登录页时跳转，避免覆盖用户当前页
        if (router.currentRoute.value.path !== '/login' &&
            router.currentRoute.value.path !== '/platform-admin/login') {
          // 平台端跳平台登录，其他跳普通登录
          const target = router.currentRoute.value.path.startsWith('/platform-admin')
            ? '/platform-admin/login'
            : '/login';
          router.push(target);
        }
        return Promise.reject(new Error(message || 'UNAUTHORIZED'));
      }

      // 优先用后端业务 code 映射，再降级到 HTTP 状态映射
      const friendly = (body && CODE_MESSAGE[body.code]) || STATUS_MESSAGE[status] || message;
      if (friendly && friendly !== message) {
        ElMessage.error(friendly);
      } else if (message) {
        ElMessage.error(message);
      } else {
        ElMessage.error(STATUS_MESSAGE[status] || '请求失败');
      }

      // 把统一错误对象透传给业务代码，便于 try/catch 精确处理
      if (body) {
        return Promise.reject(Object.assign(new Error(body.message), body));
      }
      return Promise.reject(new Error(message || `HTTP ${status}`));
    }
    ElMessage.error('网络错误，请检查网络连接');
    return Promise.reject(error);
  },
);

export default request;
