/* جِمّا - المكتبة (www/library.js)
   عضلة شاملة ← أجزاء ← تمارين. استيراد فيديوهات جماعي، تشغيل، وضع التعديل. */
(function () {
  var UI = window.GemmaUI, h = UI.h, S = window.GemmaStore, M = window.GemmaMuscles;

  var ICON = {
    back: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    pencil: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>',
    check: '<path d="M5 12l5 5 9-10"/>',
    x: '<path d="M6 6l12 12M18 6L6 18"/>',
    play: '<path d="M9 6l9 6-9 6z"/>'
  };

  var query = '';
  var lastPlaceId = '';

  function D() { return S.data; }
  function fsPlugin() { return window.Capacitor.Plugins.Filesystem; }
  function fail(e) { UI.toast('خطأ: ' + (e && e.message ? e.message : e), 5000); }
  // تتبع مؤقت: بيتحفظ قبل كل خطوة، فيفضل موجود حتى لو التطبيق وقع
  function trace(msg) { D().debug = msg; return S.save().catch(function () {}); }

  // ---------- بيانات ----------
  function hasLog(exId) {
    return D().sessions.some(function (s) { return (s.sets || []).some(function (x) { return x.exerciseId === exId; }); });
  }
  function placeLabel(placeId) {
    var p = M.findPlace(D(), placeId);
    if (!p) return '؟';
    return p.muscleName === p.name ? p.name : p.muscleName + ' › ' + p.name;
  }
  function baseName(n) { return (n || '').replace(/\.[^.]+$/, ''); }
  function extOf(n) { var m = /\.[A-Za-z0-9]{2,5}$/.exec(n || ''); return m ? m[0].toLowerCase() : '.mp4'; }

  // قايمة اختيار المكان (جزء أو عضلة من غير أجزاء)
  function placeSelect(selected) {
    var sel = h('select', {}, [h('option', { value: '', text: 'اختار المكان' })]);
    D().muscles.forEach(function (m) {
      if (m.parts && m.parts.length) {
        sel.appendChild(h('optgroup', { label: m.name }, m.parts.map(function (p) {
          return h('option', { value: p.id, text: p.name });
        })));
      } else {
        sel.appendChild(h('option', { value: m.id, text: m.name }));
      }
    });
    sel.value = selected || '';
    return sel;
  }
  function field(label, input) { return h('label', { class: 'field' }, [h('span', { text: label }), input]); }

  // ---------- اختيار الفيديو وحفظه جوه التطبيق ----------
  async function pickVideos(multiple) {
    var FP = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.FilePicker;
    if (!FP) throw new Error('بلجن اختيار الملفات مش موجود');
    try {
      var r = await FP.pickFiles({ types: ['video/*'], limit: multiple ? 0 : 1, readData: false });
      return r.files || [];
    } catch (e) {
      if (/cancel/i.test(String(e && e.message))) return [];
      throw e;
    }
  }
  async function copyVideoIn(srcPath, origName) {
    var rel = 'videos/' + S.id('v') + extOf(origName);
    await trace('1) قبل النسخ من: ' + srcPath + ' ← ' + rel);
    await S.copyIn(srcPath, rel);
    await trace('2) النسخ نجح');
    if (!/^content:/i.test(srcPath)) fsPlugin().deleteFile({ path: srcPath }).catch(function () {}); // مسح نسخة المنتقي المؤقتة بس، مش الأصل
    return rel;
  }

  // ---------- تشغيل الفيديو ----------
  async function playVideo(ex) {
    if (!ex.videoFile) { UI.toast('مفيش فيديو للتمرين ده'); return; }
    var url;
    try { url = await S.fileUri(ex.videoFile); } catch (e) { fail(e); return; }
    var v = h('video', { src: url, playsinline: true });
    v.loop = true; v.muted = true; v.autoplay = true;
    var exit = h('button', { class: 'icon-btn exit', 'aria-label': 'خروج' }, [UI.icon(ICON.x)]);
    var wrap = h('div', { class: 'video-view' }, [v, exit]);
    var timer = null;
    function close() { clearTimeout(timer); UI.popBack(close); wrap.remove(); }
    exit.addEventListener('click', close);
    wrap.addEventListener('click', function () {
      wrap.classList.add('touched');
      clearTimeout(timer);
      timer = setTimeout(function () { wrap.classList.remove('touched'); }, 2500);
    });
    v.addEventListener('error', function () { UI.toast('الفيديو ما اشتغلش'); close(); });
    document.body.appendChild(wrap);
    UI.pushBack(close);
    v.play().catch(function () {});
  }

  // ---------- الاستيراد الجماعي ----------
  function pending() { var d = D(); if (!d.pendingImports) d.pendingImports = []; return d.pendingImports; }

  async function startImport() {
    try {
      var files = await pickVideos(true);
      if (!files.length) return;
      await trace('0) المنتقي رجّع: ' + JSON.stringify(files.map(function (f) { return { path: f.path, name: f.name, size: f.size, type: f.mimeType }; })));
      files.forEach(function (f) {
        pending().push({ id: S.id('imp'), src: f.path, orig: f.name || '', file: null });
      });
      await S.save();
      await copyPending();
      nameNext();
    } catch (e) { fail(e); }
  }

  // بينسخ اللي لسه ماتنسخش. لو اتقطع، بيكمل من حيث وقف.
  async function copyPending() {
    var todo = pending().filter(function (p) { return !p.file; });
    if (!todo.length) return;
    var bar = h('i');
    var label = h('p', { class: 'dim', text: 'بنسخ الفيديوهات...' });
    var sh = UI.sheet({ title: 'استيراد', dismissable: false,
      content: h('div', {}, [label, h('div', { class: 'progress' }, [bar])]) });
    var failed = 0;
    for (var i = 0; i < todo.length; i++) {
      label.textContent = 'بنسخ ' + (i + 1) + ' من ' + todo.length;
      bar.style.width = Math.round((i / todo.length) * 100) + '%';
      try {
        todo[i].file = await copyVideoIn(todo[i].src, todo[i].orig);
      } catch (e) {
        failed++;
        await trace('خطأ: ' + (e && e.message ? e.message : e));
        D().pendingImports = pending().filter(function (p) { return p !== todo[i]; });
      }
      await S.save();
    }
    bar.style.width = '100%';
    sh.close();
    if (failed) UI.toast(failed + ' فيديو ما اتنسخوش، اختارهم تاني', 5000);
  }

  function nameNext() {
    var p = pending().filter(function (x) { return x.file; })[0];
    if (!p) { UI.render(); return; }
    openNaming(p);
  }

  function openNaming(p) {
    var left = pending().filter(function (x) { return x.file; }).length;
    var nameIn = h('input', { type: 'text', placeholder: 'اسم التمرين' });
    nameIn.value = baseName(p.orig);
    var sel = placeSelect(lastPlaceId);
    var prev = h('video', { playsinline: true });
    prev.loop = true; prev.muted = true; prev.autoplay = true;
    prev.style.cssText = 'width:100%;height:190px;object-fit:contain;background:#000;border-radius:10px;margin-bottom:12px';
    S.fileUri(p.file).then(function (u) { prev.src = u; prev.play().catch(function () {}); }).catch(function () {});
    var content = h('div', {}, [
      prev, field('اسم التمرين', nameIn), field('المكان', sel),
      h('button', { class: 'btn small danger', text: 'مسح الفيديو ده', on: { click: function () {
        UI.confirm({ title: 'تمسح الفيديو ده؟', ok: 'امسح', danger: true }).then(function (yes) {
          if (!yes) return;
          S.removeFile(p.file);
          D().pendingImports = pending().filter(function (x) { return x !== p; });
          S.save().then(function () { sh.close(); nameNext(); });
        });
      } } })
    ]);
    var sh = UI.sheet({
      title: 'سمّي الفيديو (' + left + ' متبقي)', content: content, dismissable: false,
      actions: [
        { label: 'بعدين', onClick: function () { UI.render(); } },
        { label: 'حفظ والتالي', kind: 'primary', onClick: function () {
          var name = nameIn.value.trim();
          if (!name || !sel.value) { UI.toast('اكتب الاسم واختار المكان'); return false; }
          lastPlaceId = sel.value;
          D().exercises.push({ id: S.id('ex'), name: name, placeId: sel.value, videoFile: p.file, createdAt: Date.now() });
          D().pendingImports = pending().filter(function (x) { return x !== p; });
          S.save().then(nameNext).catch(fail);
        } }
      ]
    });
  }

  // ---------- إضافة / تعديل تمرين ----------
  function openExerciseSheet(ex) {
    var isNew = !ex;
    var nameIn = h('input', { type: 'text', placeholder: 'اسم التمرين' });
    nameIn.value = ex ? ex.name : '';
    var startPlace = ex ? ex.placeId : lastPlaceId;
    var sel = placeSelect(startPlace);
    var newVideo = null, removeVideo = false, saved = false;
    var videoNote = h('p', { class: 'dim', text: ex && ex.videoFile ? 'فيه فيديو' : 'من غير فيديو' });
    var pickBtn = h('button', { class: 'btn small', text: 'اختيار فيديو', on: { click: async function () {
      try {
        var f = (await pickVideos(false))[0];
        if (!f) return;
        if (newVideo) S.removeFile(newVideo);
        newVideo = await copyVideoIn(f.path, f.name);
        removeVideo = false;
        videoNote.textContent = 'تم اختيار فيديو جديد';
      } catch (e) { fail(e); }
    } } });
    var clearBtn = h('button', { class: 'btn small danger', text: 'شيل الفيديو', on: { click: function () {
      if (newVideo) { S.removeFile(newVideo); newVideo = null; }
      removeVideo = true; videoNote.textContent = 'هيتشال الفيديو بعد الحفظ';
    } } });
    var children = [field('اسم التمرين', nameIn), field('المكان', sel),
      h('div', { class: 'field' }, [h('span', { text: 'الفيديو (اختياري)' }), videoNote,
        h('div', { class: 'actions' }, ex ? [pickBtn, clearBtn] : [pickBtn])])];

    if (ex) {
      var logged = hasLog(ex.id);
      children.push(h('p', { class: 'dim', text: logged
        ? 'التمرين ده له سجل، فهيتأرشف (السجل مش هيضيع).'
        : 'التمرين ده مالوش سجل، فهيتمسح نهائي.' }));
      children.push(h('button', { class: 'btn danger block', text: logged ? 'أرشفة التمرين' : 'حذف نهائي', on: { click: function () {
        UI.confirm({ title: logged ? 'تأرشف التمرين؟' : 'تمسح التمرين نهائي؟',
          text: logged ? 'هيختفي من القوايم والسجل بتاعه يفضل محفوظ.' : 'مش هتقدر ترجعه.',
          ok: logged ? 'أرشف' : 'امسح', danger: true }).then(function (yes) {
          if (!yes) return;
          if (logged) { ex.archived = true; }
          else {
            if (ex.videoFile) S.removeFile(ex.videoFile);
            D().exercises = D().exercises.filter(function (x) { return x !== ex; });
            delete D().notes[ex.id];
          }
          saved = true; sh.close();
          S.save().then(function () { UI.render(); }).catch(fail);
        });
      } } }));
    }

    var sh = UI.sheet({
      title: isNew ? 'تمرين جديد' : 'تعديل التمرين',
      content: h('div', {}, children),
      onClose: function () { if (!saved && newVideo) S.removeFile(newVideo); },
      actions: [
        { label: 'إلغاء' },
        { label: 'حفظ', kind: 'primary', onClick: function () {
          var name = nameIn.value.trim();
          if (!name || !sel.value) { UI.toast('اكتب الاسم واختار المكان'); return false; }
          saved = true;
          lastPlaceId = sel.value;
          if (isNew) {
            D().exercises.push({ id: S.id('ex'), name: name, placeId: sel.value, videoFile: newVideo || null, createdAt: Date.now() });
          } else {
            ex.name = name; ex.placeId = sel.value; // السجل مربوط بالتمرين فبيتنقل معاه
            var old = ex.videoFile;
            if (newVideo) { ex.videoFile = newVideo; if (old) S.removeFile(old); }
            else if (removeVideo) { ex.videoFile = null; if (old) S.removeFile(old); }
          }
          S.save().then(function () { UI.render(); }).catch(fail);
        } }
      ]
    });
  }

  function openArchive() {
    var items = D().exercises.filter(function (e) { return e.archived; });
    var list = h('div', {}, items.map(function (ex) {
      return h('div', { class: 'row' }, [
        h('div', { class: 'grow' }, [h('div', { class: 'name', text: ex.name }), h('div', { class: 'sub', text: placeLabel(ex.placeId) })]),
        h('button', { class: 'btn small', text: 'استرجاع', on: { click: function () {
          ex.archived = false; sh.close();
          S.save().then(function () { UI.toast('اترجع'); UI.render(); }).catch(fail);
        } } })
      ]);
    }));
    var sh = UI.sheet({ title: 'الأرشيف', content: list, actions: [{ label: 'قفل' }] });
  }

  // ---------- البحث ----------
  // بنوحّد الحروف (أ إ آ ← ا، ة ← ه، ى ← ي) وبنشيل التشكيل، عشان البحث يلقط مهما اتكتب
  function norm(t) {
    return String(t || '').toLowerCase()
      .replace(/[ً-ٰٟـ]/g, '')
      .replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').replace(/ذ/g, 'د');
  }
  // كل كلمة في البحث لازم تتلاقى في (اسم التمرين + العضلة + الجزء)
  function matches(ex, tokens) {
    if (!tokens.length) return true;
    var p = M.findPlace(D(), ex.placeId);
    var hay = norm(ex.name + ' ' + (p ? p.muscleName + ' ' + p.name : ''));
    return tokens.every(function (t) { return hay.indexOf(t) >= 0; });
  }
  // كل التمارين مترتبة بترتيب العضلات والأجزاء
  function sortedExercises() {
    var order = {};
    M.places(D()).forEach(function (p, i) { order[p.id] = i; });
    return D().exercises.filter(function (e) { return !e.archived; })
      .map(function (e, i) { return { e: e, k: (order[e.placeId] === undefined ? 9999 : order[e.placeId]), i: i }; })
      .sort(function (a, b) { return a.k - b.k || a.i - b.i; })
      .map(function (x) { return x.e; });
  }

  // ---------- الرسم ----------
  function head(title) {
    return h('div', { class: 'page-head' }, [
      h('h1', { class: 'title', text: title }),
      h('button', { class: 'icon-btn' + (UI.editing ? ' on' : ''), 'aria-label': 'تعديل',
        on: { click: function () { UI.setEditing(!UI.editing); } } }, [UI.icon(UI.editing ? ICON.check : ICON.pencil)])
    ]);
  }

  function row(name, sub, badge, onClick, extra) {
    return h('div', { class: 'row', role: 'button', on: { click: onClick } }, [
      h('div', { class: 'grow' }, [h('div', { class: 'name', text: name }), sub ? h('div', { class: 'sub', text: sub }) : null]),
      badge !== null ? h('span', { class: 'badge num', text: String(badge) }) : null,
      extra || null
    ]);
  }

  function exerciseRow(ex) {
    var extra = ex.videoFile ? h('span', { class: 'dim' }, [UI.icon(ICON.play)]) : null;
    if (extra) { extra.firstChild.style.cssText = 'width:20px;height:20px;fill:currentColor'; }
    return row(ex.name, placeLabel(ex.placeId) + (ex.videoFile ? '' : ' · من غير فيديو'), null, function () {
      if (UI.editing) openExerciseSheet(ex); else playVideo(ex);
    }, extra);
  }

  function renderPendingBanner(box) {
    var all = pending();
    if (!all.length) return;
    var ready = all.filter(function (p) { return p.file; }).length;
    var wait = all.length - ready;
    var txt = [];
    if (ready) txt.push(ready + ' فيديو جاهز تسميه');
    if (wait) txt.push(wait + ' فيديو لسه ما اتنسخش');
    box.appendChild(h('div', { class: 'card' }, [
      h('p', { text: txt.join(' · ') }),
      D().debug ? h('p', { class: 'dim', style: 'font-size:12px;direction:ltr;text-align:left;word-break:break-all', text: D().debug }) : null,
      h('button', { class: 'btn primary block', text: wait ? 'كمّل النسخ والتسمية' : 'كمّل التسمية', on: { click: async function () {
        try { await copyPending(); nameNext(); } catch (e) { fail(e); }
      } } })
    ]));
  }

  function renderLibrary(box) {
    var d = D();
    box.appendChild(head('مكتبة التمارين'));
    renderPendingBanner(box);
    if (UI.editing) {
      box.appendChild(h('div', { class: 'actions', style: 'display:flex;gap:10px;margin-bottom:14px' }, [
        h('button', { class: 'btn primary', style: 'flex:1', text: '+ تمرين', on: { click: function () { openExerciseSheet(null); } } }),
        h('button', { class: 'btn', style: 'flex:1', text: 'استيراد فيديوهات', on: { click: startImport } })
      ]));
      var arch = d.exercises.filter(function (e) { return e.archived; }).length;
      if (arch) box.appendChild(row('الأرشيف', null, arch, openArchive));
    }

    var all = sortedExercises();
    if (!all.length) {
      if (!pending().length && !UI.editing) {
        box.appendChild(h('div', { class: 'empty', text: 'المكتبة فاضية. دوس على القلم فوق عشان تستورد فيديوهاتك أو تضيف تمرين.' }));
      }
      return;
    }

    // البحث + القايمة الكاملة (بتتحدّث من غير ما الشاشة كلها تتعاد، عشان الكيبورد ما يقفلش)
    var input = h('input', { type: 'text', placeholder: 'ابحث: اسم التمرين أو العضلة (مثلًا: صدر علوي)', autocomplete: 'off', enterkeyhint: 'search', 'aria-label': 'بحث' });
    input.value = query;
    var clear = h('button', { class: 'search-clear', 'aria-label': 'مسح البحث', on: { click: function () {
      input.value = ''; query = ''; update(); input.focus();
    } } }, [UI.icon(ICON.x)]);
    var count = h('p', { class: 'dim', style: 'margin:0 0 10px' });
    var list = h('div');
    box.appendChild(h('div', { class: 'search-wrap' }, [input, clear]));
    box.appendChild(count);
    box.appendChild(list);

    function update() {
      var tokens = norm(query).split(/\s+/).filter(Boolean);
      var shown = all.filter(function (e) { return matches(e, tokens); });
      list.textContent = '';
      clear.style.display = query ? '' : 'none';
      count.textContent = tokens.length ? shown.length + ' من ' + all.length + ' تمرين' : all.length + ' تمرين';
      if (!shown.length) list.appendChild(h('div', { class: 'empty', text: 'مفيش تمرين بالاسم ده. جرب كلمة تانية.' }));
      shown.forEach(function (ex) { list.appendChild(exerciseRow(ex)); });
    }
    input.addEventListener('input', function () { query = input.value; update(); });
    update();
  }

  UI.onEditingChange = function () { UI.render(); };
  window.GemmaScreens = window.GemmaScreens || {};
  window.GemmaScreens.library = renderLibrary;
})();
