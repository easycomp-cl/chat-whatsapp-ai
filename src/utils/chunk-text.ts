const DEFAULT_CHUNK_SIZE = 500;
const DEFAULT_CHUNK_OVERLAP = 50;
const MIN_CHUNK_LENGTH = 20;

export type ChunkOptions = {
  chunkSize?: number;
  chunkOverlap?: number;
};

export function chunkText(text: string, options: ChunkOptions = {}): string[] {
  const CHUNK_SIZE = options.chunkSize ?? DEFAULT_CHUNK_SIZE;
  const CHUNK_OVERLAP = options.chunkOverlap ?? DEFAULT_CHUNK_OVERLAP;
  const trimmed = text.trim();
  if (!trimmed) {
    return [];
  }

  const lineSegments = trimmed
    .split(/\n+/)
    .map((segment) => segment.trim())
    .filter((segment) => segment.length >= MIN_CHUNK_LENGTH);

  if (lineSegments.length > 1) {
    return lineSegments;
  }

  const sentenceSegments = trimmed
    .split(/(?<=\.)\s+/)
    .map((segment) => segment.trim())
    .filter((segment) => segment.length >= MIN_CHUNK_LENGTH);

  if (sentenceSegments.length > 1) {
    return sentenceSegments;
  }

  const words = trimmed.split(/\s+/);
  const chunks: string[] = [];
  let index = 0;

  while (index < words.length) {
    const slice = words.slice(index, index + CHUNK_SIZE);
    if (slice.length) {
      chunks.push(slice.join(" "));
    }
    index += CHUNK_SIZE - CHUNK_OVERLAP;
  }

  return chunks.filter((chunk) => chunk.trim().length >= MIN_CHUNK_LENGTH);
}
