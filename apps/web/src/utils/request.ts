import axios from 'axios';
import { ElMessage } from 'element-plus';
import router from '@/router';

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

// Response interceptor
request.interceptors.response.use(
  (response) => {
    return response.data;
  },
  (error) => {
    if (error.response) {
      const { status, data } = error.response;

      switch (status) {
        case 401:
          ElMessage.error('登录已过期，请重新登录');
          localStorage.removeItem('geneasphere_token');
          localStorage.removeItem('access_token');
          router.push('/login');
          break;
        case 403:
          ElMessage.error('没有权限访问此资源');
          break;
        case 404:
          ElMessage.error('请求的资源不存在');
          break;
        case 500:
          ElMessage.error('服务器内部错误');
          break;
        default:
          ElMessage.error(data.message || '请求失败');
      }
    } else {
      ElMessage.error('网络错误，请检查网络连接');
    }

    return Promise.reject(error);
  },
);

export default request;
