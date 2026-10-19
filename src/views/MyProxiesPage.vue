<template>
  <div
    class="max-md:scrollbar-hidden relative size-full overflow-y-auto p-3 md:p-4"
    :style="padding"
  >
    <!-- 顶部操作栏 -->
    <div
      class="bg-base-100 border-base-300 mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3 shadow-xs"
    >
      <div class="flex items-center gap-2">
        <h2 class="text-base-content text-base font-bold">策略组自定义分组</h2>
        <span class="badge badge-ghost badge-sm text-xs">
          共 {{ proxyGroupList.length }} 个策略组
        </span>
      </div>

      <div class="flex flex-wrap items-center gap-2">
        <!-- 搜索输入 -->
        <input
          v-model="searchKeyword"
          class="input input-bordered input-xs w-28 sm:w-36 md:w-44"
          placeholder="搜索策略组..."
        />

        <!-- 新建分类 -->
        <div class="flex items-center gap-1">
          <input
            v-model="newCategoryName"
            class="input input-bordered input-xs w-24 sm:w-32"
            placeholder="新分类名称"
            @keydown.enter="handleCreateCategory"
          />
          <button
            class="btn btn-primary btn-xs"
            :disabled="!newCategoryName.trim()"
            @click="handleCreateCategory"
          >
            <PlusIcon class="h-3.5 w-3.5" />
            新建分类
          </button>
        </div>

        <!-- 导入导出 -->
        <div class="flex items-center gap-1">
          <button
            class="btn btn-ghost btn-xs gap-1"
            title="导出策略组分组配置"
            @click="handleExport"
          >
            <ArrowUpTrayIcon class="h-3.5 w-3.5" />
            导出
          </button>
          <button
            class="btn btn-ghost btn-xs gap-1"
            title="从 JSON 文件导入策略组分组配置"
            @click="triggerImport"
          >
            <ArrowDownTrayIcon class="h-3.5 w-3.5" />
            导入
          </button>
          <input
            ref="fileInputRef"
            type="file"
            accept=".json,application/json"
            class="hidden"
            @change="handleFileSelected"
          />
        </div>

        <!-- 全部测速 -->
        <button
          class="btn btn-neutral btn-xs"
          :disabled="isTestingAllGroups || isLoading"
          @click="speedTestAllStrategyGroups"
        >
          <ArrowPathIcon
            class="h-3.5 w-3.5"
            :class="{ 'animate-spin': isTestingAllGroups }"
          />
          {{ isTestingAllGroups ? '测速中...' : '全部测速' }}
        </button>
      </div>
    </div>

    <!-- 首屏加载状态：防止直接刷新时后端数据未就绪产生渲染崩溃 -->
    <div
      v-if="isLoading"
      class="text-base-content/60 flex h-72 flex-col items-center justify-center gap-3"
    >
      <span class="loading loading-spinner loading-lg text-primary"></span>
      <span class="text-sm font-medium">正在拉取策略组数据...</span>
    </div>

    <!-- 数据就绪后渲染主内容 -->
    <template v-else>
      <!-- 自定义分类列表：外部 Draggable 支持分类本身上下拖拽排序 -->
      <Draggable
        v-model="myCustomStrategyGroups"
        item-key="id"
        handle=".category-drag-handle"
        :animation="150"
        ghost-class="opacity-40"
        class="flex flex-col gap-4"
      >
        <template #item="{ element: cat }">
          <div
            class="bg-base-100/70 border-base-300 rounded-xl border p-3 shadow-xs transition-all"
          >
            <!-- 分类头部：整行可点击切换折叠/展开 -->
            <div
              class="group/header hover:bg-base-200/50 -m-1 flex cursor-pointer items-center justify-between rounded-lg p-1.5 transition-colors select-none"
              @click="toggleCategoryCollapse(cat.id)"
            >
              <!-- 左侧：拖拽手柄 + 箭头 + 标题与数量 -->
              <div class="flex items-center gap-2">
                <!-- 分类拖拽排序手柄 -->
                <div
                  class="category-drag-handle text-base-content/40 hover:bg-base-300/60 hover:text-base-content flex cursor-grab items-center rounded p-1 transition-colors active:cursor-grabbing"
                  title="按住此手柄上下拖动分类排序"
                  @click.stop
                >
                  <Bars2Icon class="h-4 w-4" />
                </div>

                <!-- 折叠箭头 -->
                <ChevronDownIcon
                  class="h-4 w-4 shrink-0 transition-transform duration-200"
                  :class="cat.collapsed ? '-rotate-90' : ''"
                />

                <!-- 分类名称行内编辑 -->
                <template v-if="editingCatId === cat.id">
                  <input
                    v-model="editingCatName"
                    class="input input-bordered input-xs w-36"
                    @click.stop
                    @keydown.enter.stop="saveCategoryName(cat.id)"
                  />
                  <button
                    class="btn btn-ghost btn-xs btn-circle text-success"
                    @click.stop="saveCategoryName(cat.id)"
                  >
                    <CheckIcon class="h-3.5 w-3.5" />
                  </button>
                  <button
                    class="btn btn-ghost btn-xs btn-circle"
                    @click.stop="editingCatId = null"
                  >
                    <XMarkIcon class="h-3.5 w-3.5" />
                  </button>
                </template>
                <template v-else>
                  <span class="text-base-content text-sm font-bold">{{ cat.name }}</span>
                  <button
                    class="btn btn-ghost btn-xs btn-circle text-base-content/40 hover:text-base-content"
                    title="重命名分类"
                    @click.stop="startEditCategoryName(cat.id, cat.name)"
                  >
                    <PencilSquareIcon class="h-3.5 w-3.5" />
                  </button>
                </template>

                <span class="badge badge-ghost badge-sm text-xs">
                  {{ validGroupNamesOf(cat).length }}
                </span>
              </div>

              <!-- 右侧：一键测速与删除操作 -->
              <div
                class="flex items-center gap-1.5"
                @click.stop
              >
                <!-- 分类专属一键测速 -->
                <button
                  class="btn btn-ghost btn-xs text-primary gap-1"
                  :disabled="testingCategoryIds.has(cat.id) || validGroupNamesOf(cat).length === 0"
                  @click="speedTestForCategory(cat.id)"
                >
                  <BoltIcon
                    class="h-3.5 w-3.5"
                    :class="{ 'text-warning animate-pulse': testingCategoryIds.has(cat.id) }"
                  />
                  {{ testingCategoryIds.has(cat.id) ? '测速中...' : '一键测速' }}
                </button>

                <!-- 删除分类 -->
                <button
                  class="btn btn-ghost btn-xs text-error/80 hover:text-error"
                  title="删除分类（内含策略组将退回未分组）"
                  @click="removeStrategyCategory(cat.id)"
                >
                  <TrashIcon class="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            <!-- 策略组列表：宽度自适应网格，支持4~6列以上 -->
            <div
              v-show="!cat.collapsed"
              class="pt-2"
            >
              <Draggable
                v-model="cat.groupNames"
                group="strategy-group-dnd"
                item-key="(name: string) => name"
                handle=".strategy-drag-handle"
                :animation="150"
                ghost-class="opacity-40"
                class="min-h-[64px] rounded-lg p-1"
                :style="responsiveGridStyle"
              >
                <template #item="{ element: groupName }">
                  <div
                    v-if="proxyMap[groupName]"
                    v-show="matchesSearch(groupName)"
                    class="group/item flex min-w-0 flex-col gap-1"
                  >
                    <div class="flex items-center justify-between px-1">
                      <div
                        class="strategy-drag-handle bg-base-200/90 text-base-content/60 hover:bg-primary hover:text-primary-content flex cursor-grab items-center gap-1.5 rounded px-2 py-0.5 text-xs shadow-xs transition-colors active:cursor-grabbing"
                        title="按住此手柄拖拽以调整排序或跨组移动"
                      >
                        <Bars3Icon class="h-3.5 w-3.5" />
                        <span class="text-[11px] font-medium select-none"
                          >拖拽 · {{ groupName }}</span
                        >
                      </div>
                    </div>
                    <ProxyGroup :name="groupName" />
                  </div>
                </template>
                <template #header>
                  <div
                    v-if="cat.groupNames.length === 0"
                    class="border-base-300 text-base-content/40 col-span-full flex h-16 items-center justify-center rounded-lg border border-dashed text-xs"
                  >
                    可将下方未分组策略组手柄拖动至此处
                  </div>
                </template>
              </Draggable>
            </div>
          </div>
        </template>
      </Draggable>

      <!-- 未分组策略组容器 -->
      <div class="bg-base-100/50 border-base-300 mt-4 rounded-xl border p-3 shadow-xs">
        <div
          class="hover:bg-base-200/50 -m-1 flex cursor-pointer items-center justify-between rounded-lg p-1.5 transition-colors select-none"
          @click="isUngroupedCollapsed = !isUngroupedCollapsed"
        >
          <div class="flex items-center gap-2">
            <ChevronDownIcon
              class="h-4 w-4 shrink-0 transition-transform duration-200"
              :class="isUngroupedCollapsed ? '-rotate-90' : ''"
            />
            <span class="text-base-content/80 text-sm font-bold">未分组策略组</span>
            <span class="badge badge-neutral badge-sm text-xs">
              {{ ungroupedStrategyGroups.length }}
            </span>
          </div>
          <span class="text-base-content/40 text-xs">按住卡片上方手柄即可拖入任意自定义分类</span>
        </div>

        <div
          v-show="!isUngroupedCollapsed"
          class="pt-2"
        >
          <Draggable
            v-model="ungroupedStrategyGroups"
            group="strategy-group-dnd"
            item-key="(name: string) => name"
            handle=".strategy-drag-handle"
            :animation="150"
            ghost-class="opacity-40"
            class="min-h-[64px] rounded-lg p-1"
            :style="responsiveGridStyle"
          >
            <template #item="{ element: groupName }">
              <div
                v-if="proxyMap[groupName]"
                v-show="matchesSearch(groupName)"
                class="group/item flex min-w-0 flex-col gap-1"
              >
                <div class="flex items-center justify-between px-1">
                  <div
                    class="strategy-drag-handle bg-base-200/90 text-base-content/60 hover:bg-primary hover:text-primary-content flex cursor-grab items-center gap-1.5 rounded px-2 py-0.5 text-xs shadow-xs transition-colors active:cursor-grabbing"
                    title="按住此手柄拖拽以调整排序或跨组移动"
                  >
                    <Bars3Icon class="h-3.5 w-3.5" />
                    <span class="text-[11px] font-medium select-none">拖拽 · {{ groupName }}</span>
                  </div>
                </div>
                <ProxyGroup :name="groupName" />
              </div>
            </template>
            <template #header>
              <div
                v-if="ungroupedStrategyGroups.length === 0"
                class="text-base-content/40 col-span-full py-6 text-center text-xs"
              >
                所有策略组均已分配至自定义分类
              </div>
            </template>
          </Draggable>
        </div>
      </div>
    </template>

    <ProxyGroupChainModal />
  </div>
