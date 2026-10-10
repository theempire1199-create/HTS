type FrameHandler<T extends Event> = (event: T) => void

/** Keeps high-frequency pointer work to one style update per rendered frame. */
export function rafThrottle<T extends Event>(callback: FrameHandler<T>): { handler: FrameHandler<T>; cancel: () => void } {
  let frame: number | undefined
  let latest: T | undefined

  const handler: FrameHandler<T> = (event) => {
    latest = event
    if (frame !== undefined) return
    frame = window.requestAnimationFrame(() => {
      frame = undefined
      const next = latest
      latest = undefined
      if (next) callback(next)
    })
  }

  return {
    handler,
    cancel: () => {
      if (frame !== undefined) window.cancelAnimationFrame(frame)
      frame = undefined
      latest = undefined
    },
  }
}

/** Returns a cleanup function so long-lived animation loops cannot leak. */
export function startTimedLoop(callback: () => void, delay: number): () => void {
  const timer = window.setInterval(callback, delay)
  return () => window.clearInterval(timer)
}

/**
 * Fast, glitch-free input focus.
 * Double-rAF lets the overlay finish its show animation before the keyboard
 * is requested, so mobile keyboards appear within the tap, without the
 * 200-350ms setTimeout lag and without scroll jump.
 */
export function focusFast(input: HTMLInputElement): void {
  if (document.activeElement === input) return
  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => {
      try {
        input.focus({ preventScroll: true })
      } catch {
        input.focus()
      }
    })
  })
}

let reducedMotionCache: boolean | undefined

/** Central reduced-motion check so all animations respect the OS setting. */
export function prefersReducedMotion(): boolean {
  if (reducedMotionCache === undefined) {
    try {
      reducedMotionCache = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    } catch {
      reducedMotionCache = false
    }
  }
  return reducedMotionCache
}
