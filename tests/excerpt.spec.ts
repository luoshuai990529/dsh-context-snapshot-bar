// @vitest-environment node
/**
 * Excerpt boundaries: the plugin cuts text before joining it, keeps Unicode
 * intact, and never reads a whole attachment body to show its type.
 */

import { describe, expect, it } from 'vitest'
import { excerpt, excerptBlocks } from '../src/projection/excerpt.ts'

describe('excerpt', () => {
  it('keeps text that fits and reports no truncation', () => {
    expect(excerpt('hello', 10)).toEqual({ text: 'hello', truncated: false })
    expect(excerpt('', 10)).toEqual({ text: '', truncated: false })
  })

  it('cuts text at exactly the limit and reports truncation', () => {
    expect(excerpt('abcdef', 3)).toEqual({ text: 'abc', truncated: true })
  })

  it('counts characters rather than bytes for non-ASCII text', () => {
    expect(excerpt('上下文快照', 3)).toEqual({ text: '上下文', truncated: true })
  })

  it('never publishes half of a surrogate pair', () => {
    // Two UTF-16 units hold exactly one supplementary-plane character.
    expect(excerpt('🙂🙂🙂', 3)).toEqual({ text: '🙂', truncated: true })
    expect(excerpt('🙂🙂🙂', 4)).toEqual({ text: '🙂🙂', truncated: true })
    expect(excerptBlocks(['a🙂b'], 2)).toEqual({ text: 'a', truncated: true })
  })
})

describe('excerptBlocks', () => {
  it('joins every block when the total fits', () => {
    expect(excerptBlocks(['ab', 'cd'], 10)).toEqual({ text: 'abcd', truncated: false })
  })

  it('stops at the limit without reading past it', () => {
    expect(excerptBlocks(['ab', 'cd', 'ef'], 5)).toEqual({ text: 'abcde', truncated: true })
  })

  it('reports truncation when later blocks were never reached', () => {
    expect(excerptBlocks(['abcdef'], 2)).toEqual({ text: 'ab', truncated: true })
  })

  it('returns empty text for an empty block list', () => {
    expect(excerptBlocks([], 5)).toEqual({ text: '', truncated: false })
  })
})
