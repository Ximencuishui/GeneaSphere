<template>
  <Transition name="slide-up">
    <div v-if="musicStore.isControlVisible" class="music-control">
      <div class="control-header">
        <h3 class="control-title">🎵 背景音乐</h3>
        <button class="close-btn" @click="musicStore.closeControl" title="关闭">
          ✕
        </button>
      </div>

      <div class="control-body">
        <!-- 播放控制 -->
        <div class="control-section">
          <button 
            class="play-btn" 
            @click="musicStore.togglePlay()"
            :class="{ 'is-playing': musicStore.isPlaying }"
          >
            {{ musicStore.isPlaying ? '⏸ 暂停' : '▶ 播放' }}
          </button>
        </div>

        <!-- 音量控制 -->
        <div class="control-section">
          <label class="section-label">音量</label>
          <div class="volume-control">
            <input 
              type="range" 
              class="volume-slider"
              min="0" 
              max="100" 
              v-model.number="localVolume"
              @input="handleVolumeChange"
            />
            <span class="volume-value">{{ musicStore.volume }}%</span>
          </div>
        </div>

        <!-- 音效选择 -->
        <div class="control-section">
          <label class="section-label">音效</label>
          <select 
            class="track-select" 
            v-model="localTrackId"
            @change="handleTrackChange"
          >
            <option v-for="track in MUSIC_TRACKS" :key="track.id" :value="track.id">
              {{ track.name }} - {{ track.description }}
            </option>
          </select>
        </div>

        <!-- 定时关闭 -->
        <div class="control-section">
          <label class="section-label">定时关闭</label>
          <select 
            class="timer-select" 
            v-model.number="localTimer"
            @change="handleTimerChange"
          >
            <option v-for="option in TIMER_OPTIONS" :key="option.value" :value="option.value">
              {{ option.label }}
            </option>
          </select>
          <div v-if="remainingTime > 0 && musicStore.isPlaying" class="timer-display">
            剩余时间：{{ formatTime(remainingTime) }}
          </div>
        </div>

        <!-- 错误提示 -->
        <div v-if="error" class="error-message">
          ⚠️ {{ error }}
        </div>
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { useMusicStore, MUSIC_TRACKS, TIMER_OPTIONS } from '@/stores/music'
import { useBackgroundMusic } from '@/composables/useBackgroundMusic'

const musicStore = useMusicStore()
const { error, remainingTime, setVolume, switchTrack, startTimer, stopTimer } = useBackgroundMusic()

// 本地状态（用于表单绑定）
const localVolume = ref(musicStore.volume)
const localTrackId = ref(musicStore.currentTrackId)
const localTimer = ref(musicStore.timerMinutes)

// 同步 store 状态到本地
watch(() => musicStore.volume, (val) => {
  localVolume.value = val
})

watch(() => musicStore.currentTrackId, (val) => {
  localTrackId.value = val
})

watch(() => musicStore.timerMinutes, (val) => {
  localTimer.value = val
})

// 音量变化处理
function handleVolumeChange() {
  setVolume(localVolume.value)
}

// 音效切换处理
function handleTrackChange() {
  switchTrack(localTrackId.value)
}

// 定时器变化处理
function handleTimerChange() {
  musicStore.setTimer(localTimer.value)
  
  if (musicStore.isPlaying && localTimer.value > 0) {
    startTimer(localTimer.value)
  } else if (localTimer.value === 0) {
    stopTimer()
  }
}

// 格式化时间（秒转 mm:ss）
function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${mins}:${secs.toString().padStart(2, '0')}`
}
</script>

<style scoped>
.music-control {
  position: fixed;
  bottom: 80px;
  right: 24px;
  width: 320px;
  background: white;
  border-radius: 16px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12);
  overflow: hidden;
  z-index: 1000;
}

.control-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
}

.control-title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
}

.close-btn {
  background: rgba(255, 255, 255, 0.2);
  border: none;
  color: white;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  cursor: pointer;
  font-size: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.2s;
}

.close-btn:hover {
  background: rgba(255, 255, 255, 0.3);
}

.control-body {
  padding: 20px;
}

.control-section {
  margin-bottom: 20px;
}

.control-section:last-child {
  margin-bottom: 0;
}

.section-label {
  display: block;
  font-size: 13px;
  font-weight: 500;
  color: #666;
  margin-bottom: 8px;
}

/* 播放按钮 */
.play-btn {
  width: 100%;
  padding: 12px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 15px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.3s;
}

.play-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);
}

.play-btn.is-playing {
  background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
}

/* 音量控制 */
.volume-control {
  display: flex;
  align-items: center;
  gap: 12px;
}

.volume-slider {
  flex: 1;
  height: 6px;
  -webkit-appearance: none;
  appearance: none;
  background: linear-gradient(to right, #667eea 0%, #764ba2 100%);
  border-radius: 3px;
  outline: none;
}

.volume-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 18px;
  height: 18px;
  background: white;
  border: 2px solid #667eea;
  border-radius: 50%;
  cursor: pointer;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.2);
}

.volume-slider::-moz-range-thumb {
  width: 18px;
  height: 18px;
  background: white;
  border: 2px solid #667eea;
  border-radius: 50%;
  cursor: pointer;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.2);
}

.volume-value {
  min-width: 40px;
  text-align: right;
  font-size: 13px;
  color: #666;
  font-weight: 500;
}

/* 下拉选择框 */
.track-select,
.timer-select {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  font-size: 14px;
  color: #333;
  background: white;
  cursor: pointer;
  transition: border-color 0.2s;
}

.track-select:hover,
.timer-select:hover {
  border-color: #667eea;
}

.track-select:focus,
.timer-select:focus {
  outline: none;
  border-color: #667eea;
  box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
}

/* 定时器显示 */
.timer-display {
  margin-top: 8px;
  padding: 8px 12px;
  background: #f5f5f5;
  border-radius: 6px;
  font-size: 13px;
  color: #667eea;
  text-align: center;
  font-weight: 500;
}

/* 错误提示 */
.error-message {
  margin-top: 12px;
  padding: 10px 12px;
  background: #fff3cd;
  border: 1px solid #ffc107;
  border-radius: 6px;
  font-size: 13px;
  color: #856404;
  text-align: center;
}

/* 过渡动画 */
.slide-up-enter-active,
.slide-up-leave-active {
  transition: all 0.3s ease;
}

.slide-up-enter-from {
  opacity: 0;
  transform: translateY(20px);
}

.slide-up-leave-to {
  opacity: 0;
  transform: translateY(20px);
}

/* 移动端适配 */
@media (max-width: 768px) {
  .music-control {
    right: 12px;
    left: 12px;
    width: auto;
    bottom: 70px;
  }

  .control-header {
    padding: 14px 16px;
  }

  .control-body {
    padding: 16px;
  }
}
</style>