</template>

<script setup lang="ts">
import { fetchProxies, proxyGroupList, proxyMap } from '@/assembly/proxies'
import ProxyGroup from '@/components/proxies/ProxyGroup.vue'
import ProxyGroupChainModal from '@/components/proxies/ProxyGroupChainModal.vue'
import { usePaddingForViews } from '@/composables/use-padding-for-views'
import { showNotification } from '@/helper/notification'
import {
  addStrategyCategory,
  exportCustomStrategyGroups,
  importCustomStrategyGroups,
  isTestingAllGroups,
  myCustomStrategyGroups,
  removeStrategyCategory,
  renameStrategyCategory,
  speedTestAllStrategyGroups,
  speedTestForCategory,
  testingCategoryIds,
  toggleCategoryCollapse,
  type CustomStrategyCategory,
} from '@/store/my-proxies'
import { activeBackend } from '@/store/setup'
import {
  ArrowDownTrayIcon,
  ArrowPathIcon,
  ArrowUpTrayIcon,
  Bars2Icon,
  Bars3Icon,
  BoltIcon,
  CheckIcon,
  ChevronDownIcon,
  PencilSquareIcon,
  PlusIcon,
  TrashIcon,
  XMarkIcon,
} from '@heroicons/vue/24/outline'
import { computed, onMounted, ref, watch } from 'vue'
import Draggable from 'vuedraggable'

