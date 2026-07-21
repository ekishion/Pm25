/**
 * 隐私模式：不在 UI / 分享卡中暴露地理位置等可识别信息
 * 偏好存 localStorage；数据请求仍用 IP 定位（服务端），仅隐藏展示
 */

import { computed, ref } from 'vue'

const STORAGE_KEY = 'pm25-privacy'

function readPref() {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

/**
 * @returns {{
 *   privacyOn: import('vue').Ref<boolean>,
 *   privacyOnComputed: import('vue').ComputedRef<boolean>,
 *   loadPrivacyPreference: () => boolean,
 *   setPrivacyOn: (next: boolean) => boolean,
 *   togglePrivacy: () => boolean,
 * }}
 */
export function usePrivacy() {
  const privacyOn = ref(false)

  function loadPrivacyPreference() {
    privacyOn.value = readPref()
    return privacyOn.value
  }

  function setPrivacyOn(next) {
    privacyOn.value = Boolean(next)
    try {
      localStorage.setItem(STORAGE_KEY, privacyOn.value ? '1' : '0')
    } catch {
      /* ignore */
    }
    return privacyOn.value
  }

  function togglePrivacy() {
    return setPrivacyOn(!privacyOn.value)
  }

  return {
    privacyOn,
    privacyOnComputed: computed(() => privacyOn.value),
    loadPrivacyPreference,
    setPrivacyOn,
    togglePrivacy,
  }
}
