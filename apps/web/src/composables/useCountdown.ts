import { ref, computed, onUnmounted, watch } from 'vue'

/**
 * 通用倒计时 composable
 * @param expireAt 结束时间（Date 或 ISO 字符串）
 * @param onExpire 倒计时归零时回调
 */
export function useCountdown(expireAt: Date | string | undefined | null, onExpire?: () => void) {
  const remaining = ref(0)
  const expired = computed(() => remaining.value <= 0)
  let timer: ReturnType<typeof setInterval> | null = null

  const getTargetMs = () => {
    if (!expireAt) return 0
    const t = typeof expireAt === 'string' ? new Date(expireAt).getTime() : expireAt.getTime()
    return t
  }

  const tick = () => {
    const target = getTargetMs()
    if (!target) {
      remaining.value = 0
      return
    }
    const diff = Math.max(0, Math.floor((target - Date.now()) / 1000))
    remaining.value = diff
    if (diff <= 0) {
      stop()
      onExpire?.()
    }
  }

  const start = () => {
    stop()
    tick()
    timer = setInterval(tick, 1000)
  }

  const stop = () => {
    if (timer) {
      clearInterval(timer)
      timer = null
    }
  }

  watch(
    () => expireAt,
    () => start(),
    { immediate: true },
  )

  onUnmounted(stop)

  const formatted = computed(() => {
    const s = remaining.value
    const mm = Math.floor(s / 60).toString().padStart(2, '0')
    const ss = (s % 60).toString().padStart(2, '0')
    return `${mm}:${ss}`
  })

  const percent = computed(() => {
    const target = getTargetMs()
    if (!target) return 0
    const total = 30 * 60 // 默认 30 分钟作为全长
    return Math.max(0, Math.min(100, Math.round((remaining.value / total) * 100)))
  })

  return { remaining, expired, formatted, percent, restart: start, stop }
}
