/**
 * Script detection is a real capability, so it gets real tests — including the
 * case where it is honest about not knowing.
 */

import { describe, expect, it } from 'vitest';

import { detectScript } from '@/lib/detectScript';

describe('detectScript', () => {
  it.each([
    ['English', 'Can we patent this formulation?', 'en'],
    ['Telugu', 'మా ఆయుర్వేద ఉత్పత్తులను ఎగుమతి చేయాలంటే ఏమి కావాలి?', 'te'],
    ['Tamil', 'எங்கள் மூலிகைப் பொருளுக்கு உரிமம் தேவையா?', 'ta'],
    ['Bengali', 'আমাদের পণ্যের লেবেলে কী লেখা যাবে?', 'bn'],
  ])('reads %s from its script', (_name, text, expected) => {
    const result = detectScript(text);
    expect(result.decided).toBe(true);
    expect(result.language).toBe(expected);
    expect(result.ambiguousWith).toEqual([]);
  });

  it('reports the ambiguity it cannot resolve rather than guessing', () => {
    // Devanagari carries both Hindi and Marathi. Counting code points cannot
    // separate them, and pretending otherwise would be a confident wrong answer.
    const result = detectScript('हमारे ब्रांड नाम को कैसे सुरक्षित कर सकते हैं?');
    expect(result.language).toBe('hi');
    expect(result.ambiguousWith).toEqual(['mr']);
  });

  it('says nothing at all when there is not enough to go on', () => {
    for (const text of ['', '  ', 'a', '?!']) {
      expect(detectScript(text).decided, JSON.stringify(text)).toBe(false);
    }
  });

  it('picks the dominant script in mixed text rather than the first character', () => {
    const result = detectScript('Ayurveda ఆయుర్వేద ఉత్పత్తులను ఎగుమతి చేయాలంటే ఏమి కావాలి');
    expect(result.language).toBe('te');
    expect(result.confidence).toBeGreaterThan(0.5);
  });

  it('reports confidence as the share of letters in the winning script', () => {
    expect(detectScript('Can we patent this?').confidence).toBe(1);
  });
});
