const MUSIC_VOLUME = 0.38
const KEY_VOLUME = 1
const KEY_SLICE_SECONDS = 0.05

class GameAudio {
  private music = new Audio("/audio/chase-loop.ogg")
  private catchSound = new Audio("/audio/catch.ogg")
  private escapeSound = new Audio("/audio/escape.ogg")
  private context: AudioContext | null = null
  private keyboard: AudioBuffer | null = null
  private keyboardLoad: Promise<void> | null = null
  private keyboardData: Promise<ArrayBuffer | null>

  constructor() {
    this.music.loop = true
    this.music.preload = "auto"
    this.music.volume = MUSIC_VOLUME
    this.catchSound.preload = "auto"
    this.escapeSound.preload = "auto"
    this.keyboardData = fetch("/audio/keyboard.mp3")
      .then((response) => (response.ok ? response.arrayBuffer() : null))
      .catch(() => null)
  }

  startMatch() {
    this.stopResultSounds()
    this.music.currentTime = 0
    void this.music.play().catch(() => {})
    void this.prepareKeyboard()
  }

  stopMatch() {
    this.music.pause()
    this.music.currentTime = 0
    this.stopResultSounds()
  }

  finishMatch(reason: "caught" | "finished") {
    this.stopMatch()
    const sound = reason === "caught" ? this.catchSound : this.escapeSound
    sound.currentTime = 0
    void sound.play().catch(() => {})
  }

  playKey() {
    const context = this.context
    const keyboard = this.keyboard
    if (!context || !keyboard) return

    const play = () => {
      const source = context.createBufferSource()
      const gain = context.createGain()
      const now = context.currentTime

      source.buffer = keyboard
      source.connect(gain)
      gain.connect(context.destination)
      gain.gain.setValueAtTime(KEY_VOLUME, now)
      source.start(now)
    }

    if (context.state === "suspended") {
      void context.resume().then(play)
      return
    }
    play()
  }

  private prepareKeyboard() {
    if (this.keyboardLoad) return this.keyboardLoad
    this.context = new AudioContext()
    void this.context.resume()
    this.keyboardLoad = this.keyboardData
      .then(async (data) => {
        if (!data) return
        const buffer = await this.context!.decodeAudioData(data.slice(0))
        this.keyboard = this.extractKeyClick(buffer)
      })
      .catch(() => {
        this.keyboardLoad = null
      })
    return this.keyboardLoad
  }

  private stopResultSounds() {
    for (const sound of [this.catchSound, this.escapeSound]) {
      sound.pause()
      sound.currentTime = 0
    }
  }

  private extractKeyClick(buffer: AudioBuffer) {
    const samples = buffer.getChannelData(0)
    let peakIndex = 0
    let peakAmplitude = 0
    for (let i = 0; i < samples.length; i += 1) {
      const amplitude = Math.abs(samples[i])
      if (amplitude <= peakAmplitude) continue
      peakAmplitude = amplitude
      peakIndex = i
    }

    const preRoll = Math.floor(buffer.sampleRate * 0.003)
    const start = Math.max(0, peakIndex - preRoll)
    const length = Math.min(Math.floor(buffer.sampleRate * KEY_SLICE_SECONDS), buffer.length - start)
    const click = this.context!.createBuffer(buffer.numberOfChannels, length, buffer.sampleRate)
    const fadeIn = Math.max(1, Math.floor(buffer.sampleRate * 0.0015))
    const fadeOut = Math.max(1, Math.floor(buffer.sampleRate * 0.012))
    const normalize = peakAmplitude > 0 ? Math.min(3, 0.9 / peakAmplitude) : 1

    for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
      const source = buffer.getChannelData(channel)
      const target = click.getChannelData(channel)
      for (let i = 0; i < length; i += 1) {
        const attack = Math.min(1, i / fadeIn)
        const release = Math.min(1, (length - i) / fadeOut)
        target[i] = source[start + i] * normalize * Math.min(attack, release)
      }
    }

    return click
  }
}

export const gameAudio = new GameAudio()
