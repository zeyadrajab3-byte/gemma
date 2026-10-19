/* جِمّا - الهيكل العام (www/app.js)
   الشريط السفلي، التنقل بين الشاشات، أدوات مشتركة (نوافذ، رسائل، تأكيد)، وبدء التخزين. */
(function () {
  var UI = {};
  var backStack = [];
  var current = null;

  // ---------- أدوات DOM ----------
  UI.h = function (tag, attrs, kids) {
    var e = document.createElement(tag);
    attrs = attrs || {};
    Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (v === undefined || v === null || v === false) return;
      if (k === 'class') e.className = v;
      else if (k === 'text') e.textContent = v;
      else if (k === 'on') Object.keys(v).forEach(function (ev) { e.addEventListener(ev, v[ev]); });
      else if (k === 'value') e.value = v;
      else e.setAttribute(k, v === true ? '' : v);
    });
    (kids || []).forEach(function (c) {
      if (c === null || c === undefined || c === false) return;
      e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return e;
  };
  var h = UI.h;

  UI.icon = function (inner) {
    var s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    s.setAttribute('viewBox', '0 0 24 24');
    s.innerHTML = inner; // نصوص ثابتة من عندنا بس
    return s;
  };

  // ---------- زرار الرجوع بتاع أندرويد ----------
  UI.pushBack = function (fn) { backStack.push(fn); };
  UI.popBack = function (fn) {
    var i = backStack.lastIndexOf(fn);
    if (i >= 0) backStack.splice(i, 1);
  };
  function onBackButton() {
    if (backStack.length) { backStack.pop()(); return; }
    if (UI.editing) { UI.setEditing(false); return; }
    if (current && current !== START_TAB) { go(START_TAB); return; }
    var A = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.App;
    if (A && A.exitApp) A.exitApp();
  }

  // ---------- رسالة سريعة ----------
  var toastEl = null, toastTimer = null;
  UI.toast = function (msg, ms) {
    if (toastEl) toastEl.remove();
    clearTimeout(toastTimer);
    toastEl = h('div', { class: 'toast', text: msg });
    document.body.appendChild(toastEl);
    toastTimer = setTimeout(function () { if (toastEl) toastEl.remove(); toastEl = null; }, ms || 2400);
  };

  // ---------- نافذة سفلية ----------
  // opts: { title, content: Node, actions: [{label, kind, onClick}], dismissable }
  UI.sheet = function (opts) {
    var closed = false;
    var bg = h('div', { class: 'sheet-bg' });
    var sheet = h('div', { class: 'sheet' });
    function close() {
      if (closed) return;
      closed = true;
      UI.popBack(close);
      bg.remove();
      if (opts.onClose) opts.onClose();
    }
    if (opts.title) sheet.appendChild(h('h3', { class: 'title', text: opts.title }));
    if (opts.content) sheet.appendChild(opts.content);
    if (opts.actions && opts.actions.length) {
      sheet.appendChild(h('div', { class: 'actions' }, opts.actions.map(function (a) {
        return h('button', { class: 'btn ' + (a.kind || ''), text: a.label, on: { click: function () {
          if (a.onClick) { var r = a.onClick(close); if (r === false) return; }
          if (a.keepOpen !== true) close();
        } } });
      })));
    }
    bg.appendChild(sheet);
    if (opts.dismissable !== false) {
      bg.addEventListener('click', function (e) { if (e.target === bg) close(); });
    }
    document.body.appendChild(bg);
    UI.pushBack(close);
    return { close: close, el: sheet };
  };

  // تأكيد: بيرجّع Promise بـ true/false
  UI.confirm = function (opts) {
    return new Promise(function (resolve) {
      var decided = false;
      function done(v) { if (!decided) { decided = true; resolve(v); } }
      UI.sheet({
        title: opts.title,
        content: opts.text ? h('p', { class: 'dim', text: opts.text }) : null,
        actions: [
          { label: opts.cancel || 'إلغاء', onClick: function () { done(false); } },
          { label: opts.ok || 'تأكيد', kind: opts.danger ? 'danger' : 'primary', onClick: function () { done(true); } }
        ],
        onClose: function () { done(false); }
      });
    });
  };

  // ---------- وضع التعديل ----------
  UI.editing = false;
  UI.setEditing = function (on) {
    UI.editing = !!on;
    document.body.classList.toggle('editing', UI.editing);
    if (UI.onEditingChange) UI.onEditingChange(UI.editing);
  };

  // ---------- المود ----------
  UI.applyTheme = function (theme) {
    document.documentElement.setAttribute('data-theme', theme === 'light' ? 'light' : 'dark');
  };

  // ---------- الشاشات والتنقل ----------
  // الشاشة الأولى مؤقتًا هي المكتبة لحد ما الرئيسية تتبني (المرحلة 2)
  var START_TAB = 'library';
  var TABS = [
    { id: 'home', label: 'الرئيسية', icon: '<path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/>' },
    { id: 'library', label: 'المكتبة', icon: '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="M10 9l5 3-5 3z"/>' },
    { id: 'progress', label: 'التقدم', icon: '<path d="M4 20V11M10 20V5M16 20v-6M3 21h18"/>' },
    { id: 'food', label: 'الأكل', icon: '<path d="M7 3v8M5 3v5a2 2 0 0 0 4 0V3M7 11v10M17 3c-2 2-3 5-3 8h3v10"/>' },
    { id: 'more', label: 'المزيد', icon: '<circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/>' }
  ];

  // كل شاشة دالة بتاخد العنصر وترسم جواه. شاشات المراحل الجاية بتتسجل هنا.
  var screens = window.GemmaScreens = window.GemmaScreens || {};
  function placeholder(name) {
    return function (box) {
      box.appendChild(h('div', { class: 'page-head' }, [h('h1', { class: 'title', text: name })]));
      box.appendChild(h('div', { class: 'empty', text: 'قريبًا في مرحلة جاية' }));
    };
  }
  ['home:الرئيسية', 'progress:التقدم', 'food:الأكل', 'more:المزيد'].forEach(function (s) {
    var p = s.split(':');
    if (!screens[p[0]]) screens[p[0]] = placeholder(p[1]);
  });

  function renderBar() {
    var bar = document.getElementById('bar');
    bar.innerHTML = '';
    TABS.forEach(function (t) {
      var b = h('button', { 'data-tab': t.id, class: t.id === current ? 'on' : '', on: { click: function () { go(t.id); } } },
        [UI.icon(t.icon), h('span', { text: t.label })]);
      bar.appendChild(b);
    });
  }

  function go(tab) {
    current = tab;
    backStack.length = 0;
    UI.setEditing(false);
    renderBar();
    UI.render();
  }
  UI.go = go;

  // إعادة رسم الشاشة الحالية (بعد أي تعديل)
  UI.render = function () {
    var box = document.getElementById('screen');
    var top = box.scrollTop;
    box.innerHTML = '';
    var fn = screens[current];
    try { fn(box); }
    catch (e) { showError(e); }
    box.scrollTop = top;
  };

  function showError(e) {
