<template>
  <div
    ref="previewRef"
    class="flex flex-wrap"
    :class="[showDots ? 'gap-1 pt-3' : 'gap-2 pt-3.5 pb-0.5']"
  >
    <template v-if="showDots">
      <div
        v-for="node in nodesLatency"
        :key="node.name"
        class="size-3 cursor-pointer rounded-sm transition hover:scale-110"
        :class="getDotClass(node)"
        :style="getDotStyle(node)"
        ref="dotsRef"
        @mouseenter="(e) => makeTippy(e, node)"
        @click.stop="$emit('nodeclick', node.name)"
      />
    </template>
    <div
      v-else
      class="flex flex-1 items-center justify-center overflow-hidden rounded-2xl *:h-2"
    >
      <div
        :class="getBgColor(lowLatency - 1)"
        :style="{
          width: getPreviewWidth(latencyCounts.good),
        }"
      />
      <div
        :class="getBgColor(mediumLatency - 1)"
        :style="{
          width: getPreviewWidth(latencyCounts.medium),
        }"
      />
      <div
        :class="getBgColor(mediumLatency + 1)"
        :style="{
          width: getPreviewWidth(latencyCounts.bad),
        }"
      />
      <div
        :class="getBgColor(NOT_CONNECTED)"
        :style="{
          width: getPreviewWidth(latencyCounts.notConnected),
        }"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { NOT_CONNECTED, PROXY_PREVIEW_TYPE } from '@/constant'
import { getColorForLatency } from '@/helper'
import { useTooltip } from '@/composables/use-tooltip'
import { latencyMapOf } from '@/assembly/proxies'
import { lowLatency, mediumLatency, proxyPreviewType } from '@/store/settings'
import { useElementSize } from '@vueuse/core'
import { computed, ref } from 'vue'

const props = defineProps<{
  nodes: string[]
  now?: string
  groupName?: string
}>()

const { showTip } = useTooltip()
const previewRef = ref<HTMLElement | null>(null)
const { width } = useElementSize(previewRef)

const widthEnough = computed(() => {
  return width.value > 16 * props.nodes.length
})

const makeTippy = (e: Event, node: { name: string; latency: number }) => {
  const tag = document.createElement('div')
  const name = document.createElement('div')

  name.textContent = node.name
  tag.append(name)

  if (node.latency !== NOT_CONNECTED) {
    const latency = document.createElement('div')

    latency.textContent = `${node.latency}ms`
    latency.classList.add(getColorForLatency(node.latency))
    tag.append(latency)
  }

  tag.classList.add('flex', 'items-center', 'gap-2')
  showTip(e, tag)
}

const getPreviewWidth = (count: number) => {
  if (!props.nodes.length) {
    return '0%'
  }

  return `${(count * 100) / props.nodes.length}%`
}

const showDots = computed(() => {
  return (
    proxyPreviewType.value === PROXY_PREVIEW_TYPE.DOTS ||
    (proxyPreviewType.value === PROXY_PREVIEW_TYPE.AUTO && widthEnough.value)
  )
})

const latencyMap = latencyMapOf(() => props.groupName)
const latencyList = computed(() =>
  props.nodes.map((name) => latencyMap.value.get(name) ?? NOT_CONNECTED),
)

const nodesLatency = computed(() => {
  if (!showDots.value) {
    return []
  }

  return props.nodes.map((name, index) => ({ name, latency: latencyList.value[index] }))
})
const getDotClass = (node: { name: string; latency: number }) => {
  const isCurrent = props.now === node.name
  const isAvailable = node.latency !== NOT_CONNECTED

  if (isCurrent) {
    return isAvailable ? 'bg-low-latency active-dot-green' : 'active-dot-red'
  }

  return isAvailable ? '' : 'bg-base-content/60'
}

const getDotStyle = (node: { name: string; latency: number }) => {
  const isCurrent = props.now === node.name
  const isAvailable = node.latency !== NOT_CONNECTED

  // 当前使用中且不可用：正红色，饱满醒目
  if (isCurrent && !isAvailable) {
    return { backgroundColor: '#FF0000' }
  }

  // 可用节点：淡雅天蓝色 #ACD6FF
  if (!isCurrent && isAvailable) {
    return { backgroundColor: '#ACD6FF' }
  }

  return {}
}

const getBgColor = (latency: number) => {
  if (latency === NOT_CONNECTED) {
    return 'bg-base-content/60'
  } else if (latency < lowLatency.value) {
    return 'bg-low-latency'
  } else if (latency < mediumLatency.value) {
    return 'bg-medium-latency'
  } else {
    return 'bg-high-latency'
  }
}

const latencyCounts = computed(() => {
  const counts = { good: 0, medium: 0, bad: 0, notConnected: 0 }

  for (const latency of latencyList.value) {
    if (latency === NOT_CONNECTED) {
      counts.notConnected++
    } else if (latency < lowLatency.value) {
      counts.good++
    } else if (latency < mediumLatency.value) {
      counts.medium++
    } else {
      counts.bad++
    }
  }

  return counts
})
</script>

<style scoped>
.tooltip:before {
  left: 0;
  transform: translateX(-10px);
}

/* 激活且可用的绿色节点：雷达呼吸微光光晕 (加速2x) */
.active-dot-green {
  position: relative;
  z-index: 2;
  animation: radarGreen 1.1s infinite cubic-bezier(0.4, 0, 0.2, 1);
}

@keyframes radarGreen {
  0% {
    box-shadow:
      0 0 0 0 rgba(34, 197, 94, 0.85),
      0 0 6px rgba(34, 197, 94, 0.5);
    transform: scale(1);
  }
  50% {
    box-shadow:
      0 0 0 5px rgba(34, 197, 94, 0),
      0 0 10px rgba(34, 197, 94, 0.2);
    transform: scale(1.1);
  }
  100% {
    box-shadow:
      0 0 0 0 rgba(34, 197, 94, 0),
      0 0 0 rgba(34, 197, 94, 0);
    transform: scale(1);
  }
}

/* 激活但不可用的红色节点：急促告警心跳光晕 (加速2x) */
.active-dot-red {
  position: relative;
  z-index: 2;
  animation: alertRed 0.6s infinite ease-out;
}

@keyframes alertRed {
  0% {
    box-shadow:
      0 0 0 0 rgba(255, 0, 0, 0.9),
      0 0 8px rgba(255, 0, 0, 0.7);
    transform: scale(1);
  }
  50% {
    box-shadow:
      0 0 0 6px rgba(255, 0, 0, 0),
      0 0 12px rgba(255, 0, 0, 0.3);
    transform: scale(1.15);
  }
  100% {
    box-shadow:
      0 0 0 0 rgba(255, 0, 0, 0),
      0 0 0 rgba(255, 0, 0, 0);
    transform: scale(1);
  }
}

@media (prefers-reduced-motion: reduce) {
  .active-dot-green,
  .active-dot-red {
    animation: none;
    transform: scale(1.1);
  }
}
</style>
