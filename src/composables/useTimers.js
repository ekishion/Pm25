/**
 * 统一管理 setTimeout / setInterval，卸载时一并清理
 */

import { onUnmounted } from 'vue'

export function useTimers() {
  /** @type {Map<string, ReturnType<typeof setTimeout>>} */
  const timeouts = new Map()
  /** @type {Map<string, ReturnType<typeof setInterval>>} */
  const intervals = new Map()

  function clearTimeoutKey(key) {
    const id = timeouts.get(key)
    if (id != null) {
      window.clearTimeout(id)
      timeouts.delete(key)
    }
  }

  function clearIntervalKey(key) {
    const id = intervals.get(key)
    if (id != null) {
      window.clearInterval(id)
      intervals.delete(key)
    }
  }

  /**
   * @param {string} key
   * @param {() => void} fn
   * @param {number} ms
   */
  function set(key, fn, ms) {
    clearTimeoutKey(key)
    const id = window.setTimeout(() => {
      timeouts.delete(key)
      fn()
    }, ms)
    timeouts.set(key, id)
    return id
  }

  /**
   * @param {string} key
   * @param {() => void} fn
   * @param {number} ms
   */
  function interval(key, fn, ms) {
    clearIntervalKey(key)
    const id = window.setInterval(fn, ms)
    intervals.set(key, id)
    return id
  }

  function clearAll() {
    timeouts.forEach((id) => window.clearTimeout(id))
    intervals.forEach((id) => window.clearInterval(id))
    timeouts.clear()
    intervals.clear()
  }

  onUnmounted(clearAll)

  return {
    set,
    interval,
    clear: clearTimeoutKey,
    clearInterval: clearIntervalKey,
    clearAll,
  }
}
