// ==UserScript==
// @name         GitHub Starred Repos List
// @description  Adds a button on GitHub that lists all your starred repositories (name + link).
// @namespace    https://github.com/
// @version      1.1
// @homepage     https://github.com/dodog/starred-repo-list/
// @author       Jozef Gaal
// @match        https://github.com/*
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  const TTL = 3 * 24 * 60 * 60 * 1000; // cache lifetime 3 days
  const GREY = 'color:#8b949e;';
  const short = r => r.name.split('/')[1]; // repo name without owner
  const h = (tag, props, ...kids) => {
    const e = Object.assign(document.createElement(tag), props);
    e.append(...kids);
    return e;
  };
  const ago = t => {
    const m = Math.round((Date.now() - t) / 60000);
    return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`;
  };

  async function fetchStars(login) {
    const repos = [];
    for (let page = 1; ; page++) {
      const res = await fetch(`https://api.github.com/users/${login}/starred?per_page=100&page=${page}`);
      if (!res.ok) throw new Error(`GitHub API error ${res.status}`);
      const data = await res.json();
      repos.push(...data.map(r => ({ name: r.full_name, url: r.html_url })));
      if (data.length < 100) return repos;
    }
  }

  async function getStars(login, force) {
    const key = `starred-list-cache:${login}`;
    try {
      const c = JSON.parse(localStorage.getItem(key));
      if (!force && c && Date.now() - c.time < TTL) return c;
    } catch (e) {}
    const c = { time: Date.now(), repos: await fetchStars(login) };
    try { localStorage.setItem(key, JSON.stringify(c)); } catch (e) {}
    return c;
  }

  let overlay;
  const close = () => { overlay?.remove(); overlay = null; };
  document.addEventListener('keydown', e => e.key === 'Escape' && close(), true);

  async function run(force) {
    const login = document.querySelector('meta[name="user-login"]')?.content;
    if (!login) return alert('Could not detect your GitHub username. Are you logged in?');

    close();
    const panel = h('div', {
      style: `position:absolute; top:5%; left:50%; transform:translateX(-50%); width:min(700px,90vw);
        max-height:85vh; overflow:auto; font-size:14px; border-radius:8px; box-shadow:0 8px 30px rgba(0,0,0,.3);
        background:var(--bgColor-default,#fff); color:var(--fgColor-default,#1f2328);
        border:1px solid var(--borderColor-default,#d0d7de);`,
    }, h('div', { style: 'padding:16px', textContent: 'Loading starred repositories…' }));
    overlay = h('div', { style: 'position:fixed; inset:0; z-index:99999; background:rgba(0,0,0,.4);' }, panel);
    overlay.onmousedown = e => e.target === overlay && close(); // click outside closes
    document.body.append(overlay);

    try {
      const { time, repos: raw } = await getStars(login, force);
      const repos = [...raw].sort((a, b) => short(a).localeCompare(short(b), undefined, { sensitivity: 'base' }));
      let shown = repos;

      const title = h('strong', { style: 'flex:1' });
      const setTitle = n => (title.textContent = n === repos.length
        ? `${n} starred repositories` : `${n} of ${repos.length} starred repositories`);
      setTitle(repos.length);

      const copy = h('button', {
        className: 'btn btn-sm', textContent: 'Copy as text',
        onclick: async () => {
          await navigator.clipboard.writeText(shown.map(r => `${r.name} - ${r.url}`).join('\n'));
          copy.textContent = 'Copied!';
          setTimeout(() => (copy.textContent = 'Copy as text'), 1500);
        },
      });

      const items = repos.map(r => ({
        r,
        li: h('li', {},
          h('a', { href: r.url, textContent: short(r), target: '_blank', rel: 'noopener', style: 'font-weight:600' }),
          h('span', { textContent: r.name, style: GREY + 'margin-left:8px; font-size:12px' })),
      }));

      const search = h('input', {
        type: 'search', placeholder: 'Search repos…',
        style: 'width:100%; box-sizing:border-box; padding:6px 10px',
        oninput: () => {
          const terms = search.value.toLowerCase().split(/\s+/).filter(Boolean);
          shown = [];
          for (const { r, li } of items) {
            const ok = terms.every(t => r.name.toLowerCase().includes(t));
            li.style.display = ok ? '' : 'none';
            if (ok) shown.push(r);
          }
          setTitle(shown.length);
        },
      });

      const header = h('div', { style: 'display:flex; gap:8px; align-items:center; margin-bottom:12px' },
        title,
        h('span', { textContent: `updated ${ago(time)}`, style: GREY + 'font-size:12px' }),
        h('button', { className: 'btn btn-sm', textContent: 'Refresh', onclick: () => run(true) }),
        copy,
        h('button', { className: 'btn btn-sm', textContent: 'Close', onclick: close }));

      // header + search stay pinned while the list scrolls
      const top = h('div', { style: 'position:sticky; top:0; z-index:1; padding:16px 16px 12px; background:var(--bgColor-default,#fff)' }, header, search);
      const list = h('ul', { style: 'margin:0; padding:0 16px 16px 36px; line-height:1.7' }, ...items.map(i => i.li));

      panel.replaceChildren(top, list);
      search.focus();
    } catch (err) {
      panel.firstChild.textContent = `Error: ${err.message}`;
    }
  }

  // Button goes in front of GitHub's search box
  const btn = h('button', {
    className: 'btn btn-sm btn-primary', textContent: '★ List my stars',
    style: 'margin-right:8px; align-self:center; white-space:nowrap; flex-shrink:0',
    onclick: () => run(false),
  });
  const addButton = () => {
    const group = document.querySelector('[class*="searchButtonGroup"]');
    if (group && btn.nextElementSibling !== group) group.before(btn);
  };
  addButton();
  new MutationObserver(addButton).observe(document.body, { childList: true, subtree: true });
})();
