/**
 * A complete MarkUP plugin: a `video` component for YouTube and Vimeo embeds.
 *
 *   ::video{youtube=dQw4w9WgXcQ}
 *   ::video[Launch keynote]{vimeo=76979871 start=30}
 *
 * Load it with `markup render doc.markup --plugin examples/plugins/video.mjs`
 * or list it in markup.config.json.
 */
import { definePlugin, defineDirective, s } from '@markup-lang/core';

const video = defineDirective({
  name: 'video',
  forms: ['leaf'],
  category: 'content',
  description: 'An embedded YouTube or Vimeo video, loaded without tracking cookies.',
  label: { use: 'optional', description: 'Caption and accessible title.' },
  attributes: {
    youtube: s.string({
      optional: true,
      pattern: /^[\w-]{11}$/,
      patternLabel: 'an 11-character YouTube id',
      description: 'YouTube video id.',
    }),
    vimeo: s.string({
      optional: true,
      pattern: /^\d+$/,
      patternLabel: 'a numeric Vimeo id',
      description: 'Vimeo video id.',
    }),
    start: s.number({
      integer: true,
      min: 0,
      optional: true,
      description: 'Start time in seconds.',
    }),
  },
  examples: [{ source: '::video[A short demo]{youtube=dQw4w9WgXcQ}' }],
  snippet: '::video[${1:Caption}]{youtube=${2:id}}',
  validate(node, ctx) {
    const values = node.attributes?.values ?? {};
    const count = ['youtube', 'vimeo'].filter((key) => key in values).length;
    if (count !== 1) {
      ctx.report('MU2005', node.nameRange, 'A video needs exactly one of `youtube` or `vimeo`.');
    }
  },
});

export default definePlugin({
  name: 'video',
  directives: [video],
  renderers: {
    html: {
      video(node, ctx) {
        const props = ctx.props(node);
        const start = typeof props.start === 'number' ? props.start : 0;
        const src =
          typeof props.youtube === 'string'
            ? `https://www.youtube-nocookie.com/embed/${encodeURIComponent(props.youtube)}${start ? `?start=${start}` : ''}`
            : `https://player.vimeo.com/video/${encodeURIComponent(String(props.vimeo))}?dnt=1${start ? `#t=${start}s` : ''}`;
        const title = ctx.labelText(node) || 'Video';
        const caption = ctx.label(node);
        return (
          `<figure${ctx.rootAttributes(node, ['mu-video'])}>` +
          `<div style="position:relative;aspect-ratio:16/9"><iframe src="${ctx.escape(src)}" title="${ctx.escape(title)}" style="position:absolute;inset:0;width:100%;height:100%;border:0;border-radius:8px" loading="lazy" allow="fullscreen; picture-in-picture"></iframe></div>` +
          (caption ? `<figcaption>${caption}</figcaption>` : '') +
          '</figure>\n'
        );
      },
    },
    text: {
      video: (node, ctx) => `[Video${ctx.label(node) ? `: ${ctx.label(node)}` : ''}]`,
    },
  },
});
