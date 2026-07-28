/**
 * BigInt 序列化工具
 *
 * 背景：Prisma 把 Postgres 的 bigint 字段映射为 JS 的 BigInt 原生类型，
 * 而 JSON.stringify / Express res.json() 不支持 BigInt，会抛
 * "Do not know how to serialize a BigInt" 错误。
 *
 * 用法：在 service 方法返回前，把整个结果对象包一层 `serializeBigInt()`。
 *  - BigInt  → 字符串（保持数值精度，前端 Number 安全范围内可用 Number() 还原）
 *  - Date    → ISO 字符串（避免时区混淆）
 *  - null/undefined/基本类型 → 原样
 *  - 数组/对象 → 递归处理
 */
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | Date
  | bigint
  | JsonValue[]
  | { [key: string]: JsonValue };

export function serializeBigInt<T = unknown>(value: T): T {
  if (value === null || value === undefined) return value;
  if (typeof value === 'bigint') return value.toString() as unknown as T;
  if (value instanceof Date) return value.toISOString() as unknown as T;
  if (Array.isArray(value)) {
    return (value as unknown as JsonValue[]).map((v) =>
      serializeBigInt(v),
    ) as unknown as T;
  }
  if (typeof value === 'object') {
    const out: Record<string, JsonValue> = {};
    for (const [k, v] of Object.entries(value as Record<string, JsonValue>)) {
      out[k] = serializeBigInt(v);
    }
    return out as unknown as T;
  }
  return value;
}
