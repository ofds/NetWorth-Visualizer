import { useEffect, useRef, useState, type RefObject } from 'react'

export function useResizeObserverRect<T extends HTMLElement>(ref: RefObject<T | null>) {
  const [width, setWidth] = useState(0)
  const [height, setHeight] = useState(0)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const read = () => {
      const r = el.getBoundingClientRect()
      setWidth(Math.max(0, Math.floor(r.width)))
      setHeight(Math.max(0, Math.floor(r.height)))
    }

    read()
    const ro = new ResizeObserver(() => read())
    ro.observe(el)
    return () => ro.disconnect()
  }, [ref])

  return { width, height }
}

export function useGraphDimensions<T extends HTMLElement>() {
  const ref = useRef<T | null>(null)
  const { width, height } = useResizeObserverRect(ref)
  return { ref, width, height }
}
