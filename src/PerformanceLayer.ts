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
