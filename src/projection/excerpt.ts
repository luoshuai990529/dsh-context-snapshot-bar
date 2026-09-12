/**
 * Bounded text extraction. Excerpts are taken before concatenation wherever
 * the source is a block list, so a node carrying megabytes of tool output never
 * materializes that text just to keep the first few hundred characters.
 *
 * @module dsh-context-snapshot-bar/projection/excerpt
 */

/** One excerpted string and whether the limit cut it. */
export interface Excerpt {
  /** The kept text, at most `limit` characters. */
  text: string
  /** Whether characters were dropped. */
  truncated: boolean
}

/**
 * Bound one string to a character limit.
 *
 * @param text - the source text.
 * @param limit - maximum characters to keep.
 * @returns the kept text and whether it was cut.
 */
export function excerpt(text: string, limit: number): Excerpt {
  if (text.length <= limit) return { text, truncated: false }
  return { text: sliceAtCodePoint(text, limit), truncated: true }
}

/**
 * Cut a string at a character boundary.
 *
 * A limit expressed in UTF-16 code units can land inside a surrogate pair, so
 * the kept text drops the incomplete pair instead of publishing half of it.
 *
 * @param text - the source text.
 * @param limit - maximum UTF-16 code units to keep.
 * @returns the kept text, ending on a complete character.
 */
function sliceAtCodePoint(text: string, limit: number): string {
  let end = limit
  const code = text.charCodeAt(end - 1)
  if (code >= 0xD800 && code <= 0xDBFF) end -= 1
  return text.slice(0, end)
}

/**
 * Bound the concatenation of several strings without joining them first.
 *
 * Blocks are consumed in order until the limit is reached, so the cost is
 * bounded by the limit rather than by the total source length.
 *
 * @param blocks - the source strings, in display order.
 * @param limit - maximum characters to keep.
 * @returns the kept text and whether any source text was dropped.
 */
export function excerptBlocks(blocks: readonly string[], limit: number): Excerpt {
  const kept: string[] = []
  let remaining = limit
  for (const block of blocks) {
    if (remaining <= 0) return { text: kept.join(''), truncated: true }
    if (block.length <= remaining) {
      kept.push(block)
      remaining -= block.length
      continue
    }
    kept.push(sliceAtCodePoint(block, remaining))
    return { text: kept.join(''), truncated: true }
  }
  return { text: kept.join(''), truncated: false }
}
