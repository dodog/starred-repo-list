// ==UserScript==
// @name         GitHub Starred Repos List
// @description  Adds a button on GitHub that lists all your starred repositories (name + link).
// @namespace    https://github.com/
// @version      1.0
// @homepage     https://github.com/dodog/starred-repo-list/
// @author       Jozef Gaal
// @match        https://github.com/*
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  const getLogin = () => {
    const meta = document.querySelector('meta[name="user-login"]');
    return meta && meta.content ? meta.content : null;
  };

  async function fetchAllStars(login) {
    const repos = [];
    for (let page = 1; ; page++) {
      const res = await fetch(
        `https://api.github.com/users/${login}/starred?per_page=100&page=${page}`,
        { headers: { Accept: 'application/vnd.github+json' } }
      );
      if (!res.ok) {
        throw new Error(`GitHub API error ${res.status} (rate limit is 60 requests/hour when unauthenticated)`);
      }
      const data = await res.json();
      repos.push(...data.map(r => ({ name: r.full_name, url: r.html_url })));
      if (data.length < 100) break;
    }
    return repos;
  }

  const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours
  const cacheKey = login => `starred-list-cache:${login}`;

  function readCache(login) {
    try {
      const c = JSON.parse(localStorage.getItem(cacheKey(login)));
      return c && Array.isArray(c.repos) ? c : null;
    } catch (e) {
      return null;
    }
  }

  function writeCache(login, repos) {
    try {
      localStorage.setItem(cacheKey(login), JSON.stringify({ time: Date.now(), repos }));
    } catch (e) { /* storage full or blocked: just skip caching */ }
  }

  async function getStars(login, force) {
    const cached = readCache(login);
    if (!force && cached && Date.now() - cached.time < CACHE_TTL) {
      return { repos: cached.repos, time: cached.time };
    }
    const repos = await fetchAllStars(login);
    writeCache(login, repos);
    return { repos, time: Date.now() };
  }

  function ago(time) {
    const m = Math.round((Date.now() - time) / 60000);
    if (m < 1) return 'just now';
    if (m < 60) return `${m} min ago`;
    const h = Math.round(m / 60);
    return h < 24 ? `${h} h ago` : `${Math.round(h / 24)} d ago`;
  }

  let backdrop = null;

  function onKey(e) {
    if (e.key === 'Escape') closePanel();
  }

  function closePanel() {
    if (backdrop) {
      backdrop.remove();
      backdrop = null;
    }
    document.removeEventListener('keydown', onKey, true);
  }

  function showPanel(content) {
    closePanel();

    backdrop = document.createElement('div');
    backdrop.id = 'starred-list-panel';
    backdrop.style.cssText = 'position:fixed; inset:0; z-index:99999; background:rgba(0,0,0,.4);';
    backdrop.addEventListener('mousedown', e => {
      if (e.target === backdrop) closePanel();
    });

    const panel = document.createElement('div');
    panel.style.cssText = `
      position: absolute; top: 5%; left: 50%; transform: translateX(-50%);
      width: min(700px, 90vw); max-height: 85vh; overflow: auto;
      background: var(--bgColor-default, #fff); color: var(--fgColor-default, #1f2328);
      border: 1px solid var(--borderColor-default, #d0d7de); border-radius: 8px;
      box-shadow: 0 8px 30px rgba(0,0,0,.3); font-size: 14px;
    `;
    panel.appendChild(content);
    backdrop.appendChild(panel);
    document.body.appendChild(backdrop);
    document.addEventListener('keydown', onKey, true);
    return panel;
  }

  async function run(force = false) {
    const login = getLogin();
    if (!login) {
      alert('Could not detect your GitHub username. Are you logged in?');
      return;
    }

    const loading = document.createElement('div');
    loading.textContent = 'Loading starred repositories…';
    loading.style.padding = '16px';
    const panel = showPanel(loading);

    try {
      const { repos, time } = await getStars(login, force);
      const repoName = r => r.name.split('/')[1];
      repos.sort((a, b) => repoName(a).localeCompare(repoName(b), undefined, { sensitivity: 'base' }));
      let shown = repos;
      const items = [];
      const wrap = document.createElement('div');

      const header = document.createElement('div');
      header.style.cssText = 'display:flex; gap:8px; align-items:center; margin-bottom:12px;';
      const title = document.createElement('strong');
      title.textContent = `${repos.length} starred repositories`;
      title.style.flex = '1';

      const copyBtn = document.createElement('button');
      copyBtn.textContent = 'Copy as text';
      copyBtn.className = 'btn btn-sm';
      copyBtn.onclick = async () => {
        await navigator.clipboard.writeText(shown.map(r => `${r.name} - ${r.url}`).join('\n'));
        copyBtn.textContent = 'Copied!';
        setTimeout(() => (copyBtn.textContent = 'Copy as text'), 1500);
      };

      const age = document.createElement('span');
      age.textContent = `updated ${ago(time)}`;
      age.style.cssText = 'color:#8b949e; font-size:12px;';

      const refreshBtn = document.createElement('button');
      refreshBtn.textContent = 'Refresh';
      refreshBtn.className = 'btn btn-sm';
      refreshBtn.onclick = () => run(true);

      const closeBtn = document.createElement('button');
      closeBtn.textContent = 'Close';
      closeBtn.className = 'btn btn-sm';
      closeBtn.onclick = closePanel;

      header.append(title, age, refreshBtn, copyBtn, closeBtn);

      const list = document.createElement('ul');
      list.style.cssText = 'margin:0; padding:0 16px 16px 36px; line-height:1.7;';
      for (const r of repos) {
        const li = document.createElement('li');
        const a = document.createElement('a');
        a.href = r.url;
        a.textContent = repoName(r);
        a.style.fontWeight = '600';
        a.target = '_blank';
        a.rel = 'noopener';
        const full = document.createElement('span');
        full.textContent = r.name;
        full.style.cssText = 'color:#8b949e; margin-left:8px; font-size:12px;';
        li.append(a, full);
        list.appendChild(li);
        items.push({ li, r });
      }

      const search = document.createElement('input');
      search.type = 'search';
      search.placeholder = 'Search repos… (Esc to close)';
      search.style.cssText = 'width:100%; box-sizing:border-box; margin-bottom:12px; padding:6px 10px;';
      search.addEventListener('input', () => {
        const terms = search.value.toLowerCase().split(/\s+/).filter(Boolean);
        shown = [];
        for (const { li, r } of items) {
          const hay = r.name.toLowerCase();
          const match = terms.every(t => hay.includes(t));
          li.style.display = match ? '' : 'none';
          if (match) shown.push(r);
        }
        title.textContent = terms.length
          ? `${shown.length} of ${repos.length} starred repositories`
          : `${repos.length} starred repositories`;
      });
      const top = document.createElement('div');
      top.style.cssText = `
        position: sticky; top: 0; z-index: 1; padding: 16px 16px 4px;
        background: var(--bgColor-default, #fff);
      `;
      top.append(header, search);

      wrap.append(top, list);
      panel.replaceChildren(wrap);
      search.focus();
    } catch (err) {
      loading.textContent = `Error: ${err.message}`;
    }
  }

  function addButton() {
    if (document.getElementById('starred-list-btn')) return;
    const btn = document.createElement('button');
    btn.id = 'starred-list-btn';
    btn.textContent = '★ List my stars';
    btn.className = 'btn btn-primary';
    btn.style.cssText = 'position:fixed; bottom:16px; right:16px; z-index:99998;';
    btn.onclick = () => run(false);
    document.body.appendChild(btn);
  }

  addButton();
  document.addEventListener('turbo:load', addButton);
})();
