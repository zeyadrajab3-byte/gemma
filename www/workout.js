/* جِمّا - تمرين النهارده وتسجيل المجموعات (www/workout.js)
   كارت "التمرين اللي على النهارده" في الرئيسية ← صفحة التمرين: تمارين اليوم وآخر مرة لكل تمرين.
   "ابدأ التمرين" ← تسجّل لكل تمرين مجموعاته (وزن × عدّات) ← "إنهاء التمرين" بيحفظ الجلسة بالتاريخ
   في sessions (الأساس لتذكير آخر مرة ولصفحة التقدم). التمرين الشغال بيتحفظ لوحده فمايضيعش لو قفلت التطبيق. */
(function () {
  var UI = window.GemmaUI, h = UI.h, S = window.GemmaStore, Sch = window.GemmaSchedule;

  var ICON = {
    back: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    minus: '<path d="M5 12h14"/>',
    x: '<path d="M6 6l12 12M18 6L6 18"/>'
  };

  var view = { open: false, dayId: null, dayDate: null };
  var navBack = null;
  var saveTimer = null;

  function D() { return S.data; }
  function fail(e) { UI.toast('خطأ: ' + (e && e.message ? e.message : e), 5000); }
  function num(t) { return h('span', { class: 'num', text: String(t) }); }
  function r0(n) { return Math.round(n); }
  function val(i) { var v = parseFloat(i.value); return isFinite(v) ? v : null; }
  function fmt(n) { return String(Math.round(n * 100) / 100); }
  function exById(id) { return D().exercises.filter(function (e) { return e.id === id; })[0] || null; }
  function active() { return (D().settings && D().settings.activeWorkout) || null; }
  function touch() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () { S.save().catch(fail); }, 500);
  }

  // اليوم اللي هنتمرنه: الشغال، أو اللي اخترته النهارده، أو يوم الجدول
  function currentDay() {
    var a = active();
    if (a) return { id: a.dayId, name: a.dayName, items: a.items };
    if (view.dayId && view.dayDate === S.today()) {
      var d = Sch.dayById(view.dayId);
      if (d) return d;
    }
    return Sch.todayDay();
  }
  function programDays() {
    var p = Sch.activeProgram();
    return p ? (p.dayIds || []).map(Sch.dayById).filter(Boolean) : [];
  }

  // ---------- آخر مرة ----------
  function sortedSessions() {
    return D().sessions.slice().sort(function (a, b) {
      if (a.date !== b.date) return a.date < b.date ? 1 : -1;
      return (b.endedAt || 0) - (a.endedAt || 0);
    });
  }
  function lastFor(exId) {
    var all = sortedSessions();
    for (var i = 0; i < all.length; i++) {
      var sets = (all[i].sets || []).filter(function (x) { return x.exerciseId === exId; });
      if (sets.length) return { date: all[i].date, sets: sets };
    }
    return null;
  }
  function bestWeight(exId) {
    var best = 0;
    D().sessions.forEach(function (s) {
      (s.sets || []).forEach(function (x) { if (x.exerciseId === exId && x.w > best) best = x.w; });
    });
    return best;
  }
  function daysAgoLabel(date) {
    var a = date.split('-'), b = S.today().split('-');
    var n = Math.round((Date.UTC(+b[0], +b[1] - 1, +b[2]) - Date.UTC(+a[0], +a[1] - 1, +a[2])) / 86400000);
    if (n <= 0) return 'النهارده';
    if (n === 1) return 'امبارح';
    return 'من ' + n + ' يوم';
  }
  function setText(s) { return (s.w ? fmt(s.w) : '0') + '×' + s.r; }
  function lastLine(exId) {
    var l = lastFor(exId);
    var box = h('div', { class: 'last-line dim' });
    if (!l) { box.textContent = 'أول مرة تسجله'; return box; }
    box.appendChild(document.createTextNode('آخر مرة (' + daysAgoLabel(l.date) + '): '));
    box.appendChild(num(l.sets.map(setText).join('  ·  ')));
    return box;
  }

  // ---------- عناصر ----------
  function setBack(fn) {
    if (navBack) { UI.popBack(navBack); navBack = null; }
    if (fn) { navBack = fn; UI.pushBack(fn); }
  }
  function leave() { view.open = false; setBack(null); UI.render(); }

  // ---------- كارت الرئيسية ----------
  function card() {
    var a = active(), day = currentDay(), p = Sch.activeProgram();
    var c = h('div', { class: 'card tap', role: 'button' });

    if (a) {
      c.addEventListener('click', open);
      c.appendChild(h('div', { class: 'dim', text: 'تمرين شغال دلوقتي' }));
      c.appendChild(h('div', { class: 'title wk-name', text: a.dayName }));
      c.appendChild(h('div', { class: 'cal-foot' }, [h('span', { text: 'كمّل التمرين' }), UI.icon(ICON.back)]));
      return c;
    }
    if (!p) {
      c.addEventListener('click', function () { UI.go('schedule'); });
      c.appendChild(h('div', { class: 'dim', text: 'التمرين اللي على النهارده' }));
      c.appendChild(h('div', { class: 'wk-sub', text: 'لسه ماعملتش جدول. اضغط عشان تعمله.' }));
      return c;
    }
    if (!day) {
      c.addEventListener('click', function () { pickDay(true); });
      c.appendChild(h('div', { class: 'dim', text: 'التمرين اللي على النهارده' }));
      c.appendChild(h('div', { class: 'title wk-name', text: 'النهارده راحة' }));
      c.appendChild(h('div', { class: 'cal-foot' }, [h('span', { text: 'اضغط لو عايز تتمرن برضو' }), UI.icon(ICON.back)]));
      return c;
    }
    c.addEventListener('click', open);
    c.appendChild(h('div', { class: 'wk-top' }, [
      h('div', { class: 'dim', text: 'التمرين اللي على النهارده' }),
      h('button', { class: 'btn small', text: 'غيّر اليوم', on: { click: function (e) { e.stopPropagation(); pickDay(false); } } })
    ]));
    c.appendChild(h('div', { class: 'title wk-name', text: day.name }));
    c.appendChild(h('div', { class: 'cal-foot' }, [h('span', {}, [num(day.items.length), ' تمرين']), UI.icon(ICON.back)]));
    return c;
  }

  function pickDay(thenOpen) {
    var days = programDays();
    if (!days.length) { UI.toast('مفيش أيام في الجدول'); return; }
    var sh;
    var rows = days.map(function (d) {
      return h('div', { class: 'row', role: 'button', on: { click: function () {
        view.dayId = d.id; view.dayDate = S.today();
        sh.close();
        if (thenOpen) open(); else UI.render();
      } } }, [
        h('div', { class: 'grow' }, [h('div', { class: 'name', text: d.name }), h('div', { class: 'sub', text: d.items.length + ' تمرين' })])
      ]);
    });
    sh = UI.sheet({ title: 'اختار يوم التمرين', content: h('div', {}, rows), actions: [{ label: 'إلغاء' }] });
  }

  function open() { view.open = true; UI.render(); }

  // ---------- صفحة التمرين ----------
  function render(box) {
    var a = active();
    var day = a ? { id: a.dayId, name: a.dayName, items: a.items } : currentDay();
    if (!day) { view.open = false; setBack(null); return false; }
    setBack(leave);
    box.appendChild(h('div', { class: 'page-head' }, [
      h('button', { class: 'icon-btn', 'aria-label': 'رجوع', on: { click: leave } }, [UI.icon(ICON.back)]),
      h('h1', { class: 'title', text: day.name })
    ]));
    if (a) activeView(box, a); else previewView(box, day);
    return true;
  }

  function previewView(box, day) {
    var items = day.items.filter(function (it) { return exById(it.exerciseId); });
    if (!items.length) {
      box.appendChild(h('div', { class: 'empty', text: 'اليوم ده مفيهوش تمارين. ضيف تمارين من تبويب الجدول.' }));
      return;
    }
    items.forEach(function (it) {
      var ex = exById(it.exerciseId);
      box.appendChild(h('div', { class: 'card' }, [
        h('div', { class: 'wk-top' }, [h('div', { class: 'name', style: 'font-weight:600', text: ex.name }), it.target ? h('span', { class: 'badge num', text: it.target }) : null]),
        lastLine(ex.id)
      ]));
    });
    box.appendChild(h('button', { class: 'btn primary block start-btn', text: 'ابدأ التمرين', on: { click: function () {
      D().settings.activeWorkout = {
        id: S.id('ses'), date: S.today(), dayId: day.id, dayName: day.name, startedAt: Date.now(),
        items: items.map(function (i) { return { exerciseId: i.exerciseId, target: i.target || '' }; }), log: {}
      };
      S.save().then(function () { UI.render(); }).catch(fail);
    } } }));
  }

  function activeView(box, a) {
    var done = h('div');
    a.items.forEach(function (it) {
      var ex = exById(it.exerciseId);
      if (!ex) return;
      if (!a.log[ex.id]) a.log[ex.id] = [];
      var sets = a.log[ex.id];
      var list = h('div');
      var last = lastFor(ex.id);

      function draw() {
        list.textContent = '';
        sets.forEach(function (s, i) { list.appendChild(setRow(sets, i, draw)); });
      }
      var addBtn = h('button', { class: 'btn block', style: 'margin-top:6px', on: { click: function () {
        var prev = sets.length ? sets[sets.length - 1] : (last ? last.sets[0] : null);
        sets.push({ w: prev ? (prev.w || 0) : null, r: prev ? prev.r : null });
        touch(); draw();
      } } }, [UI.icon(ICON.plus), ' مجموعة']);
      addBtn.classList.add('add-set');
      draw();

      box.appendChild(h('div', { class: 'card' }, [
        h('div', { class: 'wk-top' }, [h('div', { class: 'name', style: 'font-weight:600', text: ex.name }), it.target ? h('span', { class: 'badge num', text: it.target }) : null]),
        lastLine(ex.id),
        h('div', { class: 'srow-head dim' }, [h('span', { text: 'الوزن (كجم)' }), h('span', { text: 'العدّات' })]),
        list, addBtn
      ]));
    });

    box.appendChild(h('button', { class: 'btn primary block start-btn', text: 'إنهاء التمرين', on: { click: finish } }));
    box.appendChild(h('button', { class: 'btn danger block', style: 'margin-top:10px', text: 'إلغاء التمرين', on: { click: function () {
      UI.confirm({ title: 'تلغي التمرين؟', text: 'اللي سجلته فيه هيتمسح.', ok: 'إلغاء التمرين', cancel: 'كمّل', danger: true }).then(function (y) {
        if (!y) return;
        delete D().settings.activeWorkout;
        view.open = false; setBack(null);
        S.save().then(function () { UI.render(); }).catch(fail);
      });
    } } }));
  }

  // صف مجموعة: [−] وزن [+] × [−] عدّات [+] ✕
  function setRow(sets, i, redraw) {
    var s = sets[i];
    var win = h('input', { type: 'number', inputmode: 'decimal', step: '0.5', min: '0', placeholder: '0', 'aria-label': 'الوزن' });
    var rin = h('input', { type: 'number', inputmode: 'numeric', step: '1', min: '0', placeholder: '0', 'aria-label': 'العدّات' });
    if (s.w !== null && s.w !== undefined) win.value = s.w;
    if (s.r !== null && s.r !== undefined) rin.value = s.r;
    function sync() { s.w = val(win); s.r = val(rin); touch(); }
    win.addEventListener('input', sync);
    rin.addEventListener('input', sync);
    function group(inp, step) {
      function bump(d) {
        var v = Math.max(0, (val(inp) || 0) + d);
        inp.value = fmt(v);
        sync();
      }
      return h('div', { class: 'sg' }, [
        h('button', { 'aria-label': 'نقّص', on: { click: function () { bump(-step); } } }, [UI.icon(ICON.minus)]),
        inp,
        h('button', { 'aria-label': 'زوّد', on: { click: function () { bump(step); } } }, [UI.icon(ICON.plus)])
      ]);
    }
    return h('div', { class: 'srow' }, [
      h('span', { class: 'sidx num', text: String(i + 1) }),
      group(win, 2.5),
      h('span', { class: 'dim', text: '×' }),
      group(rin, 1),
      h('button', { class: 'sdel', 'aria-label': 'امسح المجموعة', on: { click: function () { sets.splice(i, 1); touch(); redraw(); } } }, [UI.icon(ICON.x)])
    ]);
  }

  // ---------- الإنهاء والحفظ ----------
  function finish() {
    var a = active();
    if (!a) return;
    var sets = [], exCount = 0;
    a.items.forEach(function (it) {
      var n = 0;
      (a.log[it.exerciseId] || []).forEach(function (s) {
        if (s.r > 0) { n++; sets.push({ exerciseId: it.exerciseId, n: n, w: s.w || 0, r: s.r }); }
      });
      if (n) exCount++;
    });
    if (!sets.length) {
      UI.confirm({ title: 'ماسجلتش أي مجموعة', text: 'لازم تسجل مجموعة واحدة على الأقل (عدّات أكبر من صفر). تلغي التمرين؟', ok: 'إلغاء التمرين', cancel: 'كمّل تسجيل', danger: true }).then(function (y) {
        if (!y) return;
        delete D().settings.activeWorkout; view.open = false; setBack(null);
        S.save().then(function () { UI.render(); }).catch(fail);
      });
      return;
    }
    UI.confirm({ title: 'تنهي التمرين؟', text: 'هيتحفظ ' + sets.length + ' مجموعة في ' + exCount + ' تمرين بتاريخ ' + a.date + '.', ok: 'إنهاء وحفظ', cancel: 'كمّل' }).then(function (y) {
      if (!y) return;
      // أرقام قياسية: أعلى وزن أكبر من أي مرة قبل كده (لازم يكون ليه تاريخ سابق)
      var prs = [];
      a.items.forEach(function (it) {
        var mine = sets.filter(function (s) { return s.exerciseId === it.exerciseId; });
        if (!mine.length) return;
        var cur = Math.max.apply(null, mine.map(function (s) { return s.w; }));
        var prev = bestWeight(it.exerciseId);
        var ex = exById(it.exerciseId);
        if (prev > 0 && cur > prev && ex) prs.push({ name: ex.name, w: cur });
      });
      var volume = sets.reduce(function (t, s) { return t + s.w * s.r; }, 0);
      D().sessions.push({ id: a.id, date: a.date, dayId: a.dayId, dayName: a.dayName, startedAt: a.startedAt, endedAt: Date.now(), sets: sets });
      delete D().settings.activeWorkout;
      view.open = false; setBack(null);
      S.save().then(function () { UI.render(); showSummary(sets.length, exCount, volume, prs); }).catch(fail);
    });
  }

  function showSummary(nSets, nEx, volume, prs) {
    var kids = [
      h('p', {}, ['اتحفظ ', num(nSets), ' مجموعة في ', num(nEx), ' تمرين.']),
      h('p', { class: 'dim' }, ['حجم التدريب: ', num(r0(volume)), ' كجم'])
    ];
    prs.forEach(function (p) {
      kids.push(h('div', { class: 'row', style: 'cursor:default' }, [
        h('span', { class: 'pr-badge', text: 'رقم قياسي' }),
        h('div', { class: 'grow' }, [h('div', { class: 'name', text: p.name })]),
        h('span', { class: 'badge num', text: fmt(p.w) + ' كجم' })
      ]));
    });
    UI.sheet({ title: 'برافو، خلصت التمرين', content: h('div', {}, kids), actions: [{ label: 'تمام', kind: 'primary' }] });
  }

  window.GemmaWorkout = {
    card: card,
    render: render,
    isOpen: function () { return view.open && !!(active() || currentDay()); }
  };
})();
