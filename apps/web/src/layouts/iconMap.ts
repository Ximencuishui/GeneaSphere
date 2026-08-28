/**
 * 集中 iconMap
 * --------------------------------------------------------------------
 * 把 AdminLayout / UserCenterLayout 用到的 Element Plus 图标集中导出。
 *
 * 维护约定：
 * - 新增菜单项时如需新图标，先在本文件中 import + 加入 map，再在菜单定义里引用键值。
 * - 图标名采用 PascalCase，与 Element Plus 图标组件名一致。
 * - 兼容原有的 PascalCase 与 kebab-case 两种键（Element Plus 在 unplugin-icons 下两种都能解析）。
 */
import {
  Monitor,
  User,
  PictureFilled,
  Connection,
  Setting,
  Message,
  Document,
  HomeFilled,
  Bell,
  UserFilled,
  Menu,
  Search,
  EditPen,
  Calendar,
  ChatDotRound,
  DataLine,
  OfficeBuilding,
  CircleCheck,
  Tickets,
  Tools,
  Notebook,
  List,
  ChatLineRound,
  Collection,
  VideoCamera,
  VideoPlay,
  House,
  FolderOpened,
  Share,
  Management,
  SwitchButton,
  Fold,
  Expand,
} from '@element-plus/icons-vue'

/**
 * 图标键值 → Element Plus 组件
 *
 * 用法：
 *   <component :is="iconMap[item.icon]" />
 */
export const iconMap: Record<string, unknown> = {
  Monitor,
  User,
  PictureFilled,
  Connection,
  Setting,
  Message,
  Document,
  HomeFilled,
  Bell,
  UserFilled,
  Menu,
  Search,
  EditPen,
  Calendar,
  ChatDotRound,
  DataLine,
  OfficeBuilding,
  CircleCheck,
  Tickets,
  Tools,
  Notebook,
  List,
  ChatLineRound,
  Collection,
  VideoCamera,
  VideoPlay,
  House,
  FolderOpened,
  Share,
  Management,
  SwitchButton,
  Fold,
  Expand,
}

/** 已注册的图标键值集合（用于类型约束 / 测试） */
export const iconKeys = Object.keys(iconMap)

/** 类型守卫：键值是否在 iconMap 中 */
export const hasIcon = (key: string): boolean =>
  Object.prototype.hasOwnProperty.call(iconMap, key)