export function streamText(
  provider: string,
  system: string,
  user: string,
  key: string,
  onDelta: (delta: string) => void,
): Promise<{ text?: string; error?: string }>

export function generateImage(
  provider: string,
  prompt: string,
  key: string,
): Promise<{ dataUrl?: string; error?: string }>
