export function streamText(
  provider: string,
  system: string,
  user: string,
  key: string,
  onDelta: (delta: string) => void,
): Promise<{ text?: string; error?: string }>
