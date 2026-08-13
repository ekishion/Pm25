<script setup>
defineProps({
  foot: { type: String, default: '' },
  footVisible: { type: Boolean, default: false },
  coords: { type: String, default: '' },
  coordsVisible: { type: Boolean, default: false },
})
</script>

<template>
  <footer class="bottom-zone">
    <p class="foot" :class="{ show: footVisible }">{{ foot }}</p>
    <p class="pub-coords" :class="{ show: coordsVisible }" aria-hidden="true">{{ coords }}</p>
  </footer>
</template>

<style scoped>
.bottom-zone { position: relative; z-index: 2; display: grid; place-items: center; gap: 4px; min-height: 2.6em; padding-top: 4px; text-align: center; }
.foot { margin: 0; max-width: min(92vw, 420px); font-family: var(--font-editorial); font-size: 0.82rem; font-style: italic; letter-spacing: 0.1em; color: var(--text-faint); opacity: 0; transform: translateY(4px); transition: opacity 0.7s ease, transform 0.7s ease; line-height: 1.35; }
.foot.show { opacity: 1; transform: none; }
.pub-coords { margin: 0; font-family: var(--mono); font-size: 0.58rem; font-weight: 500; letter-spacing: 0.16em; text-transform: uppercase; color: var(--ink-faint); opacity: 0; transition: opacity 0.7s ease; }
.pub-coords.show { opacity: 1; }

@media (prefers-reduced-motion: reduce) {
  .bottom-zone, .foot, .pub-coords { transition: none !important; animation: none !important; }
  .foot { opacity: 1; transform: none; }
}
</style>
