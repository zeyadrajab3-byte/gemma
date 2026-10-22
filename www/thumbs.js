/* جِمّا - صور مصغّرة للفيديوهات (www/thumbs.js)
   بنخد لقطة ثابتة من أول الفيديو ونحفظها كصورة صغيرة في thumbs/، فالمكتبة تعرض كل التمارين
   بصورتها من غير ما أي فيديو يشتغل. الصورة بتتعمل مرة واحدة بس وبعدها بتتقرا من الملف. */
(function () {
  var S = window.GemmaStore, UI = window.GemmaUI, h = UI.h;
  var DIR = 'DATA';
  var queue = [], running = false;
  var io = null;

  function fs() { return window.Capacitor.Plugins.Filesystem; }

  function thumbPath(ex) {
    var base = String(ex.videoFile || '').split('/').pop().replace(/\.[^.]+$/, '');
    return 'thumbs/' + base + '.jpg';
  }

  function showImg(box, src) {
    var img = h('img', { alt: '', class: 'thumb-img' });
    img.src = src;
    box.textContent = '';
    box.appendChild(img);
    box.appendChild(h('span', { class: 'thumb-play' }, [UI.icon('<path d="M9 6l9 6-9 6z"/>')]));
  }

  // لقطة من الفيديو ← صورة JPEG (data URL)
  function grabFrame(ex) {
    return S.fileUri(ex.videoFile).then(function (url) {
      return new Promise(function (resolve, reject) {
        var v = document.createElement('video');
        v.muted = true; v.preload = 'auto'; v.playsInline = true;
        var done = false;
        var timer = setTimeout(function () { fin(new Error('timeout')); }, 12000);
        function fin(err, data) {
          if (done) return;
          done = true; clearTimeout(timer);
          v.removeAttribute('src');
          try { v.load(); } catch (e) {}
          if (err) reject(err); else resolve(data);
        }
        v.addEventListener('error', function () { fin(new Error('video error')); });
        v.addEventListener('loadedmetadata', function () {
          var d = v.duration;
          v.currentTime = (isFinite(d) && d > 0) ? Math.max(0.05, Math.min(0.5, d / 2)) : 0.1;
        });
        v.addEventListener('seeked', function () {
          try {
            var w = v.videoWidth, hh = v.videoHeight;
            if (!w || !hh) throw new Error('no size');
            var side = 240, c = document.createElement('canvas');
            // مربع من نص الصورة (قص)، عشان الصور كلها بنفس الشكل
            var s = Math.min(w, hh);
            c.width = side; c.height = side;
            c.getContext('2d').drawImage(v, (w - s) / 2, (hh - s) / 2, s, s, 0, 0, side, side);
            fin(null, c.toDataURL('image/jpeg', 0.72));
          } catch (e) { fin(e); }
        });
        v.src = url;
      });
    });
  }

  async function generate(box, ex, path) {
    var dataUrl = await grabFrame(ex);
    if (box.isConnected) showImg(box, dataUrl);
    var b64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
    await fs().writeFile({ path: path, directory: DIR, data: b64, recursive: true });
  }

  async function pump() {
    if (running) return;
    running = true;
    while (queue.length) {
      var job = queue.shift();
      if (!job.box.isConnected) continue; // الشاشة اتغيرت
      try { await generate(job.box, job.ex, job.path); } catch (e) { /* نسيب الشكل الافتراضي */ }
    }
    running = false;
  }

  async function load(box) {
    var ex = box._ex, path = thumbPath(ex);
    try {
      await fs().stat({ path: path, directory: DIR });
      showImg(box, await S.fileUri(path));
      return;
    } catch (e) { /* مش موجودة، نعملها */ }
    queue.push({ box: box, ex: ex, path: path });
    pump();
  }

  function onVisible(entries) {
    entries.forEach(function (en) {
      if (en.isIntersecting) { io.unobserve(en.target); load(en.target); }
    });
  }

  // بيرجّع مربع الصورة. بيحمّلها لما يظهر على الشاشة بس.
  function make(ex) {
    var box = h('div', { class: 'thumb' }, [h('span', { class: 'thumb-ph' }, [UI.icon('<path d="M9 6l9 6-9 6z"/>')])]);
    box._ex = ex;
    if ('IntersectionObserver' in window) {
      if (!io) io = new IntersectionObserver(onVisible, { rootMargin: '300px' });
      io.observe(box);
    } else {
      load(box);
    }
    return box;
  }

  window.GemmaThumbs = { make: make };
})();
