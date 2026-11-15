import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { effectScope, ref } from 'vue'

import { useCountdown } from '@/composables/useCountdown'

describe('useCountdown', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-15T10:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('counts down every second, formats m:ss and stops at 0', () => {
    const scope = effectScope()
    const { remainingSeconds, formatted } = scope.run(() => useCountdown(Date.now() + 65_000))!

    expect(remainingSeconds.value).toBe(65)
    expect(formatted.value).toBe('1:05')

    vi.advanceTimersByTime(6_000)
    expect(formatted.value).toBe('0:59')

    vi.advanceTimersByTime(120_000)
    expect(remainingSeconds.value).toBe(0)
    expect(formatted.value).toBe('0:00')
    scope.stop()
  })

  it('follows a changing deadline and is 0 without one', () => {
    const scope = effectScope()
    const deadline = ref<number | null>(null)
    const { remainingSeconds } = scope.run(() => useCountdown(deadline))!

    expect(remainingSeconds.value).toBe(0)
    deadline.value = Date.now() + 30_000
    expect(remainingSeconds.value).toBe(30)
    scope.stop()
  })

  it('stops its timer when the scope is disposed', () => {
    const scope = effectScope()
    scope.run(() => useCountdown(Date.now() + 10_000))
    expect(vi.getTimerCount()).toBe(1)
    scope.stop()
    expect(vi.getTimerCount()).toBe(0)
  })
})
