function playTone(frequencies: number[], noteDuration = 0.12): void {
  const ctx = new AudioContext()
  const now = ctx.currentTime

  frequencies.forEach((freq, i) => {
    const start = now + i * noteDuration
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.value = freq
    gain.gain.setValueAtTime(0, start)
    gain.gain.linearRampToValueAtTime(0.12, start + 0.01)
    gain.gain.exponentialRampToValueAtTime(0.0001, start + noteDuration)
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start(start)
    osc.stop(start + noteDuration)
  })

  setTimeout(() => ctx.close(), (frequencies.length * noteDuration + 0.3) * 1000)
}

export function playNewMailSound(): void {
  playTone([880, 1320])
}

export function playSentMailSound(): void {
  playTone([660, 880])
}
