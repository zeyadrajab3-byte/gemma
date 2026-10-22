/* جِمّا - النسخة الاحتياطية والاستعادة (www/backup.js)
   النسخة = فولدر Gemma-Backup جواه data.json + videos + photos. بتتحط في أي فولدر على التليفون،
   وبعدها زياد يرفعه على درايف بإيده. الاستعادة بتستبدل كل بيانات التطبيق بالنسخة. */
(function () {
  var UI = window.GemmaUI, h = UI.h, S = window.GemmaStore;

  function plugin() {
    var p = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Backup;
    if (!p) throw new Error('بلجن النسخ الاحتياطي مش موجود');
    return p;
  }
  function msg(e) { return String(e && e.message ? e.message : e); }
  function isCancel(e) { return /cancel/i.test(msg(e)); }

  // ---------- تنسيق ----------
  function fmtBytes(n) {
    if (!n || n < 1) return '0 MB';
    var mb = n / 1048576;
    if (mb < 1024) return (mb < 10 ? mb.toFixed(1) : Math.round(mb)) + ' MB';
    return (mb / 1024).toFixed(1) + ' GB';
  }
  function pad(n) { return String(n).padStart(2, '0'); }
  function fmtDate(ts) {
    if (!ts) return null;
    var d = new Date(ts);
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }
  function num(t) { return h('span', { class: 'num', text: String(t) }); }

  // ---------- شاشة الانتظار (من غير إغلاق بزرار الرجوع) ----------
  function busyOverlay(title) {
    var label = h('p', { class: 'dim', text: 'ثواني...' });
    var bar = h('i');
    var detail = h('p', { class: 'dim num', style: 'font-size:13px;direction:ltr;text-align:left;word-break:break-all;min-height:20px' });
    var cancelBtn = h('button', { class: 'btn', text: 'إلغاء', on: { click: function () {
      cancelBtn.disabled = true;
      try { plugin().cancel(); } catch (e) {}
    } } });
    var sheet = h('div', { class: 'sheet' }, [
      h('h3', { class: 'title', text: title }),
      label,
      h('div', { class: 'progress' }, [bar]),
      detail,
      h('p', { class: 'dim', text: 'سيب التطبيق مفتوح لحد ما يخلص.' }),
      h('div', { class: 'actions' }, [cancelBtn])
    ]);
    var bg = h('div', { class: 'sheet-bg' }, [sheet]);
    var noop = function () {}; // زرار الرجوع مايعملش حاجة أثناء الشغل
    UI.pushBack(noop);
    document.body.appendChild(bg);
    return {
      update: function (p) {
        var pct = p.total > 0 ? Math.min(100, Math.round((p.done / p.total) * 100)) : 0;
        bar.style.width = pct + '%';
        label.textContent = 'ملف ' + p.index + ' من ' + p.count + ' (' + pct + '%) · ' + fmtBytes(p.done) + ' من ' + fmtBytes(p.total);
        detail.textContent = p.name || '';
      },
      setLabel: function (t) { label.textContent = t; },
      close: function () { UI.popBack(noop); bg.remove(); }
    };
  }

  // بيشغّل أمر طويل من البلجن وبيعرض تقدمه
  async function withProgress(title, call) {
    var ov = busyOverlay(title);
    var handle = null;
    try {
      handle = await plugin().addListener('progress', function (p) { ov.update(p); });
      return await call();
    } finally {
      if (handle && handle.remove) { try { await handle.remove(); } catch (e) {} }
      ov.close();
    }
  }

  async function pickFolder() {
    var r = await plugin().pickFolder();
    return r && r.uri ? r.uri : null;
  }

  // ---------- نسخة احتياطية ----------
  function startBackup() {
    UI.sheet({
      title: 'نسخة احتياطية',
      content: h('div', {}, [
        h('p', { text: 'اختار فولدر على التليفون (مثلًا Documents، أو فولدر جديد من عندك). هعمل جواه فولدر اسمه Gemma-Backup فيه كل حاجة.' }),
        h('p', { class: 'dim', text: 'مش هتقدر تختار فولدر Download الرئيسي ولا الذاكرة نفسها، أندرويد بيمنع كده. اختار أو اعمل فولدر جواهم.' }),
        h('p', { class: 'dim', text: 'لو عملت نسخة قبل كده في نفس المكان، بنكتب فوقها وبنضيف الجديد بس، فبتخلص أسرع.' })
      ]),
      actions: [
        { label: 'إلغاء' },
        { label: 'اختيار الفولدر', kind: 'primary', onClick: function () { runBackup(); } }
      ]
    });
  }

  async function runBackup() {
    var tree;
    try { tree = await pickFolder(); } catch (e) { UI.toast('خطأ: ' + msg(e), 5000); return; }
    if (!tree) return;

    var settings = S.data.settings || (S.data.settings = {});
    var oldLast = settings.lastBackup || null;
    try {
      // التاريخ يتحفظ قبل النسخ عشان يبقى جوه النسخة نفسها
      settings.lastBackup = Date.now();
      await S.save();
      var r = await withProgress('بنعمل النسخة...', function () { return plugin().exportTo({ treeUri: tree }); });
      UI.render();
      UI.sheet({
        title: 'النسخة جاهزة ✓',
        content: h('div', {}, [
          h('p', {}, ['اتنسخ ', num(r.copied), ' ملف جديد، و', num(r.skipped), ' كانوا موجودين.']),
          h('p', { class: 'dim', text: 'الحجم الكلي: ' + fmtBytes(r.bytes) }),
          h('p', { class: 'dim', text: 'افتح الفولدر Gemma-Backup وارفعه على درايف أو أي مكان تاني. النسخة اللي على التليفون بس مش كفاية لو التليفون ضاع.' })
        ]),
        actions: [{ label: 'تمام', kind: 'primary' }]
      });
    } catch (e) {
      settings.lastBackup = oldLast;
      S.save().catch(function () {});
      UI.render();
      if (isCancel(e)) UI.toast('اتلغت النسخة');
      else UI.sheet({ title: 'النسخة ما كملتش', content: h('p', { class: 'dim', text: msg(e) }), actions: [{ label: 'قفل' }] });
    }
  }

  // ---------- استعادة ----------
  function startRestore() {
    UI.sheet({
      title: 'استعادة نسخة',
      content: h('div', {}, [
        h('p', { text: 'اختار الفولدر Gemma-Backup (أو الفولدر اللي هو جواه) اللي رجّعته على التليفون من درايف.' }),
        h('p', { class: 'dim', text: 'الاستعادة بتستبدل كل بيانات التطبيق الحالية بالنسخة. قبل الاستبدال بنحفظ نسخة أمان صغيرة من البيانات الحالية جوه التطبيق.' })
      ]),
      actions: [
        { label: 'إلغاء' },
        { label: 'اختيار الفولدر', kind: 'primary', onClick: function () { runRestore(); } }
      ]
    });
  }

  function parseBackup(text) {
    var o;
    try { o = JSON.parse(text); } catch (e) { throw new Error('ملف data.json في النسخة تالف'); }
    if (!o || typeof o !== 'object' || Array.isArray(o) || !Array.isArray(o.exercises) || typeof o.schema !== 'number') {
      throw new Error('الملف ده مش نسخة احتياطية من جِمّا');
    }
    if (o.schema > S.SCHEMA) throw new Error('النسخة دي من إصدار أحدث من التطبيق. حدّث التطبيق الأول.');
    return o;
  }

  async function runRestore() {
    var tree, info, parsed;
    try {
      tree = await pickFolder();
      if (!tree) return;
      var ov = busyOverlay('بنفحص النسخة...');
      ov.update({ done: 0, total: 0, index: 0, count: 0, name: '' });
      ov.setLabel('بنقرا الفولدر...');
      try { info = await plugin().inspect({ treeUri: tree }); } finally { ov.close(); }
      if (!info.found) {
        UI.sheet({ title: 'مفيش نسخة هنا', content: h('p', { class: 'dim', text: 'الفولدر ده مفيهوش data.json. اختار فولدر Gemma-Backup نفسه.' }), actions: [{ label: 'قفل' }] });
        return;
      }
      parsed = parseBackup(info.dataJson);
    } catch (e) {
      if (isCancel(e)) { UI.toast('اتلغت الاستعادة'); return; }
      UI.sheet({ title: 'مش قادر أستعيد', content: h('p', { class: 'dim', text: msg(e) }), actions: [{ label: 'قفل' }] });
      return;
    }

    var when = fmtDate(parsed.settings && parsed.settings.lastBackup);
    var exCount = parsed.exercises.filter(function (x) { return !x.archived; }).length;
    var yes = await UI.confirm({
      title: 'تستبدل كل بياناتك بالنسخة دي؟',
      text: (when ? 'تاريخ النسخة: ' + when + '. ' : '') + exCount + ' تمرين، ' + info.videos + ' فيديو، ' + info.photos + ' صورة (' + fmtBytes(info.bytes) + '). اللي اتضاف بعد النسخة دي هيختفي من التطبيق.',
      ok: 'استعادة', danger: true
    });
    if (!yes) return;

    try {
      await withProgress('بنستعيد الملفات...', function () { return plugin().restoreMedia({ treeUri: tree }); });
      parsed.pendingImports = (parsed.pendingImports || []).filter(function (p) { return p.file; });
      await S.replaceAll(parsed);
      UI.applyTheme(S.data.settings && S.data.settings.theme);
      UI.render();
      UI.sheet({ title: 'الاستعادة خلصت ✓', content: h('p', { class: 'dim', text: 'كل حاجة رجعت زي ما كانت وقت النسخة.' }), actions: [{ label: 'تمام', kind: 'primary' }] });
    } catch (e) {
      if (isCancel(e)) UI.toast('اتلغت الاستعادة. بياناتك الحالية زي ما هي.', 4000);
      else UI.sheet({ title: 'الاستعادة ما كملتش', content: h('p', { class: 'dim', text: msg(e) + ' (بياناتك الحالية ماتغيرتش)' }), actions: [{ label: 'قفل' }] });
    }
  }

  // ---------- شاشة "المزيد" (مؤقتًا فيها النسخة الاحتياطية بس لحد ما باقي المراحل تتبني) ----------
  function renderMore(box) {
    box.appendChild(h('div', { class: 'page-head' }, [h('h1', { class: 'title', text: 'المزيد' })]));
    var last = fmtDate(S.data.settings && S.data.settings.lastBackup);
    box.appendChild(h('div', { class: 'card' }, [
      h('h3', { class: 'title', style: 'margin:0 0 6px;font-size:22px', text: 'النسخة الاحتياطية' }),
      last
        ? h('p', { class: 'dim', style: 'margin:0 0 10px' }, ['آخر نسخة: ', num(last)])
        : h('p', { class: 'dim', style: 'margin:0 0 10px', text: 'لسه ماعملتش نسخة احتياطية.' }),
      h('p', { class: 'dim', style: 'margin:0 0 12px', text: 'لو مسحت التطبيق أو عملت Clear Data، كل حاجة بتتمسح. النسخة الاحتياطية هي الأمان الوحيد.' }),
      h('button', { class: 'btn primary block', style: 'margin-bottom:10px', text: 'اعمل نسخة احتياطية', on: { click: startBackup } }),
      h('button', { class: 'btn block', text: 'استعادة من نسخة', on: { click: startRestore } })
    ]));
  }

  window.GemmaScreens = window.GemmaScreens || {};
  window.GemmaScreens.more = renderMore;
})();
