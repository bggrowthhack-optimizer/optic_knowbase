(function () {
  /* ─── Root URL detection ─────────────────────────────────────────────── */
  const scripts = document.querySelectorAll('script[src*="_sidebar.js"]');
  const scriptSrc = scripts[scripts.length - 1]?.src || '';
  const rootUrl = scriptSrc.substring(0, scriptSrc.lastIndexOf('/') + 1);
  const currentHref = window.location.href.split('?')[0].split('#')[0];
  const currentRel = currentHref.startsWith(rootUrl)
    ? currentHref.slice(rootUrl.length)
    : '';

  /* ─── Navigation tree ────────────────────────────────────────────────── */
  const NAV = [
    {
      items: [
        { title: 'База знаний', href: 'index.html', icon: 'home' },
      ],
    },
    {
      label: 'Разделы',
      items: [
        { title: 'Главная страница',          href: 'sections/main.html',               icon: 'layout' },
        { title: 'Результаты по филиалам',    href: 'sections/branches.html',           icon: 'building' },
        { title: 'Анализ филиала',            href: 'sections/analysis.html',           icon: 'chart' },
        { title: 'Карта врача',               href: 'sections/doctor-card.html',        icon: 'doctor-card' },
        { title: 'Карта консультанта',        href: 'sections/consultant-card.html',    icon: 'consultant-card' },
        { title: 'Динамика продаж',           href: 'sections/sales-dynamics.html',     icon: 'trending' },
        { title: 'Результаты сотрудников',    href: 'sections/employees.html',          icon: 'users' },
        { title: 'План задач на неделю',      href: 'sections/tasks.html',              icon: 'clipboard' },
        { title: 'Аудиобейджи',               href: 'sections/badges.html',             icon: 'mic' },
        { title: 'Мотивация',                 href: 'sections/motivation.html',         icon: 'ruble' },
        { title: 'Планёрка КД',              href: 'sections/meeting-plan.html',       icon: 'presentation' },
        { title: 'Речевая аналитика — колл-центр', href: 'sections/speech-callcenter.html', icon: 'phone' },
        { title: 'Активность',                href: 'sections/activity.html',           icon: 'activity' },
        { title: 'Пользователи',              href: 'sections/users.html',              icon: 'user-cog' },
        { title: 'Чат с AI',                  href: 'sections/chat.html',               icon: 'sparkles' },
      ],
    },
    {
      label: 'Инструкции',
      items: [
        { title: 'Декомпозиция плана продаж', href: 'guides/plan-decomposition.html', icon: 'guide', ready: true },
        { title: 'БП: РОП и КД',             href: 'sections/rop-kd-bp.html',        icon: 'guide', ready: true },
        { title: 'Работа с бейджами',         href: 'guides/badges-workflow.html',    icon: 'guide' },
        { title: 'Начало работы',             href: 'guides/getting-started.html',    icon: 'guide' },
      ],
    },
    {
      label: 'Справочники',
      items: [
        { title: 'Справочник метрик', href: 'reference/metrics.html', icon: 'book', ready: true },
        { title: 'Роли и доступы',   href: 'reference/roles.html',   icon: 'shield' },
        { title: 'Частые вопросы',   href: 'reference/faq.html',     icon: 'help' },
      ],
    },
  ];

  /* ─── Icons ──────────────────────────────────────────────────────────── */
  const IC = {
    home:         `<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>`,
    layout:       `<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>`,
    building:     `<rect x="4" y="2" width="16" height="20" rx="1"/><line x1="9" y1="7" x2="15" y2="7"/><line x1="9" y1="11" x2="15" y2="11"/><line x1="9" y1="15" x2="15" y2="15"/><line x1="9" y1="19" x2="12" y2="19"/>`,
    chart:        `<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>`,
    'doctor-card':     `<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="16" y1="11" x2="22" y2="11"/>`,
    'consultant-card': `<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 15c0 1.1-.9 2-2 2h-1l-2 2v-2h-1c-1.1 0-2-.9-2-2v-2c0-1.1.9-2 2-2h4c1.1 0 2 .9 2 2v2z"/>`,
    phone:        `<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.72 12a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.63 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 9.91a16 16 0 0 0 6.1 6.1l.98-.98a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>`,
    trending:     `<polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/>`,
    users:        `<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>`,
    clipboard:    `<path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/>`,
    mic:          `<path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/>`,
    ruble:        ``,
    presentation: `<path d="M2 3h20"/><path d="M21 3v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V3"/><path d="M7 21l5-5 5 5"/>`,
    'mic-2':      `<path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/>`,
    activity:     `<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>`,
    'user-cog':   `<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><circle cx="19" cy="11" r="2"/><path d="M23 11h-2m-1.5-2.5-.7.7M19 9V7m-1.5 5.5-.7-.7M15 11h2m1.5 2.5.7-.7"/>`,
    sparkles:     `<path d="M12 3l1.88 5.76a2 2 0 0 0 1.36 1.36L21 12l-5.76 1.88a2 2 0 0 0-1.36 1.36L12 21l-1.88-5.76a2 2 0 0 0-1.36-1.36L3 12l5.76-1.88a2 2 0 0 0 1.36-1.36z"/>`,
    guide:        `<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>`,
    book:         `<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>`,
    shield:       `<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><polyline points="9 12 11 14 15 10"/>`,
    help:         `<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/>`,
    chevron:      `<polyline points="6 9 12 15 18 9"/>`,
    dot:          `<circle cx="12" cy="12" r="3" fill="currentColor"/>`,
    search:       `<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>`,
  };

  function icon(name, size = 16) {
    if (name === 'ruble') {
      return `<span style="font-size:${size}px;font-weight:700;line-height:1;display:flex;align-items:center;justify-content:center;">₽</span>`;
    }
    const d = IC[name] || IC.dot;
    return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
  }

  /* ─── Check which pages exist (ready) ───────────────────────────────── */
  function isReady(href) {
    return [
      'guides/plan-decomposition.html',
      'reference/metrics.html',
      'sections/sales-dynamics.html',
      'sections/employees.html',
      'sections/tasks.html',
      'sections/branches.html',
      'sections/main.html',
      'sections/analysis.html',
      'sections/doctor-card.html',
      'sections/consultant-card.html',
      'sections/badges.html',
      'sections/meeting-plan.html',
      'guides/badges-workflow.html',
      'guides/getting-started.html',
      'reference/roles.html',
    ].includes(href);
  }

  /* ─── Determine active and expand state ─────────────────────────────── */
  function isActive(href) {
    const norm = h => h.replace(/\/index\.html$/, '/').replace(/index\.html$/, '');
    return norm(currentRel) === norm(href) || currentRel === href;
  }

  function hasActiveChild(children) {
    return children?.some(c => isActive(c.href));
  }

  /* ─── Build sidebar HTML ─────────────────────────────────────────────── */
  function buildItem(item, depth = 0) {
    if (item.children) {
      const expanded = hasActiveChild(item.children);
      const id = 'sb-' + item.title.replace(/\s+/g, '-');
      return `
        <div class="sb-group">
          <button class="sb-item sb-toggle ${expanded ? 'sb-expanded' : ''}" data-target="${id}" aria-expanded="${expanded}">
            <span class="sb-icon">${icon(item.icon)}</span>
            <span class="sb-label">${item.title}</span>
            <span class="sb-chevron">${icon('chevron', 14)}</span>
          </button>
          <div class="sb-children ${expanded ? 'sb-open' : ''}" id="${id}">
            ${item.children.map(c => buildSubItem(c)).join('')}
          </div>
        </div>`;
    }

    const active = isActive(item.href);
    const ready = isReady(item.href);
    const disabled = !ready && item.href !== 'index.html';

    if (disabled) {
      return `
        <span class="sb-item sb-disabled" title="Скоро">
          <span class="sb-indicator"></span>
          <span class="sb-icon">${icon(item.icon)}</span>
          <span class="sb-label">${item.title}</span>
        </span>`;
    }

    return `
      <a class="sb-item ${active ? 'sb-active' : ''}" href="${rootUrl}${item.href}">
        ${active ? '<span class="sb-active-bar"></span>' : ''}
        <span class="sb-icon">${icon(item.icon)}</span>
        <span class="sb-label">${item.title}</span>
      </a>`;
  }

  function buildSubItem(item) {
    const active = isActive(item.href);
    const ready = isReady(item.href);
    if (!ready) {
      return `<span class="sb-subitem sb-disabled">${item.title}</span>`;
    }
    return `<a class="sb-subitem ${active ? 'sb-active' : ''}" href="${rootUrl}${item.href}">${item.title}</a>`;
  }

  function groupHasActive(items) {
    return items.some(item =>
      (item.href && isActive(item.href)) || (item.children && hasActiveChild(item.children))
    );
  }

  function buildSidebar() {
    let html = `
      <div class="sb-logo">
        <img class="sb-logo-img" src="${rootUrl}logo.png" alt="Optimizer" width="36" height="36">
        <div>
          <div class="sb-logo-name">Optimizer</div>
          <div class="sb-logo-sub">База знаний</div>
        </div>
      </div>
      <nav class="sb-nav">`;

    NAV.forEach(group => {
      if (group.label) {
        const open = groupHasActive(group.items);
        const id = 'sbg-' + group.label.replace(/\s+/g, '-');
        html += `
          <button class="sb-group-label ${open ? 'sb-group-open' : ''}" data-target="${id}" aria-expanded="${open}">
            ${group.label}
            <span class="sb-group-chevron">${icon('chevron', 12)}</span>
          </button>
          <div class="sb-group-items${open ? ' sb-group-items--open' : ''}" id="${id}">`;
        group.items.forEach(item => { html += buildItem(item); });
        html += `</div>`;
      } else {
        group.items.forEach(item => { html += buildItem(item); });
      }
    });

    html += `</nav>`;
    return html;
  }

  /* ─── CSS ────────────────────────────────────────────────────────────── */
  const css = `
    *, *::before, *::after { box-sizing: border-box; }

    :root {
      --sb-w: 256px;
      --bg:        #f8f9fc;
      --surface:   #ffffff;
      --border:    #e5e7ee;
      --primary:   #5b5ef4;
      --primary10: rgba(91,94,244,0.08);
      --primary20: rgba(91,94,244,0.15);
      --text:      #18192b;
      --muted-fg:  #72768a;
      --muted-bg:  #f2f3f8;
      --radius:    6px;
      --shadow-sm: 0 1px 2px rgba(0,0,0,0.05);
      --shadow-md: 0 4px 6px -1px rgba(0,0,0,0.08),0 2px 4px -2px rgba(0,0,0,0.06);
    }

    html { font-family: Inter, system-ui, -apple-system, sans-serif; }

    body {
      margin: 0;
      background: var(--bg);
      color: var(--text);
      line-height: 1.5;
    }

    /* ── Sidebar ── */
    #kb-sidebar {
      position: fixed;
      top: 0; left: 0;
      width: var(--sb-w);
      height: 100vh;
      background: var(--surface);
      border-right: 1px solid var(--border);
      display: flex;
      flex-direction: column;
      overflow-y: auto;
      overflow-x: hidden;
      z-index: 40;
      scrollbar-width: thin;
      scrollbar-color: var(--border) transparent;
    }

    #kb-content {
      margin-left: var(--sb-w);
      min-height: 100vh;
    }

    /* ── Logo ── */
    .sb-logo {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 18px 16px;
      border-bottom: 1px solid var(--border);
      flex-shrink: 0;
    }
    .sb-logo-img {
      width: 36px; height: 36px;
      border-radius: 10px;
      flex-shrink: 0;
      object-fit: contain;
    }
    .sb-logo-name {
      font-size: 14px; font-weight: 700;
      color: var(--text); line-height: 1.2;
    }
    .sb-logo-sub {
      font-size: 11px; color: var(--muted-fg); font-weight: 400;
    }

    /* ── Nav ── */
    .sb-nav {
      flex: 1;
      padding: 8px 0 24px;
      display: flex;
      flex-direction: column;
      gap: 1px;
    }

    .sb-group-label {
      display: flex;
      align-items: center;
      justify-content: space-between;
      width: 100%;
      font-family: inherit;
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--muted-fg);
      padding: 14px 16px 4px;
      background: none;
      border: none;
      cursor: pointer;
      text-align: left;
    }
    .sb-group-label:hover { color: var(--text); }
    .sb-group-chevron {
      display: flex;
      align-items: center;
      opacity: 0.6;
      transition: transform 0.2s;
      transform: rotate(-90deg);
    }
    .sb-group-label.sb-group-open .sb-group-chevron { transform: rotate(0deg); }
    .sb-group-items {
      display: none;
      flex-direction: column;
      gap: 1px;
    }
    .sb-group-items--open { display: flex; }

    /* ── Items ── */
    .sb-item {
      position: relative;
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 8px 12px 8px 16px;
      margin: 0 8px;
      border-radius: var(--radius);
      font-size: 13.5px;
      font-weight: 500;
      color: var(--muted-fg);
      text-decoration: none;
      cursor: pointer;
      border: none;
      background: none;
      width: calc(100% - 16px);
      text-align: left;
      transition: background 0.12s, color 0.12s;
    }
    .sb-item:hover:not(.sb-disabled):not(.sb-active) {
      background: var(--muted-bg);
      color: var(--text);
    }
    .sb-item.sb-active {
      background: var(--primary10);
      color: var(--primary);
      font-weight: 600;
    }
    .sb-item.sb-disabled {
      opacity: 0.45;
      cursor: default;
    }
    .sb-active-bar {
      position: absolute;
      left: -8px; top: 50%;
      transform: translateY(-50%);
      width: 3px; height: 20px;
      background: var(--primary);
      border-radius: 0 3px 3px 0;
    }
    .sb-icon {
      display: flex; align-items: center; justify-content: center;
      width: 18px; height: 18px;
      flex-shrink: 0;
    }
    .sb-label { flex: 1; }
    .sb-chevron {
      display: flex; align-items: center;
      color: var(--muted-fg);
      transition: transform 0.2s;
    }
    .sb-toggle.sb-expanded .sb-chevron { transform: rotate(180deg); }

    /* ── Submenu ── */
    .sb-children {
      display: none;
      flex-direction: column;
      gap: 1px;
      margin: 2px 8px 2px 36px;
      padding-left: 12px;
      border-left: 2px solid var(--border);
    }
    .sb-children.sb-open { display: flex; }

    .sb-subitem {
      display: block;
      padding: 6px 10px;
      border-radius: var(--radius);
      font-size: 13px;
      font-weight: 500;
      color: var(--muted-fg);
      text-decoration: none;
      transition: background 0.12s, color 0.12s;
    }
    .sb-subitem:hover:not(.sb-disabled) {
      background: var(--muted-bg);
      color: var(--text);
    }
    .sb-subitem.sb-active {
      background: var(--primary10);
      color: var(--primary);
      font-weight: 600;
    }
    .sb-subitem.sb-disabled { opacity: 0.45; cursor: default; }
  `;

  /* ─── Inject ─────────────────────────────────────────────────────────── */
  const style = document.createElement('style');
  style.id = 'kb-sidebar-css';
  style.textContent = css;
  document.head.appendChild(style);

  const sidebar = document.createElement('div');
  sidebar.id = 'kb-sidebar';
  sidebar.innerHTML = buildSidebar();
  document.body.insertBefore(sidebar, document.body.firstChild);

  // Wrap existing content
  const content = document.createElement('div');
  content.id = 'kb-content';
  while (sidebar.nextSibling) {
    content.appendChild(sidebar.nextSibling);
  }
  document.body.appendChild(content);

  /* ─── Submenu toggle ─────────────────────────────────────────────────── */
  sidebar.querySelectorAll('.sb-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.target;
      const panel = document.getElementById(id);
      if (!panel) return;
      const open = panel.classList.toggle('sb-open');
      btn.classList.toggle('sb-expanded', open);
      btn.setAttribute('aria-expanded', open);
    });
  });

  /* ─── Group collapse toggle ──────────────────────────────────────────── */
  sidebar.querySelectorAll('.sb-group-label[data-target]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.target;
      const panel = document.getElementById(id);
      if (!panel) return;
      const open = panel.classList.toggle('sb-group-items--open');
      btn.classList.toggle('sb-group-open', open);
      btn.setAttribute('aria-expanded', open);
    });
  });

  /* ─── Add Inter font if not present ─────────────────────────────────── */
  if (!document.querySelector('link[href*="Inter"]')) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap';
    document.head.prepend(link);
  }

  /* ─── Metric tooltips ────────────────────────────────────────────────── */
  const METRICS_DICT = {
    load:         { name: '% загрузки',               desc: 'Доля окон врача, в которых состоялся фактический приём.',                                    formula: 'Подборы ÷ Окна × 100%' },
    pd_r:         { name: '% подбор → рецепт',        desc: 'Доля подборов, завершившихся выпиской рецепта. Отражает качество диагностики врача.',        formula: 'Рецепты ÷ Подборы × 100%' },
    r_z:          { name: '% рецепт → заказ',         desc: 'Доля рецептов, по которым оформлен заказ. Ключевой показатель консультанта.',                formula: 'Заказы (наш) ÷ Рецепты × 100%' },
    pz_own:       { name: '% подбор → заказ (наш)',   desc: 'Сквозная конверсия от подбора до заказа по нашему рецепту.',                                  formula: 'Заказы (наш) ÷ Подборы × 100%' },
    pz_total:     { name: '% подбор → заказ (итого)', desc: 'Сквозная конверсия от подбора до любого заказа — включая по чужому рецепту.',                formula: 'Итого заказов ÷ Подборы × 100%' },
    pd_z:         { name: '% подбор → заказ',         desc: 'Сквозная конверсия от подбора до заказа.',                                                   formula: 'Заказы ÷ Подборы × 100%' },
    alien_pct:    { name: '% чужих заказов',          desc: 'Доля заказов по стороннему рецепту (или нашему старше 6 мес) от всех заказов.',               formula: 'Заказы (чужой) ÷ Итого заказов × 100%' },
    vtl:          { name: 'ВТЛ',                      desc: 'Высокотехнологичные линзы: прогрессивные, офисные, фриформ. Главный рычаг роста среднего чека.' },
    check_lens:   { name: 'Ср. чек линз',             desc: 'Средняя стоимость линз в заказе.',                                                           formula: 'Сумма «Линзы» ÷ Кол-во заказов' },
    check_frame:  { name: 'Ср. чек оправы',           desc: 'Средняя стоимость оправы в заказе. Отражает сегмент, который предлагает консультант.' },
    check_master: { name: 'Ср. чек мастера',          desc: 'Средняя стоимость работы мастера в заказе.' },
    check:        { name: 'Средний чек',              desc: 'Средняя сумма одного заказа. Включает линзы, оправу и работу мастера.',                       formula: 'Сумма заказов ÷ Кол-во заказов' },
    orders_own:   { name: 'Заказы (наши)',            desc: 'Заказы по рецепту нашего врача. Показывает эффективность собственного рецептурного потока.' },
    orders_alien: { name: 'Заказы (чужие)',           desc: 'Заказы по стороннему рецепту или по нашему рецепту старше 6 месяцев.' },
    windows:      { name: 'Окна',                     desc: 'Временные слоты, в которые врач может принять клиента. Плановая ёмкость, не фактический трафик.', formula: 'Длина дня ÷ Длительность приёма' },
    selections:   { name: 'Подборы',                  desc: 'Фактические приёмы, на которых врач провёл диагностику зрения и подбор оптики. Реальный трафик клиентов.' },
    prescriptions:{ name: 'Рецепты',                  desc: 'Количество подборов, завершившихся выпиской рецепта нашим врачом.' },
  };

  const METRICS_DICT_EXTRA = {
    vtl_rec:  { name: '% рекомендаций ВТЛ', desc: 'Доля подборов, в которых врач порекомендовал высокотехнологичные линзы.',       formula: 'Рекомендации ВТЛ ÷ Подборы × 100%' },
    vtl_sale: { name: '% продаж ВТЛ',       desc: 'Доля заказов с высокотехнологичными линзами от всех заказов.',                  formula: 'Заказы с ВТЛ ÷ Итого заказов × 100%' },
    check_vtl:{ name: 'Ср. чек ВТЛ',        desc: 'Средняя стоимость заказа, включающего высокотехнологичные линзы.' },
  };
  Object.assign(METRICS_DICT, METRICS_DICT_EXTRA);

  // \b не работает с кириллицей в JS (основан на \w = ASCII),
  // поэтому используем lookahead/lookbehind по кириллическим буквам.
  const CY = '[А-ЯЁа-яё]';
  const MTERMS = [
    { p: '%\\s*рекомендаций\\s+ВТЛ',                       k: 'vtl_rec' },
    { p: '%\\s*продаж\\s+ВТЛ',                             k: 'vtl_sale' },
    { p: '%\\s*подбор\\s*→\\s*заказ\\s*\\(итого\\)',       k: 'pz_total' },
    { p: '%\\s*подбор\\s*→\\s*заказ\\s*\\(наш\\)',         k: 'pz_own' },
    { p: '%\\s*подбор\\s*→\\s*рецепт',                     k: 'pd_r' },
    { p: '%\\s*рецепт\\s*→\\s*заказ',                      k: 'r_z' },
    { p: '%\\s*подбор\\s*→\\s*заказ',                      k: 'pd_z' },
    { p: '%\\s*чужих\\s+заказов',                          k: 'alien_pct' },
    { p: '%\\s*чужих',                                     k: 'alien_pct' },
    { p: '%\\s*загрузки',                                  k: 'load' },
    { p: 'ср\\.\\s*чек\\s+ВТЛ',                           k: 'check_vtl' },
    { p: 'ср\\.\\s*чек\\s+(?:линз|линзы)',                 k: 'check_lens' },
    { p: 'ср\\.\\s*чек\\s+оправ[ыи]?',                    k: 'check_frame' },
    { p: 'ср\\.\\s*чек\\s+мастера',                        k: 'check_master' },
    { p: 'ср\\.\\s*чек',                                   k: 'check' },
    { p: 'заказы\\s*\\(наши\\)',                           k: 'orders_own' },
    { p: 'заказы\\s*\\(чужие\\)',                          k: 'orders_alien' },
    { p: `(?<!${CY})ВТЛ(?!${CY})`,                        k: 'vtl' },
    { p: `(?<!${CY})окна(?!${CY})`,                       k: 'windows' },
    { p: `(?<!${CY})подборы(?!${CY})`,                    k: 'selections' },
    { p: `(?<!${CY})рецепты(?!${CY})`,                    k: 'prescriptions' },
  ];

  let mTermRe = null;
  try {
    mTermRe = new RegExp(MTERMS.map(t => `(${t.p})`).join('|'), 'gi');
  } catch (e) {
    // Браузер не поддерживает lookbehind — тултипы отключены, сайдбар работает
  }

  function wrapMetricTerms(root) {
    if (!mTermRe) return;
    const SKIP = new Set(['script','style','code','pre','button','input','textarea','h1','h2','h3','h4','h5','h6']);
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const el = node.parentElement;
        if (!el) return NodeFilter.FILTER_REJECT;
        if (SKIP.has(el.tagName.toLowerCase())) return NodeFilter.FILTER_REJECT;
        if (el.closest('.m-term, a, [data-no-wrap]')) return NodeFilter.FILTER_REJECT;
        return node.nodeValue.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
      }
    });

    const nodes = [];
    let n;
    while ((n = walker.nextNode())) nodes.push(n);

    for (const textNode of nodes) {
      if (!textNode.parentNode) continue;
      const text = textNode.nodeValue;
      mTermRe.lastIndex = 0;
      if (!mTermRe.test(text)) continue;
      mTermRe.lastIndex = 0;

      const frag = document.createDocumentFragment();
      let last = 0, m;
      while ((m = mTermRe.exec(text)) !== null) {
        if (m.index > last) frag.appendChild(document.createTextNode(text.slice(last, m.index)));
        const idx = m.slice(1).findIndex(g => g !== undefined);
        const span = document.createElement('span');
        span.className = 'm-term';
        span.dataset.metric = MTERMS[idx].k;
        span.textContent = m[0];
        frag.appendChild(span);
        last = m.index + m[0].length;
      }
      if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
      textNode.parentNode.replaceChild(frag, textNode);
    }
  }

  /* Tooltip element */
  const metricTip = document.createElement('div');
  metricTip.id = 'kb-metric-tip';
  document.body.appendChild(metricTip);

  const tipCss = `
    .m-term {
      border-bottom: 1.5px dashed #b0b4cc;
      cursor: help;
      transition: border-color 0.12s;
    }
    .m-term:hover { border-color: #5b5ef4; }
    #kb-metric-tip {
      position: fixed;
      z-index: 9999;
      background: #18192b;
      color: #e8e9f0;
      border-radius: 8px;
      padding: 12px 14px;
      max-width: 260px;
      min-width: 160px;
      font-size: 13px;
      line-height: 1.5;
      pointer-events: none;
      display: none;
      box-shadow: 0 8px 24px rgba(0,0,0,0.18), 0 2px 8px rgba(0,0,0,0.1);
    }
    #kb-metric-tip.visible { display: block; }
    #kb-metric-tip .tip-name { font-weight: 700; font-size: 13px; color: #fff; margin-bottom: 5px; }
    #kb-metric-tip .tip-desc { font-size: 12px; color: #9ea3b8; line-height: 1.55; }
    #kb-metric-tip .tip-formula { margin-top: 7px; font-size: 11px; color: #7b7ef6; font-family: ui-monospace, monospace; background: rgba(91,94,244,0.15); padding: 3px 8px; border-radius: 4px; display: inline-block; }
  `;
  const tipStyle = document.createElement('style');
  tipStyle.textContent = tipCss;
  document.head.appendChild(tipStyle);

  function positionTip(el) {
    const data = METRICS_DICT[el.dataset.metric];
    if (!data) return;
    metricTip.innerHTML =
      `<div class="tip-name">${data.name}</div>` +
      `<div class="tip-desc">${data.desc}</div>` +
      (data.formula ? `<div class="tip-formula">${data.formula}</div>` : '');

    // Рендерим вне экрана для замера размеров, затем сбрасываем инлайн-стиль
    metricTip.style.left = '-9999px';
    metricTip.style.top = '-9999px';
    metricTip.style.display = 'block';
    const tw = metricTip.offsetWidth;
    const th = metricTip.offsetHeight;
    metricTip.style.display = '';  // сброс — теперь CSS полностью контролирует display

    const rect = el.getBoundingClientRect();
    let left = rect.left + rect.width / 2 - tw / 2;
    left = Math.max(8, Math.min(left, window.innerWidth - tw - 8));
    const top = rect.top - th - 8 >= 4 ? rect.top - th - 8 : rect.bottom + 8;

    metricTip.style.left = left + 'px';
    metricTip.style.top = top + 'px';
    metricTip.classList.add('visible');
  }

  document.addEventListener('mousemove', e => {
    const term = e.target.closest?.('.m-term');
    if (term) {
      positionTip(term);
    } else {
      metricTip.classList.remove('visible');
    }
  });

  // Мобильные: тап открывает/закрывает тултип
  content.addEventListener('click', e => {
    const term = e.target.closest('.m-term');
    if (!term) { metricTip.classList.remove('visible'); return; }
    if (metricTip._anchor === term && metricTip.classList.contains('visible')) {
      metricTip.classList.remove('visible');
      metricTip._anchor = null;
    } else {
      positionTip(term);
      metricTip._anchor = term;
    }
  });

  setTimeout(() => wrapMetricTerms(content), 0);
})();