const { padding } = usePaddingForViews({ offsetTop: 0, offsetBottom: 0 })

// 依据宽度自适应网格：每卡片最小宽度 300px，宽度足够时自动铺开 4、5、6+ 列
const responsiveGridStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 300px), 1fr))',
  gap: '0.75rem',
}

// 数据就绪状态检测：确保直接刷新时不会由于后端节点数据未到达而引发渲染异常
const isLoading = computed(() => {
  return (
    !proxyGroupList.value ||
    proxyGroupList.value.length === 0 ||
    Object.keys(proxyMap.value).length === 0
  )
})

// 未分组区域折叠状态
const isUngroupedCollapsed = ref(false)

// 校验在当前后端中实际存在的策略组
const validGroupNamesOf = (cat: CustomStrategyCategory) => {
  if (!cat || !Array.isArray(cat.groupNames)) return []
  return cat.groupNames.filter((name) => Boolean(proxyMap.value[name]))
}

// 搜索过滤
const searchKeyword = ref('')
const matchesSearch = (name: string) => {
  if (!searchKeyword.value.trim()) return true
  return name.toLowerCase().includes(searchKeyword.value.trim().toLowerCase())
}

// 动态计算未分类策略组
const ungroupedStrategyGroups = computed({
  get: () => {
    const categorizedSet = new Set<string>()
    if (Array.isArray(myCustomStrategyGroups.value)) {
      for (const cat of myCustomStrategyGroups.value) {
        if (Array.isArray(cat?.groupNames)) {
          for (const name of cat.groupNames) categorizedSet.add(name)
        }
      }
    }
    return proxyGroupList.value.filter(
      (name) => !categorizedSet.has(name) && Boolean(proxyMap.value[name]),
    )
  },
  set: (newUngroupedList: string[]) => {
    const ungroupedSet = new Set(newUngroupedList)
    if (Array.isArray(myCustomStrategyGroups.value)) {
      for (const cat of myCustomStrategyGroups.value) {
        if (Array.isArray(cat?.groupNames)) {
          cat.groupNames = cat.groupNames.filter((name) => !ungroupedSet.has(name))
        }
      }
    }
  },
})

