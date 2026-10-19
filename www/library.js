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

  var view = { muscleId: null, placeId: null };
  var libBack = null;
  var lastPlaceId = '';

  function D() { return S.data; }
  function fsPlugin() { return window.Capacitor.Plugins.Filesystem; }
  function fail(e) { UI.toast('خطأ: ' + (e && e.message ? e.message : e), 5000); }

  // ---------- بيانات ----------
  function groupOf(id) { return D().muscles.filter(function (m) { return m.id === id; })[0] || null; }
  function placeIdsOf(g) { return g.parts && g.parts.length ? g.parts.map(function (p) { return p.id; }) : [g.id]; }
  function exercisesIn(placeIds) {
    return D().exercises.filter(function (e) { return !e.archived && placeIds.indexOf(e.placeId) >= 0; });
  }
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
    await S.copyIn(srcPath, rel);
    fsPlugin().deleteFile({ path: srcPath }).catch(function () {}); // مسح نسخة المنتقي المؤقتة
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
    var startPlace = ex ? ex.placeId : (view.placeId || (function () {
      var g = view.muscleId && groupOf(view.muscleId);
      return g && !(g.parts && g.parts.length) ? g.id : lastPlaceId;
    })());
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

  // ---------- الرسم ----------
  function goUp() {
    var g = view.muscleId && groupOf(view.muscleId);
    if (view.placeId && g && g.parts && g.parts.length) view.placeId = null;
    else { view.muscleId = null; view.placeId = null; }
    UI.render();
  }

  function head(title, showBack) {
    var kids = [];
    if (showBack) kids.push(h('button', { class: 'icon-btn', 'aria-label': 'رجوع', on: { click: function () { goUp(); } } }, [UI.icon(ICON.back)]));
    kids.push(h('h1', { class: 'title', text: title }));
    kids.push(h('button', { class: 'icon-btn' + (UI.editing ? ' on' : ''), 'aria-label': 'تعديل',
      on: { click: function () { UI.setEditing(!UI.editing); } } }, [UI.icon(UI.editing ? ICON.check : ICON.pencil)]));
    return h('div', { class: 'page-head' }, kids);
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
    return row(ex.name, ex.videoFile ? null : 'من غير فيديو', null, function () {
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
      h('button', { class: 'btn primary block', text: wait ? 'كمّل النسخ والتسمية' : 'كمّل التسمية', on: { click: async function () {
        try { await copyPending(); nameNext(); } catch (e) { fail(e); }
      } } })
    ]));
  }

  function renderLibrary(box) {
    if (libBack) { UI.popBack(libBack); libBack = null; }
    var d = D();
    var g = view.muscleId ? groupOf(view.muscleId) : null;
    if (view.muscleId && !g) { view.muscleId = null; view.placeId = null; }
    if (g) { libBack = function () { goUp(); }; UI.pushBack(libBack); }

    // الجذر: العضلات
    if (!g) {
      box.appendChild(head('المكتبة', false));
      renderPendingBanner(box);
      if (UI.editing) {
        box.appendChild(h('div', { class: 'actions', style: 'display:flex;gap:10px;margin-bottom:14px' }, [
          h('button', { class: 'btn primary', style: 'flex:1', text: '+ تمرين', on: { click: function () { openExerciseSheet(null); } } }),
          h('button', { class: 'btn', style: 'flex:1', text: 'استيراد فيديوهات', on: { click: startImport } })
        ]));
        var arch = d.exercises.filter(function (e) { return e.archived; }).length;
        if (arch) box.appendChild(row('الأرشيف', null, arch, openArchive));
      }
      var total = d.exercises.filter(function (e) { return !e.archived; }).length;
      if (!total && !pending().length && !UI.editing) {
        box.appendChild(h('div', { class: 'empty', text: 'المكتبة فاضية. دوس على القلم فوق عشان تستورد فيديوهاتك أو تضيف تمرين.' }));
      }
      d.muscles.forEach(function (m) {
        var n = exercisesIn(placeIdsOf(m)).length;
        box.appendChild(row(m.name, null, n, function () { view.muscleId = m.id; view.placeId = null; UI.render(); }));
      });
      return;
    }

    var hasParts = g.parts && g.parts.length;

    // مستوى الأجزاء
    if (hasParts && !view.placeId) {
      box.appendChild(head(g.name, true));
      g.parts.forEach(function (p) {
        box.appendChild(row(p.name, null, exercisesIn([p.id]).length, function () { view.placeId = p.id; UI.render(); }));
      });
      return;
    }

    // مستوى التمارين
    var pid = hasParts ? view.placeId : g.id;
    var title = hasParts ? g.name + ' › ' + M.findPlace(d, pid).name : g.name;
    box.appendChild(head(title, true));
    var list = exercisesIn([pid]);
    if (UI.editing) {
      box.appendChild(h('button', { class: 'btn primary block', style: 'margin-bottom:14px', text: '+ تمرين هنا', on: { click: function () { openExerciseSheet(null); } } }));
    }
    if (!list.length) box.appendChild(h('div', { class: 'empty', text: 'مفيش تمارين هنا لسه' }));
    list.forEach(function (ex) { box.appendChild(exerciseRow(ex)); });
  }

  UI.onEditingChange = function () { UI.render(); };
  window.GemmaScreens = window.GemmaScreens || {};
  window.GemmaScreens.library = renderLibrary;
})();
