import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { readFileSync, watch } from 'node:fs';
import { createServer, type Server, type ServerResponse } from 'node:http';
import { basename, dirname, extname, join, normalize, sep } from 'node:path';
import { parse, type MarkupPlugin } from '@markup-lang/core';
import { escapeHtml, renderDocument } from '@markup-lang/html';
import { display, paint, type Io } from './support.ts';

export interface PreviewOptions {
  file: string;
  port: number;
  open: boolean;
  theme: 'light' | 'dark' | 'auto';
  plugins: readonly MarkupPlugin[];
  io: Io;
}

const MIME: Record<string, string> = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.svg': 'image/svg+xml',
  '.webp': 'image/webp', '.avif': 'image/avif', '.ico': 'image/x-icon', '.css': 'text/css', '.txt': 'text/plain; charset=utf-8',
  '.pdf': 'application/pdf', '.mp4': 'video/mp4', '.webm': 'video/webm', '.woff2': 'font/woff2',
};

const CLIENT = `<script>
(() => {
  const key = 'markup-preview-scroll';
  const saved = sessionStorage.getItem(key);
  if (saved) { sessionStorage.removeItem(key); requestAnimationFrame(() => scrollTo(0, Number(saved))); }
  const events = new EventSource('/__markup/events');
  events.onmessage = (e) => { if (e.data === 'reload') { sessionStorage.setItem(key, String(scrollY)); location.reload(); } };
})();
</script>`;

export function renderPreviewPage(source: string, options: Pick<PreviewOptions, 'theme' | 'plugins'> & { title: string }): string {
  const { document, diagnostics } = parse(source, { plugins: options.plugins });
  let html = renderDocument(document, { plugins: options.plugins, theme: options.theme, title: options.title });
  const problems = diagnostics.filter((d) => d.severity === 'error' || d.severity === 'warning');
  let overlay = '';
  if (problems.length > 0) {
    const items = problems
      .slice(0, 50)
      .map((d) => `<li><b style="color:${d.severity === 'error' ? '#dc2626' : '#b45309'}">${d.range.start.line}:${d.range.start.column}</b> ${escapeHtml(d.message)} <span style="opacity:.6">${d.code}</span></li>`)
      .join('');
    overlay = `<details style="position:fixed;left:16px;bottom:16px;max-width:min(680px,calc(100vw - 32px));max-height:40vh;overflow:auto;background:#1d2027;color:#e6e8ec;border-radius:10px;padding:10px 14px;font:13px/1.5 ui-sans-serif,system-ui,sans-serif;box-shadow:0 8px 30px rgba(0,0,0,.25);z-index:9"><summary style="cursor:pointer">${problems.length} problem${problems.length === 1 ? '' : 's'} in this document</summary><ul style="margin:8px 0 0;padding-left:18px">${items}</ul></details>`;
  }
  html = html.replace('</body>', `${overlay}${CLIENT}\n</body>`);
  return html;
}

export async function startPreview(options: PreviewOptions): Promise<Server> {
  const { file, io } = options;
  const root = dirname(file);
  const clients = new Set<ServerResponse>();
  const c = paint(io);

  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (url.pathname === '/__markup/events') {
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' });
      res.write(': connected\n\n');
      clients.add(res);
      req.on('close', () => clients.delete(res));
      return;
    }
    if (url.pathname === '/' || url.pathname === '/index.html') {
      try {
        const source = await readFile(file, 'utf8');
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
        res.end(renderPreviewPage(source, { ...options, title: basename(file) }));
      } catch (error) {
        res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
        res.end(`Cannot read ${file}: ${error instanceof Error ? error.message : String(error)}`);
      }
      return;
    }
    // Static files next to the document (images…), never outside its folder.
    let decoded: string;
    try {
      decoded = decodeURIComponent(url.pathname);
    } catch {
      res.writeHead(400).end();
      return;
    }
    const target = normalize(join(root, decoded));
    if (target !== root && !target.startsWith(root + sep)) {
      res.writeHead(403).end();
      return;
    }
    try {
      const data = await readFile(target);
      res.writeHead(200, { 'content-type': MIME[extname(target).toLowerCase()] ?? 'application/octet-stream' });
      res.end(data);
    } catch {
      res.writeHead(404, { 'content-type': 'text/plain' }).end('Not found');
    }
  });

  const port = await listen(server, options.port);
  let timer: NodeJS.Timeout | undefined;
  const watcher = watch(root, (_event, name) => {
    if (name && basename(String(name)) !== basename(file) && !MIME[extname(String(name)).toLowerCase()]) return;
    clearTimeout(timer);
    timer = setTimeout(() => {
      for (const client of clients) client.write('data: reload\n\n');
      try {
        const { diagnostics } = parse(readFileSync(file, 'utf8'), { plugins: options.plugins });
        const errors = diagnostics.filter((d) => d.severity === 'error').length;
        io.stdout(`${c.gray(new Date().toLocaleTimeString())} ${errors ? c.red(`reloaded with ${errors} error${errors === 1 ? '' : 's'}`) : c.green('reloaded')}\n`);
      } catch {
        // The file may be mid-save; the next event will report.
      }
    }, 60);
  });
  server.on('close', () => watcher.close());

  const address = `http://localhost:${port}`;
  io.stdout(`${c.green('●')} Previewing ${c.bold(display(file, io.cwd))} at ${c.cyan(address)} ${c.gray('(Ctrl+C to stop)')}\n`);
  if (options.open) openBrowser(address);
  return server;
}

function listen(server: Server, port: number, attempts = 10): Promise<number> {
  return new Promise((resolve, reject) => {
    const tryPort = (p: number, left: number) => {
      server.once('error', (error: NodeJS.ErrnoException) => {
        if (error.code === 'EADDRINUSE' && left > 0) tryPort(p + 1, left - 1);
        else reject(error);
      });
      server.listen(p, '127.0.0.1', () => {
        const address = server.address();
        resolve(typeof address === 'object' && address ? address.port : p);
      });
    };
    tryPort(port, attempts);
  });
}

function openBrowser(url: string): void {
  const [command, args] =
    process.platform === 'win32' ? ['cmd', ['/c', 'start', '""', url]] : process.platform === 'darwin' ? ['open', [url]] : ['xdg-open', [url]];
  spawn(command, args, { stdio: 'ignore', detached: true }).unref();
}
