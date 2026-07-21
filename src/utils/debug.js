/**
 * 仅开发环境可观测
 */

export function isDev() {
  return Boolean(import.meta.env?.DEV)
}

export function devLog(...args) {
  if (!isDev()) return
  console.info('[match]', ...args)
}

export function createDevProbe() {
  if (!isDev()) {
    return {
      note() {},
      snapshot() {
        return null
      },
    }
  }
  const notes = []
  return {
    note(msg, extra) {
      const row = { t: Date.now(), msg, extra }
      notes.push(row)
      if (notes.length > 30) notes.shift()
      devLog(msg, extra ?? '')
    },
    snapshot() {
      return notes.slice()
    },
  }
}
