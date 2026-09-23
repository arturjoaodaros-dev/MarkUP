import { describe, expect, it } from 'vitest';
import { parse } from '@markup-lang/core';
import { markupToHtml } from '@markup-lang/html';
import { renderText } from '@markup-lang/text';
import { getCompletions, LanguageService } from '@markup-lang/language-service';
import video from './video.mjs';

const plugins = [video];

describe('the video plugin', () => {
  it('validates attributes with the spec', () => {
    const codes = (source: string) => parse(source, { plugins }).diagnostics.map((d) => d.code);
    expect(codes('::video{youtube=dQw4w9WgXcQ}')).toEqual([]);
    expect(codes('::video{youtube=short}')).toEqual(['MU2004']);
    expect(codes('::video')).toEqual(['MU2005']);
    expect(codes('::video{youtube=dQw4w9WgXcQ vimeo=1}')).toEqual(['MU2005']);
    expect(codes(':::video\n:::')).toContain('MU2002');
  });

  it('renders HTML and text', () => {
    const { html } = markupToHtml('::video[Demo]{youtube=dQw4w9WgXcQ start=30 .wide}', { plugins });
    expect(html).toContain('<figure class="mu-video wide">');
    expect(html).toContain('src="https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?start=30"');
    expect(html).toContain('<figcaption>Demo</figcaption>');
    expect(renderText(parse('::video[Demo]{vimeo=1}', { plugins }).document, { plugins })).toBe(
      '[Video: Demo]',
    );
  });

  it('is offered by editor completion', () => {
    const service = new LanguageService({ plugins });
    expect(getCompletions(service.analyze('::vi'), 4)?.items.map((i) => i.label)).toContain(
      'video',
    );
  });
});
