/* جِمّا - أول تشغيل (www/onboarding.js)
   بيسأل: بياناتك ← حركتك وتمرينك ← سعرات ثباتك ← هدفك (تنشيف/تضخيم/ثبات) ومقدار التغيير
   ← احتياجك اليومي من البروتين والكارب والدهون. بعدها التطبيق يفتح عادي،
   وكل ده بتعدّله بعدين من صفحة الأكل. */
(function () {
  var UI = window.GemmaUI, h = UI.h, S = window.GemmaStore, F = window.GemmaFood;
  var TOTAL = 5;

  function r0(n) { return Math.round(n); }
  function num(t) { return h('span', { class: 'num', text: String(t) }); }
  function field(label, input) { return h('label', { class: 'field' }, [h('span', { text: label }), input]); }
  function numIn(value, attrs) {
    var i = h('input', Object.assign({ type: 'number', inputmode: 'decimal' }, attrs || {}));
    if (value !== '' && value !== null && value !== undefined) i.value = value;
    return i;
  }
  function val(i) { var v = parseFloat(i.value); return isFinite(v) ? v : null; }
  function sel(map, cur) {
    var s = h('select', {}, Object.keys(map).map(function (k) { return h('option', { value: k, text: map[k].label }); }));
    s.value = cur;
    return s;
  }

  function needed() {
    var p = F.profile(), e = F.energy();
    return !p.onboarded && !e.maintenance;
  }

  function run() {
    if (!needed()) return Promise.resolve();
    return new Promise(function (resolve) {
      var p = F.profile(), a = p.activity || {};
      var st = {
        step: 0,
        sex: p.sex || 'm', age: p.age || null, height: p.heightCm || null, weight: p.weightKg || null, bf: p.bodyFatPct || null,
        neat: a.neat || 'low', days: a.trainDays !== undefined ? a.trainDays : 4, mins: a.trainMin || 60, intensity: a.intensity || 'moderate',
        calc: null, maintenance: null, goal: 'cut', amount: F.GOAL_DEFAULT.cut,
        pro: null, carb: null, fat: null
      };

      var root = h('div', { class: 'onb' });
      document.body.appendChild(root);

      function onBack() { if (st.step > 0) { st.step--; draw(); } }
      UI.pushBack(onBack);

      function finish() {
        var en = F.energy();
        en.maintenance = st.maintenance;
        var rounded = st.calc ? r0(st.calc.total / 10) * 10 : null;
        en.calc = rounded;
        en.manual = rounded !== null && st.maintenance !== rounded;
        en.bmr = st.calc ? st.calc.bmr : null;
        en.goal = st.goal;
        en.amount = st.goal === 'maintain' ? 0 : st.amount;
        en.macros = { p: r0(st.pro), c: r0(st.carb), f: r0(st.fat) };
        p.sex = st.sex; p.age = st.age; p.heightCm = st.height; p.weightKg = st.weight; p.bodyFatPct = st.bf;
        p.activity = { neat: st.neat, trainDays: st.days, trainMin: st.mins, intensity: st.intensity };
        p.onboarded = true;
        S.save().then(function () {
          UI.popBack(onBack);
          root.remove();
          resolve();
        }).catch(function (e) { UI.toast('ماتحفظش: ' + (e && e.message ? e.message : e), 5000); });
      }

      function target() {
        if (!st.maintenance) return null;
        var d = st.goal === 'cut' ? -st.amount : st.goal === 'bulk' ? st.amount : 0;
        return Math.max(0, st.maintenance + d);
      }

      function draw() {
        root.textContent = '';
        var body = h('div', { class: 'onb-body' });
        var next = null; // دالة بترجع false لو فيه خطأ

        root.appendChild(h('div', { class: 'onb-top' }, [
          h('div', { class: 'step' }, ['خطوة ', num(st.step + 1), ' من ', num(TOTAL)]),
          h('div', { class: 'progress' }, [h('i', { style: 'width:' + ((st.step + 1) / TOTAL * 100) + '%' })])
        ]));
        root.appendChild(body);

        if (st.step === 0) next = stepBody(body);
        else if (st.step === 1) next = stepActivity(body);
        else if (st.step === 2) next = stepMaintenance(body);
        else if (st.step === 3) next = stepGoal(body);
        else next = stepMacros(body);

        var last = st.step === TOTAL - 1;
        var foot = h('div', { class: 'onb-foot' });
        if (st.step > 0) foot.appendChild(h('button', { class: 'btn', text: 'رجوع', on: { click: onBack } }));
        foot.appendChild(h('button', { class: 'btn primary', text: last ? 'ابدأ' : 'التالي', on: { click: function () {
          if (next() === false) return;
          if (last) finish(); else { st.step++; draw(); }
        } } }));
        root.appendChild(foot);
        body.scrollTop = 0;
      }

      // 1) البيانات الأساسية
      function stepBody(b) {
        b.appendChild(h('h1', { class: 'title', text: 'أهلًا بيك في جِمّا' }));
        b.appendChild(h('p', { class: 'dim', text: 'هنسجل بياناتك الأول عشان نحسب احتياجك. كلها بتتعدل بعدين.' }));
        var seg = h('div', { class: 'seg' }, [['m', 'ذكر'], ['f', 'أنثى']].map(function (s) {
          return h('button', { 'data-v': s[0], class: st.sex === s[0] ? 'on' : '', text: s[1], on: { click: function () {
            st.sex = s[0];
            Array.prototype.forEach.call(seg.children, function (x) { x.classList.toggle('on', x.dataset.v === st.sex); });
          } } });
        }));
        b.appendChild(seg);
        var age = numIn(st.age || '', { placeholder: 'بالسنين' });
        var height = numIn(st.height || '', { placeholder: 'بالسنتيمتر' });
        var weight = numIn(st.weight || '', { step: '0.1', placeholder: 'بالكيلو' });
        var bf = numIn(st.bf || '', { step: '0.1', placeholder: 'اختياري، لو عارفها بدقة' });
        b.appendChild(h('div', { class: 'grid2' }, [field('السن', age), field('الطول (سم)', height)]));
        b.appendChild(h('div', { class: 'grid2' }, [field('الوزن (كجم)', weight), field('نسبة الدهون % (اختياري)', bf)]));
        return function () {
          var A = val(age), H = val(height), W = val(weight), B = val(bf), err = null;
          if (!A || A < 14 || A > 90) err = 'السن لازم يبقى بين 14 و90';
          else if (!H || H < 120 || H > 230) err = 'الطول لازم يبقى بين 120 و230 سم';
          else if (!W || W < 30 || W > 250) err = 'الوزن لازم يبقى بين 30 و250 كجم';
          else if (B !== null && (B < 3 || B > 60)) err = 'نسبة الدهون لازم تبقى بين 3 و60 (أو سيبها فاضية)';
          if (err) { UI.toast(err, 3500); return false; }
          st.age = A; st.height = H; st.weight = W; st.bf = B;
        };
      }

      // 2) الحركة والتمرين
      function stepActivity(b) {
        b.appendChild(h('h1', { class: 'title', text: 'حركتك وتمرينك' }));
        b.appendChild(h('p', { class: 'dim', text: 'عشان نقدّر سعرات ثباتك (اللي بتحافظ بيها على وزنك).' }));
        var neat = sel(F.NEAT, st.neat);
        var days = h('select', {}, [0, 1, 2, 3, 4, 5, 6, 7].map(function (n) { return h('option', { value: String(n), text: n + ' أيام' }); }));
        days.value = String(st.days);
        var mins = numIn(st.mins, { min: '10', max: '240' });
        var inten = sel(F.INTENSITY, st.intensity);
        b.appendChild(field('حركتك في اليوم برا التمرين', neat));
        b.appendChild(h('div', { class: 'grid2' }, [field('أيام التمرين في الأسبوع', days), field('مدة التمرين (دقيقة)', mins)]));
        b.appendChild(field('شدة التمرين', inten));
        return function () {
          var M = val(mins);
          if (!M || M < 10 || M > 240) { UI.toast('مدة التمرين لازم تبقى بين 10 و240 دقيقة', 3500); return false; }
          st.neat = neat.value; st.days = parseInt(days.value, 10); st.mins = M; st.intensity = inten.value;
          st.calc = F.calcTdee({ sex: st.sex, age: st.age, height: st.height, weight: st.weight, bodyFat: st.bf, neat: st.neat, days: st.days, minutes: st.mins, intensity: st.intensity });
          st.maintenance = r0(st.calc.total / 10) * 10;
        };
      }

      // 3) سعرات الثبات (قابلة للتعديل)
      function stepMaintenance(b) {
        b.appendChild(h('h1', { class: 'title', text: 'سعرات ثباتك' }));
        b.appendChild(h('p', { class: 'dim', text: 'ده تقدير علمي (ممكن يفرق ±10%). لو عارف رقمك الحقيقي من تجربتك، عدّله.' }));
        var inp = numIn(st.maintenance, { step: '50', min: '800' });
        function bump(d) { var v = val(inp) || st.maintenance || 2000; inp.value = Math.max(800, r0(v + d)); }
        b.appendChild(h('div', { class: 'stepper' }, [
          h('button', { class: 'btn', text: '−50', on: { click: function () { bump(-50); } } }),
          inp,
          h('button', { class: 'btn', text: '+50', on: { click: function () { bump(50); } } })
        ]));
        b.appendChild(h('p', { class: 'dim', style: 'font-size:14px;margin-top:12px' }, [
          'معدل الأيض الأساسي ', num(r0(st.calc.bmr)), ' + حركة اليوم ', num(r0(st.calc.activity)), ' + التمرين ', num(r0(st.calc.exercise)),
          h('br'), 'المعادلة: ' + st.calc.method
        ]));
        return function () {
          var v = val(inp);
          if (!v || v < 800 || v > 8000) { UI.toast('اكتب رقم منطقي (800 – 8000)'); return false; }
          st.maintenance = r0(v);
        };
      }

      // 4) الهدف
      function stepGoal(b) {
        b.appendChild(h('h1', { class: 'title', text: 'هدفك' }));
        b.appendChild(h('p', { class: 'dim', text: 'هتنشّف ولا هتضخّم؟' }));
        var amountBox = h('div');
        var targetBox = h('div', { style: 'margin-top:14px' });
        var seg = h('div', { class: 'seg' }, ['cut', 'bulk', 'maintain'].map(function (g) {
          return h('button', { 'data-v': g, class: st.goal === g ? 'on' : '', text: F.GOALS[g], on: { click: function () {
            st.goal = g;
            st.amount = g === 'maintain' ? 0 : (g === 'cut' ? F.GOAL_DEFAULT.cut : F.GOAL_DEFAULT.bulk);
            Array.prototype.forEach.call(seg.children, function (x) { x.classList.toggle('on', x.dataset.v === st.goal); });
            drawAmount();
          } } });
        }));
        b.appendChild(seg);
        b.appendChild(amountBox);
        b.appendChild(targetBox);

        var ain = null;
        function setAmount(v) { st.amount = Math.max(0, Math.min(1500, r0(v))); if (ain) ain.value = st.amount; drawTarget(); }
        function drawAmount() {
          amountBox.textContent = '';
          ain = null;
          if (st.goal !== 'maintain') {
            ain = numIn(st.amount, { step: '50', min: '0' });
            ain.addEventListener('input', function () { var v = val(ain); if (v !== null) { st.amount = Math.max(0, Math.min(1500, r0(v))); drawTarget(); } });
            amountBox.appendChild(h('div', { class: 'dim', style: 'margin:4px 0 6px', text: st.goal === 'cut' ? 'هتنزّل كام سعرة من سعرات ثباتك؟' : 'هتزوّد كام سعرة على سعرات ثباتك؟' }));
            amountBox.appendChild(h('div', { class: 'stepper' }, [
              h('button', { class: 'btn', text: '−50', on: { click: function () { setAmount((val(ain) || 0) - 50); } } }),
              ain,
              h('button', { class: 'btn', text: '+50', on: { click: function () { setAmount((val(ain) || 0) + 50); } } })
            ]));
          }
          drawTarget();
        }
        function drawTarget() {
          targetBox.textContent = '';
          var t = target();
          targetBox.appendChild(h('div', {}, [h('span', { class: 'dim', text: 'هدفك اليومي: ' }), h('span', { class: 'big num', style: 'font-size:32px', text: String(r0(t)) }), h('span', { class: 'dim', text: ' سعرة' })]));
          if (st.goal === 'cut' && st.amount > st.maintenance * 0.25) {
            targetBox.appendChild(h('p', { class: 'dim', style: 'font-size:14px', text: 'تنبيه: النقص ده أكتر من 25% من ثباتك. العادة 10–20% عشان تحافظ على العضل وتقدر تستمر.' }));
          }
          if (st.calc && t < st.calc.bmr) {
            targetBox.appendChild(h('p', { class: 'dim', style: 'font-size:14px', text: 'تنبيه: الهدف أقل من معدل الأيض الأساسي (' + r0(st.calc.bmr) + '). ده منخفض أوي وصعب تستمر عليه.' }));
          }
        }
        drawAmount();
        return function () { if (st.goal !== 'maintain' && st.amount <= 0) { UI.toast('اكتب مقدار أكبر من صفر'); return false; } };
      }

      // 5) الماكروز
      function stepMacros(b) {
        b.appendChild(h('h1', { class: 'title', text: 'احتياجك اليومي' }));
        b.appendChild(h('p', { class: 'dim', text: 'اكتب احتياجك اليومي بالجرام من البروتين والكارب والدهون.' }));
        var pin = numIn(st.pro || '', { placeholder: 'جم' });
        var cin = numIn(st.carb || '', { placeholder: 'جم' });
        var fin = numIn(st.fat || '', { placeholder: 'جم' });
        var info = h('p', { class: 'dim', style: 'font-size:14px' });
        function refresh() {
          var k = r0((val(pin) || 0) * 4 + (val(cin) || 0) * 4 + (val(fin) || 0) * 9);
          info.textContent = 'ده يساوي تقريبًا ' + k + ' سعرة. هدفك ' + r0(target()) + '. (بروتين وكارب 4 سعرات للجرام، والدهون 9)';
        }
        [pin, cin, fin].forEach(function (i) { i.addEventListener('input', refresh); });
        b.appendChild(h('div', { class: 'grid3' }, [field('بروتين جم', pin), field('كارب جم', cin), field('دهون جم', fin)]));
        b.appendChild(info);
        refresh();
        return function () {
          var p = val(pin), c = val(cin), f = val(fin);
          if (!p || !c || !f || p <= 0 || c <= 0 || f <= 0 || p > 1000 || c > 1500 || f > 600) { UI.toast('اكتب الثلاثة أرقام منطقية'); return false; }
          st.pro = p; st.carb = c; st.fat = f;
        };
      }

      draw();
    });
  }

  window.GemmaOnboarding = { run: run };
})();
