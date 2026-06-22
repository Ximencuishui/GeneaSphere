import { ref, watch, onMounted, onUnmounted } from 'vue'
import { useMusicStore } from '@/stores/music'

export function useBackgroundMusic() {
  const musicStore = useMusicStore()
  const audioElement = ref<HTMLAudioElement | null>(null)
  const timerInterval = ref<number | null>(null)
  const remainingTime = ref<number>(0)
  const error = ref<string | null>(null)

  // 初始化音频元素
  function initAudio() {
    if (!audioElement.value) {
      audioElement.value = new Audio()
      audioElement.value.loop = true // 无缝循环
      audioElement.value.preload = 'auto'

      // 监听音频错误
      audioElement.value.addEventListener('error', handleAudioError)
      
      // 监听播放状态变化
      audioElement.value.addEventListener('play', () => {
        musicStore.isPlaying = true
      })
      audioElement.value.addEventListener('pause', () => {
        musicStore.isPlaying = false
      })
    }
  }

  // 处理音频错误
  function handleAudioError() {
    error.value = '音效加载失败，请检查音频文件是否存在'
    musicStore.isPlaying = false
    console.error('Audio load error:', audioElement.value?.error)
  }

  // 加载并播放音频
  async function play() {
    try {
      initAudio()
      
      if (!audioElement.value) return

      error.value = null
      
      // 设置音频源和音量
      audioElement.value.src = musicStore.currentTrack.file
      audioElement.value.volume = musicStore.volumeDecimal
      
      // 播放音频
      await audioElement.value.play()
      
      // 启动定时器（如果设置了定时关闭）
      if (musicStore.timerMinutes > 0) {
        startTimer(musicStore.timerMinutes)
      }
    } catch (err) {
      error.value = '播放失败，请重试'
      console.error('Play error:', err)
    }
  }

  // 暂停播放
  function pause() {
    if (audioElement.value) {
      audioElement.value.pause()
      stopTimer()
    }
  }

  // 切换播放/暂停
  function togglePlay() {
    if (musicStore.isPlaying) {
      pause()
    } else {
      play()
    }
  }

  // 切换音效
  async function switchTrack(trackId: string) {
    musicStore.setTrack(trackId)
    
    if (musicStore.isPlaying) {
      // 如果正在播放，切换到新音效
      if (audioElement.value) {
        audioElement.value.src = musicStore.currentTrack.file
        audioElement.value.volume = musicStore.volumeDecimal
        
        try {
          await audioElement.value.play()
        } catch (err) {
          console.error('Switch track error:', err)
        }
      }
    }
  }

  // 设置音量
  function setVolume(volume: number) {
    musicStore.setVolume(volume)
    
    if (audioElement.value) {
      audioElement.value.volume = musicStore.volumeDecimal
    }
  }

  // 启动定时关闭
  function startTimer(minutes: number) {
    stopTimer() // 先清除现有定时器
    
    remainingTime.value = minutes * 60 // 转换为秒
    
    timerInterval.value = window.setInterval(() => {
      remainingTime.value--
      
      if (remainingTime.value <= 0) {
        // 定时结束，淡出并停止
        fadeOutAndStop()
        stopTimer()
      }
    }, 1000)
  }

  // 停止定时器
  function stopTimer() {
    if (timerInterval.value) {
      clearInterval(timerInterval.value)
      timerInterval.value = null
      remainingTime.value = 0
    }
  }

  // 淡出效果（2秒内音量渐降至0）
  function fadeOutAndStop() {
    if (!audioElement.value) return

    const fadeDuration = 2000 // 2秒
    const fadeSteps = 20
    const fadeInterval = fadeDuration / fadeSteps
    const volumeStep = audioElement.value.volume / fadeSteps

    let currentFadeStep = 0

    const fadeIntervalId = setInterval(() => {
      currentFadeStep++
      
      if (audioElement.value) {
        audioElement.value.volume = Math.max(0, audioElement.value.volume - volumeStep)
      }

      if (currentFadeStep >= fadeSteps) {
        clearInterval(fadeIntervalId)
        
        if (audioElement.value) {
          audioElement.value.pause()
          // 恢复原始音量设置
          audioElement.value.volume = musicStore.volumeDecimal
        }
        
        musicStore.isPlaying = false
      }
    }, fadeInterval)
  }

  // 监听 store 中的播放状态变化
  watch(() => musicStore.isPlaying, (newVal) => {
    if (newVal) {
      play()
    } else {
      pause()
    }
  })

  // 监听音量变化
  watch(() => musicStore.volume, (newVal) => {
    if (audioElement.value) {
      audioElement.value.volume = newVal / 100
    }
  })

  // 监听音效切换
  watch(() => musicStore.currentTrackId, (newVal) => {
    if (musicStore.isPlaying) {
      switchTrack(newVal)
    }
  })

  // 组件挂载时加载设置
  onMounted(() => {
    musicStore.loadSettings()
  })

  // 组件卸载时清理
  onUnmounted(() => {
    stopTimer()
    
    if (audioElement.value) {
      audioElement.value.pause()
      audioElement.value.removeEventListener('error', handleAudioError)
    }
  })

  return {
    audioElement,
    error,
    remainingTime,
    play,
    pause,
    togglePlay,
    switchTrack,
    setVolume,
    startTimer,
    stopTimer,
    fadeOutAndStop
  }
}
