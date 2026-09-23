import morphdom from 'morphdom';
import { useEffect, useRef } from 'react';
import { MARKUP_CSS, renderHtml } from '@markup-lang/html';
import { elementForLine, lineForOffset, offsetForLine } from '@markup-lang/html/scroll-sync';
import { useAppState, useWorkbench } from '../context.ts';
import { editor } from '../editor/controller.ts';
import { dirname, join, normalize } from '../fs/types.ts';
import { scrollBus } from '../lib/scroll-bus.ts';
import { resolvedTheme } from '../state/settings.ts';

const PREVIEW_CSS = `
:host { display: block; height: 100%; overflow: auto; }
:host([data-theme="dark"]) { background: #16181d; }
:host([data-theme="light"]) { background: #ffffff; }
.markup-body { min-height: 100%; box-sizing: border-box; padding: 36px 40px 30vh; }
.markup-body :where(a) { cursor: pointer; }
.mu-flash { outline: 2px solid color-mix(in srgb, var(--mu-accent) 45%, transparent); outline-offset: 4px; border-radius: 4px; }
${MARKUP_CSS}
`;

const ABSOLUTE = /^[a-z][a-z0-9+.-]*:/i;

/**
 * Renders the active document into a shadow root (the document's CSS cannot leak
 * into the app, or the app's into it) and patches it with morphdom, so scroll
 * position, open <details> and selected tabs survive every keystroke.
 */
export function PreviewPane() {
  const { wb } = useWorkbench();
  const host = useRef<HTMLDivElement>(null);
  const main = useRef<HTMLElement | null>(null);
  const active = useAppState((s) => s.active);
  const content = useAppState((s) => (s.active ? s.docs[s.active]?.content : undefined));
  // Always explicit: the preview must follow the app theme, not the operating system.
  const theme = useAppState((s) =>
    s.settings.previewTheme === 'app' ? resolvedTheme(s.settings) : s.settings.previewTheme,
  );

  // Shadow root, styles and event handling — once.
  useEffect(() => {
    const el = host.current!;
    const root = el.shadowRoot ?? el.attachShadow({ mode: 'open' });
    root.innerHTML = `<style>${PREVIEW_CSS}</style><main class="markup-body"></main>`;
    const body = root.querySelector('main')!;
    main.current = body;

    const onScroll = () => {
      if (!wb.state.settings.scrollSync) return;
      const line = lineForOffset(body, el.scrollTop - body.offsetTop + 12);
      if (line !== null) scrollBus.publish('preview', line);
    };
    const unsubscribe = scrollBus.subscribe('preview', (line) => {
      if (!wb.state.settings.scrollSync) return;
      const offset = offsetForLine(body, line);
      if (offset !== null) el.scrollTop = Math.max(0, offset + body.offsetTop - 12);
    });
    const onClick = (event: Event) => {
      const anchor = (event.target as HTMLElement).closest('a');
      const href = anchor?.getAttribute('href');
      if (!anchor || !href) return;
      event.preventDefault();
      if (href.startsWith('#')) {
        root
          .getElementById(decodeURIComponent(href.slice(1)))
          ?.scrollIntoView({ block: 'start', behavior: 'smooth' });
      } else if (ABSOLUTE.test(href)) {
        void wb.fs.openExternal(href);
      } else if (wb.state.active) {
        void wb.openRelative(wb.state.active, href);
      }
    };
    const onDoubleClick = (event: Event) => {
      const target = (event.target as HTMLElement).closest<HTMLElement>('[data-line]');
      if (!target) return;
      const line = Number(target.dataset.line);
      const flash = elementForLine(body, line);
      flash?.classList.add('mu-flash');
      setTimeout(() => flash?.classList.remove('mu-flash'), 700);
      if (wb.state.view === 'preview') wb.setView('split');
      requestAnimationFrame(() => editor.gotoLine(line));
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    root.addEventListener('click', onClick);
    root.addEventListener('dblclick', onDoubleClick);
    return () => {
      unsubscribe();
      el.removeEventListener('scroll', onScroll);
      root.removeEventListener('click', onClick);
      root.removeEventListener('dblclick', onDoubleClick);
    };
  }, [wb]);

  // Render, debounced in proportion to the document size.
  useEffect(() => {
    const body = main.current;
    if (!body || !active || content === undefined) return;
    const delay = content.length < 20_000 ? 30 : Math.min(300, content.length / 1000);
    const timer = setTimeout(() => {
      const analysis = wb.service.analyze(content, active);
      const html = renderHtml(analysis.document, {
        sourcePositions: true,
        rewriteUrl: (url, kind) => {
          if (kind !== 'image' || ABSOLUTE.test(url) || url.startsWith('#') || url.startsWith('//'))
            return url;
          return (
            wb.fs.fileUrl(normalize(join(dirname(active), decodeURI(url.split(/[?#]/)[0]!)))) ?? url
          );
        },
      });
      const next = document.createElement('main');
      next.className = 'markup-body';
      next.dataset.theme = theme;
      next.innerHTML = html;
      morphdom(body, next, {
        onBeforeElUpdated(from, to) {
          if (
            from instanceof HTMLDetailsElement &&
            to instanceof HTMLDetailsElement &&
            !to.hasAttribute('open')
          )
            to.open = from.open;
          if (
            from instanceof HTMLInputElement &&
            to instanceof HTMLInputElement &&
            from.type === 'radio'
          )
            to.checked = from.checked;
          return !from.isEqualNode(to);
        },
      });
    }, delay);
    return () => clearTimeout(timer);
  }, [wb, active, content, theme]);

  // A newly opened document starts at the top.
  useEffect(() => {
    if (host.current) host.current.scrollTop = 0;
  }, [active]);

  return <div ref={host} className="preview-host" data-theme={theme} />;
}
