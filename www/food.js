/* جِمّا - الأكل والسعرات (www/food.js)
   1) حاسبة سعرات الثبات (Mifflin-St Jeor، أو Katch-McArdle لو دخلت نسبة الدهون) + تثبيت الرقم وتعديله.
   2) الهدف: ثبات / تنشيف / زيادة بمقدار سعرات بتحدده.
   3) وجباتي: وجبة باسم وصورة وسعرات (وماكروز اختيارية) تتحفظ وتتسجل بضغطة.
   4) شاشة اليوم: الهدف - اللي أكلته = فاضلك كام. */
(function () {
  var UI = window.GemmaUI, h = UI.h, S = window.GemmaStore;

  var ICON = {
    back: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    fwd: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
    pencil: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>',
    check: '<path d="M5 12l5 5 9-10"/>',
    x: '<path d="M6 6l12 12M18 6L6 18"/>',
    plate: '<path d="M7 3v8M5 3v5a2 2 0 0 0 4 0V3M7 11v10M17 3c-2 2-3 5-3 8h3v10"/>'
  };

  var view = { sub: null, date: null };
  var navBack = null;
  var lastCalc = null;

  var NEAT = {
    low: { f: 1.2, label: 'قاعد معظم اليوم (دراسة / مكتب)' },
    mid: { f: 1.3, label: 'حركة خفيفة (بتمشي كتير أو شغل واقف)' },
    high: { f: 1.45, label: 'نشيط (شغل بدني طول اليوم)' }
  };
  var INTENSITY = {
    light: { met: 3.5, label: 'خفيف (راحة كتير بين المجموعات)' },
    moderate: { met: 5, label: 'متوسط' },
    hard: { met: 6, label: 'عالي (تمرين شاق ومتواصل)' }
  };
  var GOALS = { cut: 'تنشيف', maintain: 'ثبات', bulk: 'تضخيم' };
  var GOAL_DEFAULT = { cut: 500, maintain: 0, bulk: 300 };

  function D() { return S.data; }
  function fail(e) { UI.toast('خطأ: ' + (e && e.message ? e.message : e), 5000); }
  function save() { return S.save().then(function () { UI.render(); }).catch(fail); }
  function fs() { return window.Capacitor.Plugins.Filesystem; }
  function num(t) { return h('span', { class: 'num', text: String(t) }); }
  function r0(n) { return Math.round(n); }
  function field(label, input) { return h('label', { class: 'field' }, [h('span', { text: label }), input]); }
  function numIn(value, attrs) {
    var i = h('input', Object.assign({ type: 'number', inputmode: 'decimal' }, attrs || {}));
    if (value !== '' && value !== null && value !== undefined) i.value = value;
    return i;
  }
  function val(i) { var v = parseFloat(i.value); return isFinite(v) ? v : null; }

  // ---------- التواريخ ----------
  function addDays(dateStr, n) {
    var p = dateStr.split('-');
    var d = new Date(+p[0], +p[1] - 1, +p[2] + n);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function dateLabel(dateStr) {
    var t = S.today();
    if (dateStr === t) return 'النهارده';
    if (dateStr === addDays(t, -1)) return 'امبارح';
    return dateStr;
  }

  // ---------- بيانات الطاقة ----------
  function profile() { if (!D().profile) D().profile = {}; return D().profile; }
  function energy() {
    var p = profile();
    if (!p.energy) p.energy = { maintenance: null, calc: null, bmr: null, manual: false, goal: 'maintain', amount: 0 };
    return p.energy;
  }
  function targetKcal() {
    var e = energy();
    if (!e.maintenance) return null;
    var d = e.goal === 'cut' ? -e.amount : e.goal === 'bulk' ? e.amount : 0;
    return Math.max(0, e.maintenance + d);
  }

  // احتياجك اليومي من الماكروز (جرام). بيتحدد في أول تشغيل وبيتعدل من صفحة الأكل
  function macroTargets() {
    var m = energy().macros;
    return (m && m.p > 0 && m.c > 0 && m.f > 0) ? m : null;
  }
  function totalsOn(date) {
    var t = { kcal: 0, p: 0, c: 0, f: 0 };
    D().foodLogs.forEach(function (e) {
      if (e.date !== date) return;
      t.kcal += e.kcal || 0; t.p += e.p || 0; t.c += e.c || 0; t.f += e.f || 0;
    });
    return t;
  }

  // ---------- الحساب ----------
  function calcTdee(i) {
    var usedBf = i.bodyFat !== null && i.bodyFat >= 3 && i.bodyFat <= 60;
    var bmr = usedBf
      ? 370 + 21.6 * (i.weight * (1 - i.bodyFat / 100))
      : 10 * i.weight + 6.25 * i.height - 5 * i.age + (i.sex === 'm' ? 5 : -161);
    var base = bmr * NEAT[i.neat].f;
    var exercise = (INTENSITY[i.intensity].met - 1) * i.weight * (i.minutes / 60) * i.days / 7;
    return { bmr: bmr, activity: base - bmr, exercise: exercise, total: base + exercise, method: usedBf ? 'Katch-McArdle' : 'Mifflin-St Jeor' };
  }

  // ---------- الصور ----------
  function photoEl(rel, cls) {
    var box = h('div', { class: cls || 'mphoto' });
    if (!rel) { box.appendChild(UI.icon(ICON.plate)); return box; }
    box.appendChild(UI.icon(ICON.plate));
    S.fileUri(rel).then(function (u) {
      var img = h('img', { alt: '', loading: 'lazy' });
      img.src = u;
      img.addEventListener('load', function () { box.textContent = ''; box.appendChild(img); });
    }).catch(function () {});
    return box;
  }

  async function shrink(rel) {
    try {
      var url = await S.fileUri(rel);
      var img = await new Promise(function (res, rej) {
        var i = new Image();
        i.onload = function () { res(i); };
        i.onerror = function () { rej(new Error('img')); };
        i.src = url;
      });
      var max = 900, k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
      var c = document.createElement('canvas');
      c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      var out = rel.replace(/\.[^.\/]+$/, '') + '.jpg';
      var b64 = c.toDataURL('image/jpeg', 0.82).split(',')[1];
      await fs().writeFile({ path: out, directory: 'DATA', data: b64, recursive: true });
      if (out !== rel) await S.removeFile(rel);
      return out;
    } catch (e) { return rel; }
  }

  async function pickPhoto() {
    var FP = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.FilePicker;
    if (!FP) throw new Error('بلجن اختيار الملفات مش موجود');
    var r;
    try { r = await FP.pickFiles({ types: ['image/*'], limit: 1, readData: false }); }
    catch (e) { if (/cancel/i.test(String(e && e.message))) return null; throw e; }
    var f = (r.files || [])[0];
    if (!f) return null;
    var m = /\.[A-Za-z0-9]{2,5}$/.exec(f.name || '');
    var rel = 'photos/' + S.id('m') + (m ? m[0].toLowerCase() : '.jpg');
    await S.copyIn(f.path, rel);
    if (!/^content:/i.test(f.path)) fs().deleteFile({ path: f.path }).catch(function () {});
    return shrink(rel);
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
  function head(title, backFn, withEdit) {
    var kids = [];
    if (backFn) kids.push(iconBtn(ICON.back, 'رجوع', backFn));
    kids.push(h('h1', { class: 'title', text: title }));
    if (withEdit) {
      kids.push(h('button', { class: 'icon-btn' + (UI.editing ? ' on' : ''), 'aria-label': 'تعديل',
        on: { click: function () { UI.setEditing(!UI.editing); } } }, [UI.icon(UI.editing ? ICON.check : ICON.pencil)]));
    }
    return h('div', { class: 'page-head' }, kids);
  }
  function linkRow(name, sub, onClick) {
    return h('div', { class: 'row', role: 'button', on: { click: onClick } }, [
      h('div', { class: 'grow' }, [h('div', { class: 'name', text: name }), sub ? h('div', { class: 'sub', text: sub }) : null]),
      h('span', { class: 'chev' }, [UI.icon(ICON.back)])
    ]);
  }
  function macroLine(o) {
    var parts = [];
    if (o.p) parts.push('بروتين ' + r0(o.p) + 'g');
    if (o.c) parts.push('كارب ' + r0(o.c) + 'g');
    if (o.f) parts.push('دهون ' + r0(o.f) + 'g');
    return parts.join(' · ');
  }

  // ======================================================================
  // الشاشة الرئيسية: اليوم
  // ======================================================================
  function entriesOf(date) {
    return D().foodLogs.filter(function (e) { return e.date === date; }).sort(function (a, b) { return a.at - b.at; });
  }

  function renderMain(box) {
    setBack(null);
    if (!view.date) view.date = S.today();
    var date = view.date, isToday = date === S.today();
    box.appendChild(head('الأكل', null, true));

    // التنقل بين الأيام
    box.appendChild(h('div', { class: 'daynav' }, [
      iconBtn(ICON.back, 'اليوم اللي قبله', function () { view.date = addDays(date, -1); UI.render(); }),
      h('div', { class: 'grow', style: 'text-align:center;font-weight:600', text: dateLabel(date) }),
      iconBtn(ICON.fwd, 'اليوم اللي بعده', function () { view.date = addDays(date, 1); UI.render(); }, isToday)
    ]));

    var list = entriesOf(date);
    var eaten = 0, tot = { p: 0, c: 0, f: 0 };
    list.forEach(function (e) { eaten += e.kcal || 0; tot.p += e.p || 0; tot.c += e.c || 0; tot.f += e.f || 0; });
    var target = targetKcal();

    // ملخص اليوم
    var card = h('div', { class: 'card' });
    if (target === null) {
      card.appendChild(h('div', { class: 'dim', text: 'أكلت النهارده' }));
      card.appendChild(h('div', { class: 'big' }, [num(r0(eaten)), h('span', { class: 'dim', style: 'font-size:16px', text: ' سعرة' })]));
      card.appendChild(h('p', { class: 'dim', style: 'margin:8px 0 12px', text: 'حدد سعرات ثباتك وهدفك عشان يظهرلك فاضلك كام.' }));
      card.appendChild(h('button', { class: 'btn primary block', text: 'احسب سعرات ثباتي', on: { click: function () { view.sub = 'energy'; UI.render(); } } }));
    } else {
      var left = target - eaten;
      var over = left < 0;
      card.appendChild(h('div', { class: 'dim', text: over ? 'تعدّيت الهدف بـ' : 'فاضلك' }));
      card.appendChild(h('div', { class: 'big' + (over ? ' danger-text' : '') }, [num(r0(Math.abs(left))), h('span', { class: 'dim', style: 'font-size:16px', text: ' سعرة' })]));
      var pct = target > 0 ? Math.min(100, Math.round(eaten / target * 100)) : 0;
      card.appendChild(h('div', { class: 'progress', style: 'margin:10px 0' }, [h('i', { style: 'width:' + pct + '%' })]));
      var goalTxt = GOALS[energy().goal] + (energy().goal !== 'maintain' ? ' ' + (energy().goal === 'cut' ? '−' : '+') + energy().amount : '');
      card.appendChild(h('div', { class: 'dim' }, ['الهدف ', num(r0(target)), ' · أكلت ', num(r0(eaten)), ' · ', goalTxt]));
    }
    box.appendChild(card);
    box.appendChild(macroCard(tot));

    // أزرار التسجيل
    box.appendChild(h('div', { class: 'actions', style: 'display:flex;gap:10px;margin-bottom:14px' }, [
      h('button', { class: 'btn primary', style: 'flex:1', text: '+ سجل وجبة', on: { click: function () { openMealPicker(date); } } }),
      h('button', { class: 'btn', style: 'flex:1', text: 'إضافة سريعة', on: { click: function () { openQuickAdd(date); } } })
    ]));

    // اللي اتسجل
    if (!list.length) box.appendChild(h('div', { class: 'empty', text: 'لسه ماسجلتش أي أكل في اليوم ده.' }));
    list.forEach(function (e) {
      var meal = e.mealId ? mealById(e.mealId) : null;
      var kids = [];
      if (meal && meal.photo) kids.push(photoEl(meal.photo, 'mphoto sm'));
      var sub = (e.qty && e.qty !== 1 ? '×' + e.qty + ' · ' : '') + macroLine(e);
      kids.push(h('div', { class: 'grow' }, [h('div', { class: 'name', text: e.name }), sub ? h('div', { class: 'sub', text: sub }) : null]));
      kids.push(h('span', { class: 'badge num', text: r0(e.kcal) + '' }));
      if (UI.editing) kids.push(iconBtn(ICON.x, 'مسح', function () {
        D().foodLogs = D().foodLogs.filter(function (x) { return x !== e; });
        save();
      }));
      box.appendChild(h('div', { class: 'row' }, kids));
    });

    // روابط
    var en = energy();
    box.appendChild(h('div', { style: 'height:8px' }));
    box.appendChild(linkRow('سعراتي (الثبات والهدف)', en.maintenance ? 'ثبات ' + en.maintenance + ' · هدف ' + r0(target) : 'لسه ماتحددتش', function () { view.sub = 'energy'; UI.render(); }));
    box.appendChild(linkRow('وجباتي', D().savedMeals.length + ' وجبة محفوظة', function () { view.sub = 'meals'; UI.render(); }));
  }

  // كارت الماكروز: أكلت كام وفاضلك كام جرام من احتياجك
  function macroCard(tot) {
    var mt = macroTargets();
    var card = h('div', { class: 'card' });
    card.appendChild(h('div', { class: 'mac-head' }, [
      h('h3', { class: 'title', text: 'احتياجي من الماكروز' }),
      h('button', { class: 'btn small', text: mt ? 'تعديل' : 'حدد', on: { click: openMacroEditor } })
    ]));
    if (!mt) {
      card.appendChild(h('p', { class: 'dim', style: 'margin:0', text: 'حدد احتياجك اليومي من البروتين والكارب والدهون عشان يظهرلك فاضلك كام من كل واحد.' }));
      return card;
    }
    [['p', 'بروتين'], ['c', 'كارب'], ['f', 'دهون']].forEach(function (k) {
      var need = mt[k[0]], got = tot[k[0]] || 0, left = need - got, over = left < 0;
      var pct = Math.min(100, Math.round(got / need * 100));
      card.appendChild(h('div', { class: 'mac' }, [
        h('div', { class: 'mac-top' }, [
          h('span', { class: 'mac-name', text: k[1] }),
          h('span', { class: over ? 'danger-text' : '' }, [over ? 'زيادة ' : 'فاضلك ', num(r0(Math.abs(left))), ' جم'])
        ]),
        h('div', { class: 'progress' }, [h('i', { style: 'width:' + pct + '%' + (over ? ';background:var(--danger)' : '') })]),
        h('div', { class: 'dim mac-sub' }, ['أكلت ', num(r0(got)), ' من ', num(r0(need)), ' جم'])
      ]));
    });
    return card;
  }

  function openMacroEditor() {
    var en = energy(), m = en.macros || {};
    var pin = numIn(m.p || '', { placeholder: 'جم' });
    var cin = numIn(m.c || '', { placeholder: 'جم' });
    var fin = numIn(m.f || '', { placeholder: 'جم' });
    var info = h('p', { class: 'dim', style: 'font-size:14px;margin:0 0 4px' });
    function refresh() {
      var p = val(pin) || 0, c = val(cin) || 0, f = val(fin) || 0;
      var k = r0(p * 4 + c * 4 + f * 9), t = targetKcal();
      info.textContent = 'ده يساوي تقريبًا ' + k + ' سعرة' + (t ? ' (هدفك ' + r0(t) + ')' : '') + '. (بروتين وكارب 4 سعرات للجرام، والدهون 9)';
    }
    [pin, cin, fin].forEach(function (i) { i.addEventListener('input', refresh); });
    refresh();
    UI.sheet({
      title: 'احتياجي اليومي من الماكروز',
      content: h('div', {}, [
        h('div', { class: 'grid3' }, [field('بروتين جم', pin), field('كارب جم', cin), field('دهون جم', fin)]),
        info
      ]),
      actions: [
        { label: 'إلغاء' },
        { label: 'حفظ', kind: 'primary', onClick: function () {
          var p = val(pin), c = val(cin), f = val(fin);
          if (!p || !c || !f || p <= 0 || c <= 0 || f <= 0 || p > 1000 || c > 1500 || f > 600) { UI.toast('اكتب الثلاثة أرقام منطقية'); return false; }
          en.macros = { p: r0(p), c: r0(c), f: r0(f) };
          save();
        } }
      ]
    });
  }

  // ---------- تسجيل أكل ----------
  function mealById(id) { return D().savedMeals.filter(function (m) { return m.id === id; })[0] || null; }

  function addEntry(date, o) {
    D().foodLogs.push({ id: S.id('log'), date: date, mealId: o.mealId || null, name: o.name, kcal: o.kcal, p: o.p || 0, c: o.c || 0, f: o.f || 0, qty: o.qty || 1, at: Date.now() });
    return S.save();
  }

  function openMealPicker(date) {
    var meals = D().savedMeals;
    var sh;
    if (!meals.length) {
      sh = UI.sheet({
        title: 'سجل وجبة',
        content: h('div', { class: 'empty', text: 'مفيش وجبات محفوظة لسه. اعمل وجبتك الأولى باسمها وصورتها وسعراتها.' }),
        actions: [{ label: 'إلغاء' }, { label: '+ وجبة جديدة', kind: 'primary', onClick: function () { openMealEditor(null, function (m) { openLogSheet(m, date); }); } }]
      });
      return;
    }
    var rows = meals.map(function (m) {
      var r = h('div', { class: 'row', role: 'button' }, [
        photoEl(m.photo, 'mphoto sm'),
        h('div', { class: 'grow' }, [h('div', { class: 'name', text: m.name }), h('div', { class: 'sub', text: macroLine(m) })]),
        h('span', { class: 'badge num', text: m.kcal + '' })
      ]);
      r._name = m.name;
      r.addEventListener('click', function () { sh.close(); openLogSheet(m, date); });
      return r;
    });
    var content = h('div', {}, rows);
    if (meals.length > 6) {
      var s = h('input', { type: 'text', placeholder: 'ابحث باسم الوجبة', style: 'margin-bottom:10px' });
      s.addEventListener('input', function () {
        var q = s.value.trim().toLowerCase();
        rows.forEach(function (r) { r.style.display = !q || r._name.toLowerCase().indexOf(q) >= 0 ? '' : 'none'; });
      });
      content = h('div', {}, [s].concat(rows));
    }
    sh = UI.sheet({
      title: 'سجل وجبة (' + dateLabel(date) + ')',
      content: content,
      actions: [{ label: 'إلغاء' }, { label: '+ وجبة جديدة', onClick: function () { openMealEditor(null, function (m) { openLogSheet(m, date); }); } }]
    });
  }

  function openLogSheet(meal, date) {
    var qty = 1;
    var kcalLine = h('div', { class: 'big' });
    var macros = h('div', { class: 'dim', style: 'font-size:14px' });
    var qin = numIn(1, { step: '0.25', min: '0.25' });
    var chips = h('div', { class: 'seg' });
    function refresh() {
      kcalLine.textContent = '';
      kcalLine.appendChild(num(r0(meal.kcal * qty)));
      kcalLine.appendChild(h('span', { class: 'dim', style: 'font-size:16px', text: ' سعرة' }));
      var m = macroLine({ p: (meal.p || 0) * qty, c: (meal.c || 0) * qty, f: (meal.f || 0) * qty });
      macros.textContent = m;
      Array.prototype.forEach.call(chips.children, function (b) { b.classList.toggle('on', parseFloat(b.dataset.q) === qty); });
    }
    [0.5, 1, 1.5, 2].forEach(function (q) {
      var b = h('button', { 'data-q': String(q), text: '×' + q, on: { click: function () { qty = q; qin.value = q; refresh(); } } });
      chips.appendChild(b);
    });
    qin.addEventListener('input', function () { var v = val(qin); if (v && v > 0) { qty = v; refresh(); } });
    UI.sheet({
      title: meal.name,
      content: h('div', {}, [
        meal.photo ? photoEl(meal.photo, 'mphoto lg') : null,
        field('الكمية (عدد الحصص)', qin), chips, kcalLine, macros
      ]),
      actions: [
        { label: 'إلغاء' },
        { label: 'سجل', kind: 'primary', onClick: function () {
          addEntry(date, { mealId: meal.id, name: meal.name, kcal: r0(meal.kcal * qty), p: (meal.p || 0) * qty, c: (meal.c || 0) * qty, f: (meal.f || 0) * qty, qty: qty })
            .then(function () { UI.toast('اتسجلت'); UI.render(); }).catch(fail);
        } }
      ]
    });
    refresh();
  }

  function openQuickAdd(date) {
    var nameIn = h('input', { type: 'text', placeholder: 'اسم (اختياري)' });
    var kin = numIn('', { placeholder: 'السعرات' });
    var pin = numIn('', { placeholder: 'اختياري' });
    var cin = numIn('', { placeholder: 'اختياري' });
    var fin = numIn('', { placeholder: 'اختياري' });
    UI.sheet({
      title: 'إضافة سريعة (' + dateLabel(date) + ')',
      content: h('div', {}, [field('الاسم', nameIn), field('السعرات', kin), h('div', { class: 'grid3' }, [field('بروتين جم', pin), field('كارب جم', cin), field('دهون جم', fin)])]),
      actions: [
        { label: 'إلغاء' },
        { label: 'سجل', kind: 'primary', onClick: function () {
          var k = val(kin);
          if (!k || k <= 0) { UI.toast('اكتب السعرات'); return false; }
          addEntry(date, { name: nameIn.value.trim() || 'إضافة سريعة', kcal: r0(k), p: val(pin) || 0, c: val(cin) || 0, f: val(fin) || 0 })
            .then(function () { UI.render(); }).catch(fail);
        } }
      ]
    });
  }

  // ======================================================================
  // وجباتي
  // ======================================================================
  function renderMeals(box) {
    setBack(function () { view.sub = null; UI.render(); });
    box.appendChild(head('وجباتي', navBack, false));
    box.appendChild(h('button', { class: 'btn primary block', style: 'margin-bottom:14px', text: '+ وجبة جديدة', on: { click: function () { openMealEditor(null); } } }));
    if (!D().savedMeals.length) {
      box.appendChild(h('div', { class: 'empty', text: 'مفيش وجبات لسه. ضيف وجبة باسمها وصورتها وسعراتها (اللي حسبتها إنت)، وبعدها تسجلها بضغطة.' }));
    }
    D().savedMeals.forEach(function (m) {
      box.appendChild(h('div', { class: 'row', role: 'button', on: { click: function () { openMealEditor(m); } } }, [
        photoEl(m.photo, 'mphoto sm'),
        h('div', { class: 'grow' }, [h('div', { class: 'name', text: m.name }), h('div', { class: 'sub', text: macroLine(m) })]),
        h('span', { class: 'badge num', text: m.kcal + '' })
      ]));
    });
  }

  // إضافة / تعديل وجبة. onSaved(meal) بيتنادى بعد الحفظ (اختياري)
  function openMealEditor(m, onSaved) {
    var isNew = !m;
    var nameIn = h('input', { type: 'text', placeholder: 'اسم الوجبة' });
    nameIn.value = m ? m.name : '';
    var kin = numIn(m ? m.kcal : '', { placeholder: 'السعرات' });
    var pin = numIn(m && m.p ? m.p : '', { placeholder: 'اختياري' });
    var cin = numIn(m && m.c ? m.c : '', { placeholder: 'اختياري' });
    var fin = numIn(m && m.f ? m.f : '', { placeholder: 'اختياري' });
    var photo = m ? m.photo || null : null;
    var newPhoto = null, saved = false;
    var photoBox = h('div');
    function drawPhoto() {
      photoBox.textContent = '';
      photoBox.appendChild(photoEl(photo, 'mphoto lg'));
    }
    drawPhoto();
    var pickBtn = h('button', { class: 'btn small', text: 'اختيار صورة', on: { click: async function () {
      try {
        var rel = await pickPhoto();
        if (!rel) return;
        if (newPhoto) S.removeFile(newPhoto);
        newPhoto = rel; photo = rel; drawPhoto();
      } catch (e) { fail(e); }
    } } });
    var clearBtn = h('button', { class: 'btn small danger', text: 'شيل الصورة', on: { click: function () {
      if (newPhoto) { S.removeFile(newPhoto); newPhoto = null; }
      photo = null; drawPhoto();
    } } });
    var kids = [
      photoBox,
      h('div', { class: 'actions', style: 'margin:0 0 12px' }, [pickBtn, clearBtn]),
      field('اسم الوجبة', nameIn), field('السعرات (اللي حسبتها)', kin),
      h('div', { class: 'grid3' }, [field('بروتين جم', pin), field('كارب جم', cin), field('دهون جم', fin)])
    ];
    if (m) {
      kids.push(h('button', { class: 'btn danger block', text: 'مسح الوجبة', on: { click: function () {
        UI.confirm({ title: 'تمسح الوجبة دي؟', text: 'اللي سجلته قبل كده فاضل زي ما هو في أيامه.', ok: 'امسح', danger: true }).then(function (yes) {
          if (!yes) return;
          if (m.photo) S.removeFile(m.photo);
          D().savedMeals = D().savedMeals.filter(function (x) { return x !== m; });
          saved = true; sh.close(); save();
        });
      } } }));
    }
    var sh = UI.sheet({
      title: isNew ? 'وجبة جديدة' : 'تعديل الوجبة',
      content: h('div', {}, kids),
      onClose: function () { if (!saved && newPhoto) S.removeFile(newPhoto); },
      actions: [
        { label: 'إلغاء' },
        { label: 'حفظ', kind: 'primary', onClick: function () {
          var name = nameIn.value.trim(), k = val(kin);
          if (!name || !k || k <= 0) { UI.toast('اكتب الاسم والسعرات'); return false; }
          saved = true;
          var old = m ? m.photo : null;
          var rec = m || { id: S.id('meal'), createdAt: Date.now() };
          rec.name = name; rec.kcal = r0(k); rec.p = val(pin) || 0; rec.c = val(cin) || 0; rec.f = val(fin) || 0; rec.photo = photo;
          if (old && old !== photo) S.removeFile(old);
          if (isNew) D().savedMeals.push(rec);
          S.save().then(function () { UI.render(); if (onSaved) onSaved(rec); }).catch(fail);
        } }
      ]
    });
  }

  // ======================================================================
  // سعراتي: الثبات + الهدف + الحاسبة
  // ======================================================================
  function renderEnergy(box) {
    setBack(function () { view.sub = null; UI.render(); });
    box.appendChild(head('سعراتي', navBack, false));
    var en = energy();

    // 1) سعرات الثبات المحفوظة
    var mc = h('div', { class: 'card' });
    mc.appendChild(h('h3', { class: 'title', style: 'margin:0 0 6px;font-size:20px', text: 'سعرات الثبات' }));
    if (en.maintenance) {
      mc.appendChild(h('div', { class: 'big' }, [num(en.maintenance), h('span', { class: 'dim', style: 'font-size:16px', text: ' سعرة / يوم' })]));
      mc.appendChild(h('p', { class: 'dim', style: 'margin:6px 0 12px', text: en.calc === null ? 'رقم أدخلته بنفسك' : en.manual ? 'معدّلة يدويًا (المحسوبة كانت ' + en.calc + ')' : 'محسوبة بالحاسبة' }));
      var acts = [h('button', { class: 'btn small', style: 'flex:1', text: 'تعديل الرقم', on: { click: openMaintenanceEditor } })];
      if (en.manual && en.calc !== null) acts.push(h('button', { class: 'btn small', style: 'flex:1', text: 'رجّعها للمحسوبة', on: { click: function () {
        en.maintenance = en.calc; en.manual = false; save();
      } } }));
      mc.appendChild(h('div', { class: 'actions', style: 'display:flex;gap:10px' }, acts));
      mc.appendChild(h('p', { class: 'dim', style: 'margin:10px 0 0;font-size:13px', text: 'الرقم ده ثابت ومحفوظ. مابيتغيرش لوحده، إنت اللي بتعدّله بعد تجربتك العملية.' }));
    } else {
      mc.appendChild(h('p', { class: 'dim', text: 'لسه ماحددتش. استخدم الحاسبة تحت، أو لو عارف رقمك دخّله مباشرة.' }));
      mc.appendChild(h('button', { class: 'btn small', text: 'أنا عارف رقمي', on: { click: openMaintenanceEditor } }));
    }
    box.appendChild(mc);

    // 2) الهدف
    var gc = h('div', { class: 'card' });
    gc.appendChild(h('h3', { class: 'title', style: 'margin:0 0 10px;font-size:20px', text: 'هدفك' }));
    if (!en.maintenance) {
      gc.appendChild(h('p', { class: 'dim', text: 'حدد سعرات ثباتك الأول.' }));
    } else {
      var seg = h('div', { class: 'seg' }, Object.keys(GOALS).map(function (g) {
        return h('button', { class: en.goal === g ? 'on' : '', text: GOALS[g], on: { click: function () {
          en.goal = g;
          en.amount = g === 'maintain' ? 0 : (en.amount > 0 ? en.amount : GOAL_DEFAULT[g]);
          save();
        } } });
      }));
      gc.appendChild(seg);
      if (en.goal !== 'maintain') {
        var ain = numIn(en.amount, { step: '50', min: '0', 'aria-label': 'مقدار السعرات' });
        function setAmount(v) { en.amount = Math.max(0, Math.min(1500, r0(v))); save(); }
        ain.addEventListener('change', function () { var v = val(ain); if (v !== null) setAmount(v); });
        gc.appendChild(h('div', { class: 'dim', style: 'margin:4px 0 6px', text: en.goal === 'cut' ? 'هنقلل من سعرات الثبات بمقدار:' : 'هنزود على سعرات الثبات بمقدار:' }));
        gc.appendChild(h('div', { class: 'stepper' }, [
          h('button', { class: 'btn', text: '−50', on: { click: function () { setAmount(en.amount - 50); } } }),
          ain,
          h('button', { class: 'btn', text: '+50', on: { click: function () { setAmount(en.amount + 50); } } })
        ]));
      }
      var t = targetKcal();
      gc.appendChild(h('div', { style: 'margin-top:12px' }, [h('span', { class: 'dim', text: 'هدفك اليومي: ' }), h('span', { class: 'big num', style: 'font-size:32px', text: String(r0(t)) })]));
      if (en.goal === 'cut' && en.amount > en.maintenance * 0.25) {
        gc.appendChild(h('p', { class: 'dim', style: 'margin:8px 0 0;font-size:14px', text: 'تنبيه: النقص ده أكتر من 25% من ثباتك. العادة 10–20% عشان تحافظ على العضل وتقدر تستمر.' }));
      }
      if (en.bmr && t < en.bmr) {
        gc.appendChild(h('p', { class: 'dim', style: 'margin:8px 0 0;font-size:14px', text: 'تنبيه: الهدف أقل من معدل الأيض الأساسي المحسوب (' + r0(en.bmr) + '). ده منخفض أوي وصعب تستمر عليه.' }));
      }
    }
    box.appendChild(gc);

    // احتياجك من الماكروز
    var mt = macroTargets();
    box.appendChild(linkRow('احتياجي من الماكروز', mt ? 'بروتين ' + mt.p + ' · كارب ' + mt.c + ' · دهون ' + mt.f : 'لسه ماتحددش', openMacroEditor));

    // 3) الحاسبة
    box.appendChild(calculatorCard());
  }

  function openMaintenanceEditor() {
    var en = energy();
    var cur = en.maintenance || '';
    var inp = numIn(cur, { step: '50', min: '800', placeholder: 'سعرات الثبات' });
    function bump(d) { var v = val(inp) || en.maintenance || 2000; inp.value = Math.max(800, r0(v + d)); }
    UI.sheet({
      title: 'سعرات الثبات',
      content: h('div', {}, [
        h('p', { class: 'dim', text: 'لو جربت عمليًا ولقيت إن ثباتك أعلى أو أقل، عدّل الرقم هنا وهيتثبت.' }),
        h('div', { class: 'stepper' }, [
          h('button', { class: 'btn', text: '−50', on: { click: function () { bump(-50); } } }),
          inp,
          h('button', { class: 'btn', text: '+50', on: { click: function () { bump(50); } } })
        ])
      ]),
      actions: [
        { label: 'إلغاء' },
        { label: 'تثبيت', kind: 'primary', onClick: function () {
          var v = val(inp);
          if (!v || v < 800 || v > 8000) { UI.toast('اكتب رقم منطقي (800 – 8000)'); return false; }
          en.maintenance = r0(v);
          en.manual = en.calc === null ? false : en.maintenance !== en.calc;
          save();
        } }
      ]
    });
  }

  function calculatorCard() {
    var p = profile(), a = p.activity || {};
    var f = { sex: p.sex || 'm', neat: a.neat || 'low', intensity: a.intensity || 'moderate' };
    var card = h('div', { class: 'card' });
    card.appendChild(h('h3', { class: 'title', style: 'margin:0 0 6px;font-size:20px', text: 'حاسبة سعرات الثبات' }));
    card.appendChild(h('p', { class: 'dim', style: 'margin:0 0 12px;font-size:14px', text: 'تقدير علمي، مش رقم مطلق (الفرق بين الناس ممكن يوصل ±10%). جربه 2–3 أسابيع وعدّله من فوق حسب وزنك الفعلي.' }));

    var sexSeg = h('div', { class: 'seg' }, [['m', 'ذكر'], ['f', 'أنثى']].map(function (s) {
      return h('button', { 'data-v': s[0], class: f.sex === s[0] ? 'on' : '', text: s[1], on: { click: function () {
        f.sex = s[0];
        Array.prototype.forEach.call(sexSeg.children, function (b) { b.classList.toggle('on', b.dataset.v === f.sex); });
      } } });
    }));
    card.appendChild(sexSeg);

    var age = numIn(p.age || '', { placeholder: 'بالسنين' });
    var height = numIn(p.heightCm || '', { placeholder: 'بالسنتيمتر' });
    var weight = numIn(p.weightKg || '', { step: '0.1', placeholder: 'بالكيلو' });
    var bf = numIn(p.bodyFatPct || '', { step: '0.1', placeholder: 'اختياري، لو عارفها بدقة' });
    function sel(map, cur) {
      var s = h('select', {}, Object.keys(map).map(function (k) { return h('option', { value: k, text: map[k].label }); }));
      s.value = cur;
      return s;
    }
    var neat = sel(NEAT, f.neat);
    var days = h('select', {}, [0, 1, 2, 3, 4, 5, 6, 7].map(function (n) { return h('option', { value: String(n), text: n + ' أيام' }); }));
    days.value = String(a.trainDays !== undefined ? a.trainDays : 4);
    var mins = numIn(a.trainMin || 60, { min: '10', max: '240' });
    var inten = sel(INTENSITY, f.intensity);

    card.appendChild(h('div', { class: 'grid2' }, [field('السن', age), field('الطول (سم)', height)]));
    card.appendChild(h('div', { class: 'grid2' }, [field('الوزن (كجم)', weight), field('نسبة الدهون % (اختياري)', bf)]));
    card.appendChild(field('حركتك في اليوم برا التمرين', neat));
    card.appendChild(h('div', { class: 'grid2' }, [field('أيام التمرين في الأسبوع', days), field('مدة التمرين (دقيقة)', mins)]));
    card.appendChild(field('شدة التمرين', inten));

    var result = h('div');
    card.appendChild(h('button', { class: 'btn primary block', text: 'احسب', on: { click: function () {
      var i = { sex: f.sex, age: val(age), height: val(height), weight: val(weight), bodyFat: val(bf), neat: neat.value, days: parseInt(days.value, 10), minutes: val(mins), intensity: inten.value };
      var err = null;
      if (!i.age || i.age < 14 || i.age > 90) err = 'السن لازم يبقى بين 14 و90';
      else if (!i.height || i.height < 120 || i.height > 230) err = 'الطول لازم يبقى بين 120 و230 سم';
      else if (!i.weight || i.weight < 30 || i.weight > 250) err = 'الوزن لازم يبقى بين 30 و250 كجم';
      else if (i.bodyFat !== null && (i.bodyFat < 3 || i.bodyFat > 60)) err = 'نسبة الدهون لازم تبقى بين 3 و60 (أو سيبها فاضية)';
      else if (!i.minutes || i.minutes < 10 || i.minutes > 240) err = 'مدة التمرين لازم تبقى بين 10 و240 دقيقة';
      if (err) { UI.toast(err, 3500); return; }
      // نحفظ المدخلات عشان المرة الجاية (وعشان شاشة الملف الشخصي بعد كده)
      p.sex = i.sex; p.age = i.age; p.heightCm = i.height; p.weightKg = i.weight; p.bodyFatPct = i.bodyFat;
      p.activity = { neat: i.neat, trainDays: i.days, trainMin: i.minutes, intensity: i.intensity };
      S.save().catch(fail);
      var c = lastCalc = calcTdee(i);
      showResult(result, c);
    } } }));
    card.appendChild(result);
    return card;
  }

  function showResult(box, c) {
    var en = energy();
    var total = Math.round(c.total / 10) * 10;
    box.textContent = '';
    box.appendChild(h('div', { class: 'result' }, [
      h('div', { class: 'dim', text: 'سعرات ثباتك المقدّرة' }),
      h('div', { class: 'big' }, [num(total), h('span', { class: 'dim', style: 'font-size:16px', text: ' سعرة / يوم' })]),
      h('div', { class: 'dim', style: 'margin:8px 0;font-size:14px' }, [
        'معدل الأيض الأساسي ', num(r0(c.bmr)), ' + حركة اليوم ', num(r0(c.activity)), ' + التمرين ', num(r0(c.exercise)), h('br'),
        'المعادلة: ' + c.method
      ]),
      h('button', { class: 'btn primary block', text: 'استخدم الرقم ده كسعرات ثباتي', on: { click: function () {
        function apply() {
          en.maintenance = total; en.calc = total; en.manual = false; en.bmr = c.bmr;
          save();
        }
        if (en.maintenance && en.manual) {
          UI.confirm({ title: 'تستبدل رقمك المعدّل؟', text: 'سعراتك المثبتة دلوقتي ' + en.maintenance + ' (عدّلتها بإيدك). هتتبدل بـ ' + total + '.', ok: 'استبدل' }).then(function (y) { if (y) apply(); });
        } else apply();
      } } })
    ]));
  }

  // ---------- التسجيل ----------
  window.GemmaScreens = window.GemmaScreens || {};
  window.GemmaScreens.food = function (box) {
    if (view.sub === 'energy') return renderEnergy(box);
    if (view.sub === 'meals') return renderMeals(box);
    renderMain(box);
  };

  // للمراحل الجاية (ملخص الرئيسية، التحليلات)
  window.GemmaFood = {
    targetKcal: targetKcal,
    eatenOn: function (date) { return entriesOf(date).reduce(function (s, e) { return s + (e.kcal || 0); }, 0); },
    totalsOn: totalsOn,
    macroTargets: macroTargets,
    energy: energy,
    profile: profile,
    calcTdee: calcTdee,
    NEAT: NEAT,
    INTENSITY: INTENSITY,
    GOALS: GOALS,
    GOAL_DEFAULT: GOAL_DEFAULT,
    // من الرئيسية: افتح صفحة الأكل على النهارده
    openToday: function () { view.sub = null; view.date = null; UI.go('food'); }
  };
})();
