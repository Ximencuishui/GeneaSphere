/**
 * 通用 API 响应类型
 *
 * 后端 controller 返回统一格式：分页列表为 `{ data, pagination }`，详情为对象本身。
 * 通过此模块统一泛型与 axios 包装，前端可在不写 `as` 断言的情况下获得正确的类型。
 */
import type { AxiosResponse } from 'axios'

/**
 * 统一错误响应体（与后端 GlobalHttpExceptionFilter 保持一致）。
 *
 * 注意：Axios 在 v1 中已支持类型化 `response.data`，前端可在 catch 中通过
 * `err.response?.data as ApiErrorBody` 精确访问 `code` / `status` / `details`。
 */
export interface ApiErrorBody {
  status: number
  code: string
  message: string
  path?: string
  timestamp?: string
  details?: unknown
}

/** 分页响应 */
export interface PagedResult<T> {
  data: T[]
  pagination: {
    page: number
    page_size: number
    total: number
    total_pages: number
  }
}

/** 简单分页请求参数 */
export interface PagedQuery {
  page?: number
  pageSize?: number
  [key: string]: unknown
}

/**
 * 适配器：从 axios 响应中提取 data 字段。
 *
 * 用法：
 *   const res = await api.get<PagedResult<MyItem>>('/items')
 *   const items = unwrap(res)         // -> PagedResult<MyItem>
 *   const list = unwrapData(res)      // -> MyItem[]
 */
export function unwrap<T>(response: AxiosResponse<T>): T {
  return response.data
}

export function unwrapData<T>(response: AxiosResponse<PagedResult<T>>): T[] {
  return response.data.data
}

export function unwrapPagination<T>(
  response: AxiosResponse<PagedResult<T>>,
) {
  return response.data.pagination
}

/**
 * 类型守卫：判断是否为分页结构（用于不确定后端返回类型的场景）。
 */
export function isPagedResult<T>(
  value: unknown,
): value is PagedResult<T> {
  return (
    typeof value === 'object' &&
    value !== null &&
    Array.isArray((value as { data?: unknown }).data) &&
    typeof (value as { pagination?: unknown }).pagination === 'object'
  )
}