// 分类名称行内重命名
const editingCatId = ref<string | null>(null)
const editingCatName = ref('')
const startEditCategoryName = (id: string, currentName: string) => {
  editingCatId.value = id
  editingCatName.value = currentName
}
const saveCategoryName = (id: string) => {
  if (editingCatId.value) {
    renameStrategyCategory(id, editingCatName.value)
    editingCatId.value = null
  }
}

// 新建分类
const newCategoryName = ref('')
const handleCreateCategory = () => {
  addStrategyCategory(newCategoryName.value)
  newCategoryName.value = ''
}

// 导出与导入
const fileInputRef = ref<HTMLInputElement | null>(null)
const handleExport = () => {
  exportCustomStrategyGroups()
  showNotification({
    content: '已导出策略组自定义分组配置',
    type: 'alert-info',
  })
}

const triggerImport = () => {
  fileInputRef.value?.click()
}

const handleFileSelected = (e: Event) => {
  const target = e.target as HTMLInputElement
  const file = target.files?.[0]
  if (!file) return

  const reader = new FileReader()
  reader.onload = (event) => {
    const content = event.target?.result as string
    if (content) {
      const ok = importCustomStrategyGroups(content)
      if (ok) {
        showNotification({
          content: '导入策略组配置成功',
          type: 'alert-success',
        })
      } else {
        showNotification({
          content: '导入失败：JSON 格式不正确',
          type: 'alert-error',
        })
      }
    }
    target.value = ''
  }
  reader.readAsText(file)
}

// 监听后端变化并主动发起拉取
watch(
  activeBackend,
  () => {
    fetchProxies().catch(() => {})
  },
  { immediate: true },
)

onMounted(async () => {
  try {
    await fetchProxies()
  } catch {
    // 忽略异常，由状态机处理
  }
})
</script>
