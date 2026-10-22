/* جِمّا - جدول التمارين (www/schedule.js)
   تبويب "جدول": أسبوع من 7 أيام، كل يوم إما راحة أو يوم تمرين (Push مثلًا) فيه تمارينه.
   تبدأ بجدول جاهز (PPL وغيره) بيتملا من مكتبتك، أو تعمل جدولك بنفسك.
   الأيام ممكن تتكرر في الأسبوع (Push مرتين)، وتعديل اليوم بيتطبق على كل مرة. */
(function () {
  var UI = window.GemmaUI, h = UI.h, S = window.GemmaStore, M = window.GemmaMuscles;

  var ICON = {
    back: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    pencil: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>',
    check: '<path d="M5 12l5 5 9-10"/>',
    x: '<path d="M6 6l12 12M18 6L6 18"/>',
    up: '<path d="M6 15l6-6 6 6"/>',
    down: '<path d="M6 9l6 6 6-6"/>'
  };
  // 0 = الأحد ... 6 = السبت (زي getDay)
  var WEEKDAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

  // ---------- الجداول الجاهزة ----------
  // slots: { m: id العضلة } أو { p: id الجزء } و n = عدد التمارين اللي تتاخد من مكتبتك
  // week: رقم اليوم (0 أحد ... 6 سبت) ← مفتاح اليوم. اللي مش مذكور = راحة.
  var TEMPLATES = [
    { id: 'ppl', name: 'PPL', blurb: 'دفع / سحب / رجل · 6 أيام تمرين وراحة',
      days: {
        push: { name: 'Push', slots: [{ m: 'chest', n: 3 }, { p: 'shoulder_side', n: 2 }, { p: 'shoulder_front', n: 1 }, { m: 'triceps', n: 2 }] },
        pull: { name: 'Pull', slots: [{ m: 'back', n: 4 }, { p: 'shoulder_rear', n: 1 }, { m: 'biceps', n: 2 }, { p: 'traps_upper', n: 1 }] },
        legs: { name: 'Legs', slots: [{ m: 'quads', n: 2 }, { m: 'hamstrings', n: 2 }, { m: 'glutes', n: 1 }, { m: 'calves', n: 2 }, { m: 'abs', n: 1 }] }
      },
      week: { 6: 'push', 0: 'pull', 1: 'legs', 2: 'push', 3: 'pull', 4: 'legs' } },
    { id: 'ul', name: 'Upper / Lower', blurb: 'علوي / سفلي · 4 أيام تمرين',
      days: {
        upper: { name: 'Upper', slots: [{ m: 'chest', n: 2 }, { m: 'back', n: 2 }, { m: 'shoulder', n: 2 }, { m: 'biceps', n: 1 }, { m: 'triceps', n: 1 }] },
        lower: { name: 'Lower', slots: [{ m: 'quads', n: 2 }, { m: 'hamstrings', n: 2 }, { m: 'glutes', n: 1 }, { m: 'calves', n: 2 }, { m: 'abs', n: 1 }] }
      },
      week: { 6: 'upper', 0: 'lower', 2: 'upper', 3: 'lower' } },
    { id: 'fb', name: 'Full Body', blurb: 'جسم كامل · 3 أيام تمرين',
      days: {
        full: { name: 'Full Body', slots: [{ m: 'chest', n: 1 }, { m: 'back', n: 1 }, { m: 'shoulder', n: 1 }, { m: 'quads', n: 1 }, { m: 'hamstrings', n: 1 }, { m: 'biceps', n: 1 }, { m: 'triceps', n: 1 }, { m: 'abs', n: 1 }] }
      },
      week: { 6: 'full', 1: 'full', 3: 'full' } },
    { id: 'bro', name: 'Bro Split', blurb: 'عضلة في اليوم · 5 أيام تمرين',
      days: {
        chest: { name: 'Chest', slots: [{ m: 'chest', n: 5 }] },
        back: { name: 'Back', slots: [{ m: 'back', n: 5 }] },
        shoulders: { name: 'Shoulders', slots: [{ m: 'shoulder', n: 4 }, { m: 'traps', n: 1 }] },
        arms: { name: 'Arms', slots: [{ m: 'biceps', n: 3 }, { m: 'triceps', n: 3 }, { m: 'forearm', n: 1 }] },
        legs: { name: 'Legs', slots: [{ m: 'quads', n: 2 }, { m: 'hamstrings', n: 2 }, { m: 'glutes', n: 1 }, { m: 'calves', n: 2 }] }
      },
      week: { 6: 'chest', 0: 'back', 1: 'shoulders', 2: 'arms', 3: 'legs' } }
  ];

  var view = { dayId: null };
  var navBack = null;

  function D() { return S.data; }
  function fail(e) { UI.toast('خطأ: ' + (e && e.message ? e.message : e), 5000); }
  function save() { return S.save().then(function () { UI.render(); }).catch(fail); }

  // ---------- بيانات ----------
  function exById(id) { return D().exercises.filter(function (e) { return e.id === id; })[0] || null; }
  function dayById(id) { return D().days.filter(function (d) { return d.id === id && !d.archived; })[0] || null; }
  function programById(id) { return D().programs.filter(function (p) { return p.id === id; })[0] || null; }
  function activeProgram() {
    var id = D().settings && D().settings.activeProgramId;
    return id ? programById(id) : null;
  }
  function placeLabel(placeId) {
    var p = M.findPlace(D(), placeId);
    if (!p) return '؟';
    return p.muscleName === p.name ? p.name : p.muscleName + ' › ' + p.name;
  }
  // الأسبوع بيبدأ من السبت لحد ما نعمل إعداد ليه (settings.weekStart)
  function weekStart() {
    var w = D().settings && D().settings.weekStart;
    return typeof w === 'number' ? w : 6;
  }
  function weekOrder() {
    var o = [];
    for (var i = 0; i < 7; i++) o.push((weekStart() + i) % 7);
    return o;
  }
  function dayForWeekday(p, wd) {
    var id = p && p.week && p.week[wd];
    return id ? dayById(id) : null;
  }
  function programDays(p) {
    return (p.dayIds || []).map(dayById).filter(Boolean);
  }
  function weekdaysOf(p, dayId) {
    var out = [];
    weekOrder().forEach(function (wd) { if (p.week && p.week[wd] === dayId) out.push(WEEKDAYS[wd]); });
    return out;
  }
  function musclesOf(d) {
    var seen = [];
    d.items.forEach(function (it) {
      var ex = exById(it.exerciseId);
      var pl = ex && M.findPlace(D(), ex.placeId);
      if (pl && seen.indexOf(pl.muscleName) < 0) seen.push(pl.muscleName);
    });
    return seen;
  }
  function todayDay() { var p = activeProgram(); return p ? dayForWeekday(p, new Date().getDay()) : null; }
  function dayForDate(dateStr) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr || '');
    if (!m) return null;
    var p = activeProgram();
    return p ? dayForWeekday(p, new Date(+m[1], +m[2] - 1, +m[3]).getDay()) : null;
  }

  // تنضيف: تمرين اتمسح من المكتبة وهو جوه يوم
  function prune() {
    var changed = false;
    D().days.forEach(function (d) {
      var n = d.items.length;
      d.items = d.items.filter(function (i) { return exById(i.exerciseId); });
      if (d.items.length !== n) changed = true;
    });
    if (changed) S.save().catch(function () {});
  }

  function activate(p) {
    if (D().settings.activeProgramId === p.id) return Promise.resolve();
    D().settings.activeProgramId = p.id;
    D().programHistory.push({ programId: p.id, from: S.today() });
    return S.save();
  }

  // ---------- عناصر مشتركة ----------
  function setBack(fn) {
    if (navBack) { UI.popBack(navBack); navBack = null; }
    if (fn) { navBack = fn; UI.pushBack(fn); }
  }
  function iconBtn(icon, label, fn, disabled) {
    return h('button', { class: 'icon-btn', 'aria-label': label, disabled: disabled,
      on: { click: function (e) { e.stopPropagation(); fn(); } } }, [UI.icon(icon)]);
  }
  function head(title, backFn) {
    var kids = [];
    if (backFn) kids.push(iconBtn(ICON.back, 'رجوع', backFn));
    kids.push(h('h1', { class: 'title', text: title }));
    kids.push(h('button', { class: 'icon-btn' + (UI.editing ? ' on' : ''), 'aria-label': 'تعديل',
      on: { click: function () { UI.setEditing(!UI.editing); } } }, [UI.icon(UI.editing ? ICON.check : ICON.pencil)]));
    return h('div', { class: 'page-head' }, kids);
  }
  function rowEl(name, sub, kids, onClick) {
    var attrs = { class: 'row' };
    if (onClick) { attrs.role = 'button'; attrs.on = { click: onClick }; }
    var info = h('div', { class: 'grow' }, [h('div', { class: 'name', text: name }), sub ? h('div', { class: 'sub', text: sub }) : null]);
    return h('div', attrs, [info].concat(kids || []));
  }
  function field(label, input) { return h('label', { class: 'field' }, [h('span', { text: label }), input]); }
  function choiceRow(label, sub, selected, onPick) {
    var tick = h('span', { class: 'tick' }, [UI.icon(ICON.check)]);
    var r = h('div', { class: 'row' + (selected ? ' sel' : ''), role: 'button' }, [
      h('div', { class: 'grow' }, [h('div', { class: 'name', text: label }), sub ? h('div', { class: 'sub', text: sub }) : null]), tick]);
    r.addEventListener('click', onPick);
    return r;
  }

  // ---------- بناء الجدول الجاهز من المكتبة ----------
  // بيختار تمارين من مكتبتك للعضلة، موزّعة على أجزائها (علوي/وسط/سفلي...) بالدور
  function pickExercises(slot, taken) {
    var places = M.places(D()).filter(function (pl) { return slot.p ? pl.id === slot.p : pl.muscleId === slot.m; });
    var lists = places.map(function (pl) {
      return D().exercises.filter(function (e) { return !e.archived && e.placeId === pl.id && taken.indexOf(e.id) < 0; });
    });
    var out = [];
    var round = 0;
    while (out.length < slot.n) {
      var any = false;
      for (var i = 0; i < lists.length && out.length < slot.n; i++) {
        if (lists[i][round]) { out.push(lists[i][round].id); any = true; }
      }
      if (!any) break;
      round++;
    }
    return out;
  }
  function buildTemplate(t) {
    var built = {};
    Object.keys(t.days).forEach(function (k) {
      var taken = [];
      t.days[k].slots.forEach(function (slot) { pickExercises(slot, taken).forEach(function (id) { taken.push(id); }); });
      built[k] = taken;
    });
    return built;
  }

  function uniqueName(base) {
    var names = D().programs.map(function (p) { return p.name; });
    if (names.indexOf(base) < 0) return base;
    var i = 2;
    while (names.indexOf(base + ' (' + i + ')') >= 0) i++;
    return base + ' (' + i + ')';
  }

  function createFromTemplate(t) {
    var built = buildTemplate(t);
    var p = { id: S.id('prog'), name: uniqueName(t.name), week: {}, dayIds: [] };
    var ids = {};
    Object.keys(t.days).forEach(function (k) {
      var d = { id: S.id('day'), name: t.days[k].name, items: built[k].map(function (id) { return { exerciseId: id, target: '' }; }) };
      D().days.push(d);
      p.dayIds.push(d.id);
      ids[k] = d.id;
    });
    Object.keys(t.week).forEach(function (wd) { p.week[wd] = ids[t.week[wd]]; });
    D().programs.push(p);
    return activate(p).then(function () { return p; });
  }

  // ---------- اختيار جدول جديد ----------
  function openChooser() {
    var sh;
    var rows = TEMPLATES.map(function (t) {
      return rowEl(t.name, t.blurb, null, function () { sh.close(); previewTemplate(t); });
    });
    rows.push(rowEl('أعمل جدولي بنفسي', 'أسبوع فاضي، وإنت توزّع الأيام والتمارين', null, function () { sh.close(); openCustomName(); }));
    sh = UI.sheet({
      title: 'اختار جدول',
      content: h('div', {}, [h('p', { class: 'dim', text: 'الجداول الجاهزة بتتملا من تمارين مكتبتك حسب العضلة، وتقدر تعدّل أي حاجة بعد كده.' })].concat(rows)),
      actions: [{ label: 'إلغاء' }]
    });
  }

  function previewTemplate(t) {
    var built = buildTemplate(t);
    var lines = Object.keys(t.days).map(function (k) {
      var n = built[k].length;
      return t.days[k].name + ': ' + (n ? n + ' تمرين' : 'فاضي (مفيش تمارين للعضلات دي في مكتبتك)');
    });
    var order = weekOrder().map(function (wd) { return WEEKDAYS[wd] + ' ' + (t.week[wd] ? t.days[t.week[wd]].name : 'راحة'); });
    UI.confirm({
      title: 'جدول ' + t.name,
      text: order.join(' · ') + '. ' + lines.join(' · ') + '.',
      ok: 'ابني الجدول'
    }).then(function (yes) {
      if (!yes) return;
      createFromTemplate(t).then(function () { UI.toast('الجدول اتعمل. عدّل أي يوم من القلم.', 3500); save(); }).catch(fail);
    });
  }

  function openCustomName() {
    var nameIn = h('input', { type: 'text', placeholder: 'مثلًا: جدولي' });
    nameIn.value = 'جدولي';
    UI.sheet({
      title: 'جدول جديد',
      content: field('اسم الجدول', nameIn),
      actions: [
        { label: 'إلغاء' },
        { label: 'إنشاء', kind: 'primary', onClick: function () {
          var name = nameIn.value.trim();
          if (!name) { UI.toast('اكتب اسم الجدول'); return false; }
          var p = { id: S.id('prog'), name: uniqueName(name), week: {}, dayIds: [] };
          D().programs.push(p);
          activate(p).then(function () { UI.setEditing(true); UI.toast('دوس على أي يوم عشان تحدد تمارينه'); save(); }).catch(fail);
        } }
      ]
    });
  }

  function openSwitcher() {
    var act = activeProgram();
    var sh;
    var rows = D().programs.map(function (p) {
      var n = weekOrder().filter(function (wd) { return dayForWeekday(p, wd); }).length;
      return choiceRow(p.name, n + ' أيام تمرين', act && act.id === p.id, function () {
        sh.close();
        activate(p).then(function () { view.dayId = null; save(); }).catch(fail);
      });
    });
    sh = UI.sheet({
      title: 'جداولي',
      content: h('div', {}, rows),
      actions: [
        { label: 'إلغاء' },
        { label: '+ جدول جديد', kind: 'primary', onClick: function () { openChooser(); } }
      ]
    });
  }

  // ---------- الصفحة الرئيسية للجدول ----------
  function renderWeek(box) {
    setBack(null);
    box.appendChild(head('جدول التمارين', null));
    var p = activeProgram();
    if (!p) {
      box.appendChild(h('div', { class: 'card' }, [
        h('h3', { class: 'title', style: 'margin:0 0 6px;font-size:22px', text: 'لسه معندكش جدول' }),
        h('p', { class: 'dim', text: 'اختار جدول جاهز (PPL أو Upper / Lower أو غيرهم) وهيتملا من تمارين مكتبتك، أو اعمل جدولك بنفسك وحط كل يوم تمارينه.' }),
        h('button', { class: 'btn primary block', style: 'margin-bottom:10px', text: 'اختار جدول جاهز', on: { click: openChooser } }),
        h('button', { class: 'btn block', text: 'أعمل جدولي بنفسي', on: { click: openCustomName } })
      ]));
      return;
    }

    var top = [
      h('div', { class: 'grow' }, [h('div', { class: 'name', text: p.name }), h('div', { class: 'sub', text: 'الجدول الحالي' })]),
      h('button', { class: 'btn small', text: 'تغيير الجدول', on: { click: openSwitcher } })
    ];
    box.appendChild(h('div', { class: 'row', style: 'cursor:default' }, top));
    if (UI.editing) {
      box.appendChild(h('div', { class: 'actions', style: 'display:flex;gap:10px;margin-bottom:14px' }, [
        h('button', { class: 'btn small', style: 'flex:1', text: 'تغيير الاسم', on: { click: function () { openProgramName(p); } } }),
        h('button', { class: 'btn small danger', style: 'flex:1', text: 'حذف الجدول', on: { click: function () { deleteProgram(p); } } })
      ]));
      box.appendChild(h('p', { class: 'dim', text: 'دوس على أي يوم تغيّر نوعه (راحة / يوم تمرين).' }));
    }

    var today = new Date().getDay();
    weekOrder().forEach(function (wd) {
      var day = dayForWeekday(p, wd);
      var sub = null;
      if (day) {
        var ms = musclesOf(day);
        sub = (day.items.length ? day.items.length + ' تمرين' : 'من غير تمارين') + (ms.length ? ' · ' + ms.slice(0, 3).join(' · ') : '');
      }
      var kids = [];
      if (wd === today) kids.push(h('span', { class: 'tag', text: 'النهارده' }));
      kids.push(h('span', { class: day ? 'name' : 'dim', text: day ? day.name : 'راحة' }));
      var info = h('div', { class: 'grow' }, [h('div', { class: 'name', text: WEEKDAYS[wd] }), sub ? h('div', { class: 'sub', text: sub }) : null]);
      box.appendChild(h('div', { class: 'row', role: 'button', on: { click: function () {
        if (UI.editing) openAssign(p, wd);
        else if (day) { view.dayId = day.id; UI.render(); }
      } } }, [info].concat(kids)));
    });
  }

  function openProgramName(p) {
    var nameIn = h('input', { type: 'text' });
    nameIn.value = p.name;
    UI.sheet({
      title: 'تغيير اسم الجدول',
      content: field('اسم الجدول', nameIn),
      actions: [
        { label: 'إلغاء' },
        { label: 'حفظ', kind: 'primary', onClick: function () {
          var name = nameIn.value.trim();
          if (!name) { UI.toast('اكتب الاسم'); return false; }
          p.name = name; save();
        } }
      ]
    });
  }

  function deleteProgram(p) {
    var logged = function (d) { return D().sessions.some(function (s) { return s.dayId === d.id; }); };
    UI.confirm({
      title: 'تمسح جدول "' + p.name + '"؟',
      text: 'هتتمسح أيامه وتمارينها المرتبة فيه. التمارين نفسها والفيديوهات في المكتبة مش هتتأثر.',
      ok: 'امسح', danger: true
    }).then(function (yes) {
      if (!yes) return;
      D().days.forEach(function (d) {
        if ((p.dayIds || []).indexOf(d.id) >= 0 && logged(d)) d.archived = true;
      });
      D().days = D().days.filter(function (d) { return (p.dayIds || []).indexOf(d.id) < 0 || d.archived; });
      D().programs = D().programs.filter(function (x) { return x !== p; });
      if (D().settings.activeProgramId === p.id) {
        var next = D().programs[0] || null;
        D().settings.activeProgramId = next ? next.id : null;
        if (next) D().programHistory.push({ programId: next.id, from: S.today() });
      }
      view.dayId = null;
      save();
    });
  }

  // تغيير نوع يوم في الأسبوع: راحة / يوم من أيام الجدول / يوم جديد
  function openAssign(p, wd) {
    var cur = p.week && p.week[wd] ? p.week[wd] : null;
    var sh;
    function set(id) { if (!p.week) p.week = {}; p.week[wd] = id; sh.close(); save(); }
    var rows = [choiceRow('راحة', null, !cur, function () { set(null); })];
    programDays(p).forEach(function (d) {
      rows.push(choiceRow(d.name, d.items.length + ' تمرين', cur === d.id, function () { set(d.id); }));
    });
    rows.push(rowEl('+ يوم جديد', 'مثلًا Chest أو Push', null, function () { sh.close(); openDayName(null, p, wd); }));
    sh = UI.sheet({ title: WEEKDAYS[wd], content: h('div', {}, rows), actions: [{ label: 'إلغاء' }] });
  }

  // ---------- شاشة اليوم ----------
  function renderDay(box, p) {
    var d = dayById(view.dayId);
    if (!d) { view.dayId = null; return renderWeek(box); }
    setBack(function () { view.dayId = null; UI.render(); });
    box.appendChild(head(d.name, navBack));
    var used = weekdaysOf(p, d.id);
    if (used.length) box.appendChild(h('p', { class: 'dim', style: 'margin:0 0 12px', text: 'أيام: ' + used.join('، ') + (used.length > 1 ? ' (أي تعديل هنا بيتطبق على كل الأيام دي)' : '') }));
    if (UI.editing) {
      box.appendChild(h('button', { class: 'btn primary block', style: 'margin-bottom:10px', text: '+ إضافة تمرين', on: { click: function () { openPicker(d); } } }));
      box.appendChild(h('div', { class: 'actions', style: 'display:flex;gap:10px;margin-bottom:14px' }, [
        h('button', { class: 'btn small', style: 'flex:1', text: 'تغيير الاسم', on: { click: function () { openDayName(d); } } }),
        h('button', { class: 'btn small danger', style: 'flex:1', text: 'حذف اليوم', on: { click: function () { deleteDay(d, p); } } })
      ]));
    }
    if (!d.items.length) {
      box.appendChild(h('div', { class: 'empty', text: UI.editing ? 'اليوم فاضي. دوس "إضافة تمرين".' : 'اليوم فاضي. دوس على القلم وضيف تمارين.' }));
    }
    d.items.forEach(function (it, i) { box.appendChild(itemRow(d, it, i)); });
  }

  function itemRow(d, it, i) {
    var ex = exById(it.exerciseId);
    var sub = placeLabel(ex.placeId) + (ex.archived ? ' · مؤرشف' : '');
    if (!UI.editing) {
      var kids = [];
      if (ex.videoFile && window.GemmaThumbs) kids.push(window.GemmaThumbs.make(ex));
      kids.push(h('div', { class: 'grow' }, [h('div', { class: 'name', text: ex.name }), h('div', { class: 'sub', text: sub })]));
      if (it.target) kids.push(h('span', { class: 'badge num', text: it.target }));
      return h('div', { class: 'row', role: 'button', on: { click: function () {
        if (ex.videoFile && window.GemmaLib) window.GemmaLib.playVideo(ex);
        else UI.toast('مفيش فيديو للتمرين ده');
      } } }, kids);
    }
    var tin = h('input', { type: 'text', class: 'target-in', placeholder: 'عدّات', maxlength: '12', 'aria-label': 'العدّات المستهدفة' });
    tin.value = it.target || '';
    tin.addEventListener('change', function () { it.target = tin.value.trim(); S.save().catch(fail); });
    function move(delta) {
      var j = i + delta;
      if (j < 0 || j >= d.items.length) return;
      var t = d.items[i]; d.items[i] = d.items[j]; d.items[j] = t;
      save();
    }
    return h('div', { class: 'row col' }, [
      h('div', {}, [h('div', { class: 'name', text: ex.name }), h('div', { class: 'sub', text: sub })]),
      h('div', { class: 'ctl' }, [
        tin,
        h('span', { class: 'grow' }),
        iconBtn(ICON.up, 'فوق', function () { move(-1); }, i === 0),
        iconBtn(ICON.down, 'تحت', function () { move(1); }, i === d.items.length - 1),
        iconBtn(ICON.x, 'شيل من اليوم', function () { d.items.splice(i, 1); save(); })
      ])
    ]);
  }

  // اسم يوم: تغيير اسم يوم موجود، أو يوم جديد (ويتحط في يوم الأسبوع wd لو اتحدد)
  function openDayName(d, p, wd) {
    var nameIn = h('input', { type: 'text', placeholder: 'مثلًا: Chest' });
    nameIn.value = d ? d.name : '';
    UI.sheet({
      title: d ? 'تغيير اسم اليوم' : 'يوم جديد',
      content: field('اسم اليوم', nameIn),
      actions: [
        { label: 'إلغاء' },
        { label: 'حفظ', kind: 'primary', onClick: function () {
          var name = nameIn.value.trim();
          if (!name) { UI.toast('اكتب اسم اليوم'); return false; }
          if (d) { d.name = name; save(); return; }
          var nd = { id: S.id('day'), name: name, items: [] };
          D().days.push(nd);
          if (!p.dayIds) p.dayIds = [];
          p.dayIds.push(nd.id);
          if (!p.week) p.week = {};
          p.week[wd] = nd.id;
          view.dayId = nd.id; // يفتح اليوم الجديد على طول عشان تضيف تمارينه
          save();
        } }
      ]
    });
  }

  function deleteDay(d, p) {
    var used = weekdaysOf(p, d.id);
    var logged = D().sessions.some(function (s) { return s.dayId === d.id; });
    UI.confirm({
      title: 'تمسح يوم "' + d.name + '"؟',
      text: (used.length ? 'هيتحول لراحة في: ' + used.join('، ') + '. ' : '') + (logged ? 'ليه سجل تمارين فهيتأرشف والسجل مش هيضيع.' : 'مش هتقدر ترجعه.'),
      ok: logged ? 'أرشف' : 'امسح', danger: true
    }).then(function (yes) {
      if (!yes) return;
      Object.keys(p.week || {}).forEach(function (k) { if (p.week[k] === d.id) p.week[k] = null; });
      p.dayIds = (p.dayIds || []).filter(function (id) { return id !== d.id; });
      if (logged) d.archived = true;
      else D().days = D().days.filter(function (x) { return x !== d; });
      view.dayId = null;
      save();
    });
  }

  // اختيار تمارين من المكتبة (أكتر من واحد مرة واحدة)
  function openPicker(d) {
    var chosen = [];
    var inDay = d.items.map(function (i) { return i.exerciseId; });
    var count = h('p', { class: 'dim', text: 'لسه ماختارتش حاجة' });
    var search = h('input', { type: 'text', placeholder: 'ابحث بالاسم أو العضلة' });
    var list = h('div');
    var groups = [];

    function norm(t) {
      return String(t || '').toLowerCase().replace(/[ً-ٰٟـ]/g, '')
        .replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').replace(/ذ/g, 'د');
    }

    M.places(D()).forEach(function (pl) {
      var exs = D().exercises.filter(function (e) { return !e.archived && e.placeId === pl.id && inDay.indexOf(e.id) < 0; });
      if (!exs.length) return;
      var label = pl.muscleName === pl.name ? pl.name : pl.muscleName + ' › ' + pl.name;
      var g = { head: h('p', { class: 'dim', style: 'margin:12px 0 6px', text: label }), rows: [] };
      list.appendChild(g.head);
      exs.forEach(function (e) {
        var tick = h('span', { class: 'tick' }, [UI.icon(ICON.check)]);
        var row = h('div', { class: 'row', role: 'button' }, [h('div', { class: 'grow' }, [h('div', { class: 'name', text: e.name })]), tick]);
        row.addEventListener('click', function () {
          var k = chosen.indexOf(e.id);
          if (k >= 0) chosen.splice(k, 1); else chosen.push(e.id);
          row.classList.toggle('sel', k < 0);
          count.textContent = chosen.length ? 'اتحدد: ' + chosen.length : 'لسه ماختارتش حاجة';
        });
        list.appendChild(row);
        g.rows.push({ el: row, hay: norm(e.name + ' ' + pl.muscleName + ' ' + pl.name) });
      });
      groups.push(g);
    });

    search.addEventListener('input', function () {
      var tokens = norm(search.value).split(/\s+/).filter(Boolean);
      groups.forEach(function (g) {
        var any = false;
        g.rows.forEach(function (r) {
          var show = tokens.every(function (t) { return r.hay.indexOf(t) >= 0; });
          r.el.style.display = show ? '' : 'none';
          if (show) any = true;
        });
        g.head.style.display = any ? '' : 'none';
      });
    });

    UI.sheet({
      title: 'إضافة تمارين',
      content: groups.length
        ? h('div', {}, [field('بحث', search), count, list])
        : h('div', { class: 'empty', text: 'مفيش تمارين تانية في المكتبة تتضاف لليوم ده.' }),
      actions: [
        { label: 'إلغاء' },
        { label: 'إضافة', kind: 'primary', onClick: function () {
          if (!chosen.length) { UI.toast('اختار تمرين واحد على الأقل'); return false; }
          chosen.forEach(function (id) { d.items.push({ exerciseId: id, target: '' }); });
          save();
        } }
      ]
    });
  }

  // ---------- التسجيل ----------
  window.GemmaScreens = window.GemmaScreens || {};
  window.GemmaScreens.schedule = function (box) {
    prune();
    var p = activeProgram();
    if (view.dayId && p) return renderDay(box, p);
    view.dayId = null;
    renderWeek(box);
  };

  // للشاشة الرئيسية والتسجيل والحضور (المراحل الجاية)
  window.GemmaSchedule = {
    activeProgram: activeProgram,
    todayDay: todayDay,
    dayForDate: dayForDate,
    dayById: dayById,
    weekdayName: function (wd) { return WEEKDAYS[wd]; }
  };
})();
