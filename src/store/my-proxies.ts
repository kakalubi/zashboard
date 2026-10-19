import { allProxiesLatencyTest, fetchProxies, proxyGroupLatencyTest } from '@/assembly/proxies'
import { useStorage } from '@/composables/use-storage'
import pLimit from 'p-limit'
import { v4 as uuid } from 'uuid'
import { ref } from 'vue'

export interface CustomStrategyCategory {
  id: string
  name: string
  groupNames: string[] // 包含的策略组名称
  collapsed?: boolean
}

const defaultCategories: CustomStrategyCategory[] = [
  { id: 'cat-core', name: '核心策略', groupNames: [], collapsed: false },
  { id: 'cat-media', name: '流媒体分流', groupNames: [], collapsed: false },
  { id: 'cat-rules', name: '常用规则', groupNames: [], collapsed: false },
]

interface LegacyCategoryItem {
  id?: string
  name?: string
  groupNames?: unknown
  strategyGroupNames?: unknown
  nodeNames?: unknown
  collapsed?: boolean
}

// 数据防污与向后兼容清洗：防止旧版本存储字段差异导致 groupNames 为 undefined
const normalizeCategories = (rawList: unknown): CustomStrategyCategory[] => {
  if (!Array.isArray(rawList) || rawList.length === 0) {
    return defaultCategories
  }

  return rawList.map((item: LegacyCategoryItem) => ({
    id: item.id || uuid(),
    name: item.name || '未命名分类',
    groupNames: Array.isArray(item.groupNames)
      ? (item.groupNames.filter((n) => typeof n === 'string') as string[])
      : Array.isArray(item.strategyGroupNames)
        ? (item.strategyGroupNames.filter((n) => typeof n === 'string') as string[])
        : Array.isArray(item.nodeNames)
          ? (item.nodeNames.filter((n) => typeof n === 'string') as string[])
          : [],
    collapsed: Boolean(item.collapsed),
  }))
}

// 本地持久化存储策略组自定义分类
export const myCustomStrategyGroups = useStorage<CustomStrategyCategory[]>(
  'config/my-custom-strategy-groups',
  defaultCategories,
)

// 初始执行一次结构规范化校验
myCustomStrategyGroups.value = normalizeCategories(myCustomStrategyGroups.value)

// 当前正在测速的分类 ID 集合
export const testingCategoryIds = ref<Set<string>>(new Set())
export const isTestingAllGroups = ref(false)

// 新增分类
export const addStrategyCategory = (name: string) => {
  const trimmed = name.trim()
  if (!trimmed) return
  myCustomStrategyGroups.value.push({
    id: uuid(),
    name: trimmed,
    groupNames: [],
    collapsed: false,
  })
}

// 删除分类（组内的策略组自动回流至未分组）
export const removeStrategyCategory = (id: string) => {
  myCustomStrategyGroups.value = myCustomStrategyGroups.value.filter((c) => c.id !== id)
}

// 重命名分类
export const renameStrategyCategory = (id: string, newName: string) => {
  const trimmed = newName.trim()
  if (!trimmed) return
  const target = myCustomStrategyGroups.value.find((c) => c.id === id)
  if (target) {
    target.name = trimmed
  }
}

// 折叠/展开分类
export const toggleCategoryCollapse = (id: string) => {
  const target = myCustomStrategyGroups.value.find((c) => c.id === id)
  if (target) {
    target.collapsed = !target.collapsed
  }
}

// 分类一键测速：对该分类下的所有策略组并发测速（并发限制 2）
export const speedTestForCategory = async (categoryId: string) => {
  const target = myCustomStrategyGroups.value.find((c) => c.id === categoryId)
  if (!target || target.groupNames.length === 0 || testingCategoryIds.value.has(categoryId)) return

  testingCategoryIds.value.add(categoryId)
  const limiter = pLimit(2)

  try {
    await Promise.allSettled(
      target.groupNames.map((groupName) => limiter(() => proxyGroupLatencyTest(groupName))),
    )
  } finally {
    testingCategoryIds.value.delete(categoryId)
    await fetchProxies().catch(() => {})
  }
}

// 全部策略组测速
export const speedTestAllStrategyGroups = async () => {
  if (isTestingAllGroups.value) return
  isTestingAllGroups.value = true

  try {
    await allProxiesLatencyTest()
  } finally {
    isTestingAllGroups.value = false
    await fetchProxies().catch(() => {})
  }
}

// 导出自定义分类配置为 JSON 文件
export const exportCustomStrategyGroups = () => {
  const payload = {
    version: 1,
    exportTime: new Date().toISOString(),
    categories: myCustomStrategyGroups.value,
  }
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `zashboard-strategy-groups-${new Date().toISOString().slice(0, 10)}.json`
  a.click()
  URL.revokeObjectURL(url)
}

// 从 JSON 导入配置
export const importCustomStrategyGroups = (jsonString: string): boolean => {
  try {
    const parsed = JSON.parse(jsonString)
    let importedCategories: unknown[] = []

    if (Array.isArray(parsed)) {
      importedCategories = parsed
    } else if (
      parsed &&
      typeof parsed === 'object' &&
      'categories' in parsed &&
      Array.isArray((parsed as { categories: unknown[] }).categories)
    ) {
      importedCategories = (parsed as { categories: unknown[] }).categories
    } else if (
      parsed &&
      typeof parsed === 'object' &&
      'data' in parsed &&
      Array.isArray((parsed as { data: unknown[] }).data)
    ) {
      importedCategories = (parsed as { data: unknown[] }).data
    } else {
      return false
    }

    const cleaned = normalizeCategories(importedCategories)
    if (cleaned.length === 0) return false

    myCustomStrategyGroups.value = cleaned
    return true
  } catch (err) {
    console.error('Failed to parse strategy groups JSON:', err)
    return false
  }
}
