export interface SurnameData {
  name: string
  color: string
  origin: { lng: number; lat: number }
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
  targetX: number
  targetY: number
  speed: number
  size: number
  alpha: number
  surnameIndex: number
  pathIndex: number
  progress: number
}
