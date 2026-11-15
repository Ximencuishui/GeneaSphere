export interface SurnameData {
  name: string
  color: string
  origin: { lng: number; lat: number }
  /** 郡望相距很近时，把姓字挪开，避免叠在一起 */
  labelOffset?: { x: number; y: number }
  paths: { lng: number; lat: number }[][]
  description: string
}

export interface MigrateNode {
  name: string
  lng: number
  lat: number
  description?: string
  type: 'origin' | 'hub' | 'destination'
}

export interface SearchResult {
  id: string
  type: 'photo' | 'archive' | 'memory'
  title: string
  location: string
  year: number
  thumbnail?: string
  description: string
}

export interface ParticleState {
  x: number
  y: number
  /** 相对路线的像素偏移，让同一条路径上的光点铺成一股细流 */
  offsetX: number
  offsetY: number
  /** 每帧前进的路程比例（已按路径长度归一，长途不会走得过快） */
  speed: number
  size: number
  alpha: number
  surnameIndex: number
  pathIndex: number
  progress: number
}
