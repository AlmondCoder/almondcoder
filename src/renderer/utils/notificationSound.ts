/**
 * Plays a notification sound when a conversation completes
 */
export function playNotificationSound() {
  try {
    // Using the Web Audio API to generate a pleasant notification sound
    const audioContext = new (
      window.AudioContext || (window as any).webkitAudioContext
    )()

    // Create oscillator for a pleasant "ding" sound
    const oscillator = audioContext.createOscillator()
    const gainNode = audioContext.createGain()

    oscillator.connect(gainNode)
    gainNode.connect(audioContext.destination)

    // Set frequency for a pleasant tone (around C6)
    oscillator.frequency.value = 1047

    // Create envelope for the sound
    const now = audioContext.currentTime
    gainNode.gain.setValueAtTime(0, now)
    gainNode.gain.linearRampToValueAtTime(0.3, now + 0.01) // Quick attack
    gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.5) // Decay

    oscillator.start(now)
    oscillator.stop(now + 0.5)

    console.log('🔔 Played notification sound')
  } catch (error) {
    console.log('Could not play notification sound:', error)
  }
}
