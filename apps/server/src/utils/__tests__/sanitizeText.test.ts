import { describe, expect, it } from 'vitest';
import { sanitizeText, scrubStringFields } from '../sanitizeText.js';

describe('sanitizeText', () => {
  it('passes null and undefined through', () => {
    expect(sanitizeText(null)).toBeNull();
    expect(sanitizeText(undefined)).toBeUndefined();
  });

  it('passes an empty string through', () => {
    expect(sanitizeText('')).toBe('');
  });

  it('returns clean strings unchanged', () => {
    const s = 'My Favorite Song (Space mix)';
    expect(sanitizeText(s)).toBe(s);
  });

  it('strips a single null byte', () => {
    expect(sanitizeText('hello\u0000world')).toBe('helloworld');
  });

  it('strips multiple null bytes including leading and trailing', () => {
    expect(sanitizeText('\u0000a\u0000b\u0000')).toBe('ab');
  });

  it('preserves valid surrogate pairs (emoji, astral plane)', () => {
    expect(sanitizeText('track 🎵 name')).toBe('track 🎵 name');
    expect(sanitizeText('𝕳𝖊𝖑𝖑𝖔')).toBe('𝕳𝖊𝖑𝖑𝖔');
  });

  it('preserves non-ASCII characters (accented, CJK, RTL)', () => {
    expect(sanitizeText('Björk — Jóga')).toBe('Björk — Jóga');
    expect(sanitizeText('東京')).toBe('東京');
    expect(sanitizeText('مرحبا')).toBe('مرحبا');
  });

  it('replaces unpaired high surrogate with U+FFFD', () => {
    expect(sanitizeText('bad \uD800 data')).toBe('bad \uFFFD data');
  });

  it('replaces unpaired low surrogate with U+FFFD', () => {
    expect(sanitizeText('bad \uDC00 data')).toBe('bad \uFFFD data');
  });

  it('replaces unpaired surrogates and strips null bytes together', () => {
    expect(sanitizeText('a\u0000b\uD800c')).toBe('ab\uFFFDc');
  });
});

describe('scrubStringFields', () => {
  it('scrubs null bytes from string fields', () => {
    const input = { title: 'bad\u0000title', year: 2008, codec: null };
    expect(scrubStringFields(input)).toEqual({ title: 'badtitle', year: 2008, codec: null });
  });

  it('returns the original reference when nothing changed', () => {
    const input = { title: 'clean', year: 2008 };
    expect(scrubStringFields(input)).toBe(input);
  });

  it('preserves non-string values exactly', () => {
    const date = new Date('2024-01-01');
    const input = { title: 'x\u0000', addedAt: date, size: 1234n, active: true, tags: ['a'] };
    const out = scrubStringFields(input);
    expect(out.addedAt).toBe(date);
    expect(out.size).toBe(1234n);
    expect(out.active).toBe(true);
    expect(out.tags).toBe(input.tags);
    expect(out.title).toBe('x');
  });
});
