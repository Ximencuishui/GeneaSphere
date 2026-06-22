export interface MemoryQuiz {
  id: number
  location: string
  decade: number
  question: string
  tags?: string
}

export interface MemoryAnswer {
  id: number
  quiz_id: number
  user_id: string
  content: string
  endorsements: number
  is_verified: boolean
  created_at: string
  user?: { id: string; nickname: string | null }
}

export interface MemoryBadge {
  id: number
  user_id: string
  badge_type: string
  location?: string
  description?: string
  awarded_at: string
}

export interface MemoryWallData {
  quizzes: any[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}
