// MarkUP documentation site: mobile navigation, copy buttons, table-of-contents
// tracking and search. The pages work without it.
(() => {
  const body = document.body;
  const root = body.dataset.root || './';

  // Navigation drawer on small screens.
  const menu = document.querySelector('.menu-button');
  const sidebar = document.getElementById('sidebar');
  const setNav = (open) => {
    body.classList.toggle('nav-open', open);
    menu.setAttribute('aria-expanded', String(open));
  };
  menu.addEventListener('click', () => setNav(!body.classList.contains('nav-open')));
  document.addEventListener('click', (event) => {
    if (
      body.classList.contains('nav-open') &&
      !sidebar.contains(event.target) &&
      !menu.contains(event.target)
    )
      setNav(false);
  });

  // Show the current page in a long sidebar.
  const current = sidebar.querySelector('[aria-current="page"]');
  if (current && current.offsetTop > sidebar.clientHeight - 80)
    sidebar.scrollTop = current.offsetTop - sidebar.clientHeight / 2;

  // Copy buttons on code blocks (not on rendered example output).
  for (const pre of document.querySelectorAll('.markup-body pre')) {
    if (pre.closest('.example-result')) continue;
    const code = pre.querySelector('code') || pre;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'copy-button';
    button.textContent = 'Copy';
    button.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(code.innerText.replace(/\n$/, ''));
        button.textContent = 'Copied';
      } catch {
        button.textContent = 'Copy failed';
      }
      setTimeout(() => (button.textContent = 'Copy'), 1500);
    });
    pre.append(button);
  }

  // Highlight the section being read in "On this page".
  const tocLinks = [...document.querySelectorAll('.toc a')];
  const headings = tocLinks.map((a) => document.getElementById(decodeURIComponent(a.hash.slice(1))));
  let frame = 0;
  const track = () => {
    frame = 0;
    let active = 0;
    headings.forEach((h, i) => {
      if (h && h.getBoundingClientRect().top < 120) active = i;
    });
    tocLinks.forEach((a, i) => a.classList.toggle('is-active', i === active));
  };
  if (tocLinks.length) {
    addEventListener('scroll', () => (frame ||= requestAnimationFrame(track)), { passive: true });
    track();
  }

  // Search over sections of every page (assets/search.json, loaded on first use).
  const input = document.querySelector('.search-input');
  const results = document.querySelector('.search-results');
  let index = null;
  let loading = null;
  let selected = -1;
  const load = () =>
    (loading ||= fetch(`${root}assets/search.json`)
      .then((r) => r.json())
      .then((data) => (index = data))
      .catch(() => (index = [])));

  const search = (query) => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length || !index) return [];
    const scored = [];
    for (const entry of index) {
      const section = entry.s.toLowerCase();
      const title = entry.t.toLowerCase();
      const text = entry.x.toLowerCase();
      let score = 0;
      for (const word of words) {
        const s = (section.includes(word) ? 10 : 0) + (title.includes(word) ? 4 : 0) + (text.includes(word) ? 1 : 0);
        if (!s) {
          score = 0;
          break;
        }
        score += s;
      }
      if (score) scored.push({ entry, score, word: words[0] });
    }
    return scored.sort((a, b) => b.score - a.score).slice(0, 12);
  };

  const snippet = (text, word) => {
    const at = text.toLowerCase().indexOf(word);
    if (at < 0) return text.slice(0, 160);
    const start = Math.max(0, at - 50);
    return (start ? '…' : '') + text.slice(start, start + 180);
  };

  const select = (i) => {
    const items = results.querySelectorAll('.search-result');
    selected = Math.max(-1, Math.min(i, items.length - 1));
    items.forEach((item, n) => item.classList.toggle('is-selected', n === selected));
    items[selected]?.scrollIntoView({ block: 'nearest' });
  };

  const show = () => {
    const query = input.value.trim();
    results.replaceChildren();
    selected = -1;
    if (!query) {
      results.hidden = true;
      return;
    }
    const found = search(query);
    for (const { entry, word } of found) {
      const a = document.createElement('a');
      a.className = 'search-result';
      a.href = root + entry.p;
      const title = document.createElement('span');
      title.className = 'search-result-title';
      title.textContent = entry.s && entry.s !== entry.t ? `${entry.t} › ${entry.s}` : entry.t;
      const text = document.createElement('span');
      text.className = 'search-result-text';
      text.textContent = snippet(entry.x, word);
      a.append(title, text);
      results.append(a);
    }
    if (!found.length) {
      const empty = document.createElement('p');
      empty.className = 'search-empty';
      empty.textContent = index ? `No results for “${query}”.` : 'Loading…';
      results.append(empty);
    }
    results.hidden = false;
  };

  input.addEventListener('focus', load);
  input.addEventListener('input', async () => {
    show();
    if (!index) {
      await load();
      show();
    }
  });
  input.addEventListener('keydown', (event) => {
    const items = results.querySelectorAll('.search-result');
    if (event.key === 'ArrowDown') select(selected + 1);
    else if (event.key === 'ArrowUp') select(selected - 1);
    else if (event.key === 'Enter' && items.length) location.href = items[Math.max(selected, 0)].href;
    else if (event.key === 'Escape') {
      input.value = '';
      show();
      input.blur();
    } else return;
    event.preventDefault();
  });
  document.addEventListener('click', (event) => {
    if (!event.target.closest('.search')) results.hidden = true;
  });
  document.addEventListener('keydown', (event) => {
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName ?? '');
    if (event.key === '/' && !typing && !event.ctrlKey && !event.metaKey) {
      event.preventDefault();
      input.focus();
    } else if (event.key === 'Escape' && body.classList.contains('nav-open')) setNav(false);
  });
})();
