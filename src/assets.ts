const imageCache = new Map<string, Promise<HTMLImageElement>>()

export function loadImage(src: string): Promise<HTMLImageElement> {
  const cached = imageCache.get(src)
  if (cached) return cached

  const pending = new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => {
      imageCache.delete(src)
      reject(new Error(`Unable to load ${src}`))
    }
    image.src = src
  })
  imageCache.set(src, pending)
  return pending
}

export async function preloadImages(
  sources: string[],
  onProgress: (loaded: number, total: number) => void,
): Promise<string[]> {
  const uniqueSources = [...new Set(sources)]
  let loaded = 0
  onProgress(loaded, uniqueSources.length)

  const results = await Promise.allSettled(
    uniqueSources.map(async (src) => {
      try {
        await loadImage(src)
      } finally {
        loaded += 1
        onProgress(loaded, uniqueSources.length)
      }
    }),
  )

  return results.flatMap((result, index) =>
    result.status === "rejected" ? [uniqueSources[index]] : [],
  )
}
