/**
 * 在首个用户手势时解锁 AudioContext（iOS Safari 友好）
 */

import { onMounted, onUnmounted } from 'vue'
import { unlockAudio } from '../services/audio'

/**
 * @param {{ enabled?: boolean }} [opts]
 */
export function useAudioGesture(opts = {}) {
  let installed = false

  async function onGesture() {
    try {
      await unlockAudio()
    } catch {
      /* ignore */
    }
    teardown()
  }

  function teardown() {
    if (!installed || typeof window === 'undefined') return
    window.removeEventListener('pointerdown', onGesture, true)
    window.removeEventListener('touchstart', onGesture, true)
    window.removeEventListener('keydown', onGesture, true)
    installed = false
  }

  function install() {
    if (installed || typeof window === 'undefined') return
    if (opts.enabled === false) return
    // capture：尽早拿到手势，避免被后续 async 拖出 user-gesture 窗口
    window.addEventListener('pointerdown', onGesture, { capture: true, passive: true })
    window.addEventListener('touchstart', onGesture, { capture: true, passive: true })
    window.addEventListener('keydown', onGesture, { capture: true })
    installed = true
  }

  onMounted(install)
  onUnmounted(teardown)

  return { install, teardown }
}
