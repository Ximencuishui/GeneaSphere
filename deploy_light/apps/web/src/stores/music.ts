import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export interface MusicTrack {
  id: string
  name: string
  file: string
  description: string
}

export const MUSIC_TRACKS: MusicTrack[] = [
  {
    id: 'night-crickets',
    name: '夜间虫鸣',
    file: '/audio/night-crickets.mp3',
    description: '远处蟋蟀、纺织娘的叫声'
  },
  {
    id: 'field-frogs',
    name: '田野蛙声',
    file: '/audio/field-frogs.mp3',
    description: '稻田青蛙的叫声'
  },
  {
    id: 'summer-night',
    name: '夏日夜晚',
    file: '/audio/summer-night.mp3',
    description: '虫鸣+蛙声+微风混合'
  }
]

export const TIMER_OPTIONS = [
  { label: '不关闭', value: 0 },
  { label: '15分钟', value: 15 },
  { label: '30分钟', value: 30 },
  { label: '1小时', value: 60 },
  { label: '2小时', value: 120 }
]

export const useMusicStore = defineStore('music', () => {
  // State
  const isPlaying = ref(false)
  const volume = ref(60)
  const currentTrackId = ref('night-crickets')
  const timerMinutes = ref(30)
  const isControlVisible = ref(false)
  const isInitialized = ref(false)

  // Computed
  const currentTrack = computed(() => 
    MUSIC_TRACKS.find(track => track.id === currentTrackId.value) || MUSIC_TRACKS[0]
  )

  const volumeDecimal = computed(() => volume.value / 100)

  // Actions
  function loadSettings() {
    try {
      const saved = localStorage.getItem('music_settings')
      if (saved) {
        const settings = JSON.parse(saved)
        volume.value = settings.volume ?? 60
        currentTrackId.value = settings.currentTrackId ?? 'night-crickets'
        timerMinutes.value = settings.timerMinutes ?? 30
        isInitialized.value = true
      }
    } catch (error) {
      console.error('Failed to load music settings:', error)
    }
  }

  function saveSettings() {
    try {
      const settings = {
        volume: volume.value,
        currentTrackId: currentTrackId.value,
        timerMinutes: timerMinutes.value
      }
      localStorage.setItem('music_settings', JSON.stringify(settings))
    } catch (error) {
      console.error('Failed to save music settings:', error)
    }
  }

  function togglePlay() {
    isPlaying.value = !isPlaying.value
  }

  function setVolume(newVolume: number) {
    volume.value = Math.max(0, Math.min(100, newVolume))
    saveSettings()
  }

  function setTrack(trackId: string) {
    currentTrackId.value = trackId
    saveSettings()
  }

  function setTimer(minutes: number) {
    timerMinutes.value = minutes
    saveSettings()
  }

  function toggleControl() {
    isControlVisible.value = !isControlVisible.value
  }

  function closeControl() {
    isControlVisible.value = false
  }

  return {
    isPlaying,
    volume,
    currentTrackId,
    timerMinutes,
    isControlVisible,
    isInitialized,
    currentTrack,
    volumeDecimal,
    loadSettings,
    saveSettings,
    togglePlay,
    setVolume,
    setTrack,
    setTimer,
    toggleControl,
    closeControl
  }
})
