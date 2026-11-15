import { computed, type MaybeRefOrGetter, onScopeDispose, ref, toValue } from 'vue'

/**
 * Seconds left until `deadline` (epoch ms), updated every second.
 * Reaches 0 and stays there; 0 as well when there is no deadline.
 */
export function useCountdown(deadline: MaybeRefOrGetter<number | null | undefined>) {
  const now = ref(Date.now())
  const timer = setInterval(() => {
    now.value = Date.now()
  }, 1000)
  onScopeDispose(() => clearInterval(timer))

  const remainingSeconds = computed(() => {
    const target = toValue(deadline)
    if (!target) return 0
    return Math.max(0, Math.ceil((target - now.value) / 1000))
  })

  /** e.g. 4:05 */
  const formatted = computed(() => {
    const minutes = Math.floor(remainingSeconds.value / 60)
    const seconds = remainingSeconds.value % 60
    return `${minutes}:${String(seconds).padStart(2, '0')}`
  })

  return { remainingSeconds, formatted }
}
