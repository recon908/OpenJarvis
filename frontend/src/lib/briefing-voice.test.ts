import { describe, expect, it } from 'vitest';
import { composeBriefingSpeech } from './briefing-voice';
import type { Briefing } from './briefing';

const at = (h: number, m: number) => new Date(2026, 10, 26, h, m);

describe('composeBriefingSpeech', () => {
  it('reads pending priorities in order and skips done ones', () => {
    const b: Briefing = {
      priority: {
        items: [
          { id: 'a', tag: '13:00', title: '출고' },
          { id: 'b', title: '방문', done: true },
          { id: 'c', title: '금리 소식' },
        ],
      },
    };
    const text = composeBriefingSpeech(b, at(9, 5), (i) => !!i.done);
    expect(text).toContain('좋은 아침입니다');
    expect(text).toContain('지금은 9시 5분입니다');
    expect(text).toContain('오늘 챙길 일은 2건입니다. 첫째, 13:00, 출고. 둘째, 금리 소식.');
    expect(text).not.toContain('방문');
  });

  it('honours the dashboard checks over the file', () => {
    const b: Briefing = { priority: { items: [{ id: 'a', title: '출고' }] } };
    expect(composeBriefingSpeech(b, at(14, 0), () => true)).toContain('모두 끝났습니다');
  });

  it('uses the speech Claude wrote when present', () => {
    expect(composeBriefingSpeech({ speech: '직접 쓴 문장' }, at(9, 0), () => false)).toBe('직접 쓴 문장');
  });

  it('says there is no briefing yet', () => {
    expect(composeBriefingSpeech(null, at(20, 0), () => false)).toContain('아직 오늘 브리핑이 없습니다');
  });
});
