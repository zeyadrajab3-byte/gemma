/* جِمّا - الرئيسية (www/home.js)
   تحية + كارت السعرات: أكلت كام وفاضلك كام. الضغط عليه بيفتح صفحة الأكل بالتفاصيل. */
(function () {
  var UI = window.GemmaUI, h = UI.h, S = window.GemmaStore, F = window.GemmaFood, W = window.GemmaWorkout;
  var ICON_BACK = '<path d="M5 12h14M13 6l6 6-6 6"/>';

  function num(t) { return h('span', { class: 'num', text: String(t) }); }
  function r0(n) { return Math.round(n); }

  function calorieCard() {
    var tot = F.totalsOn(S.today());
    var target = F.targetKcal();
    var card = h('div', { class: 'card tap', role: 'button', on: { click: F.openToday } });

    if (target === null) {
      card.appendChild(h('div', { class: 'dim', text: 'أكلت النهارده' }));
      card.appendChild(h('div', { class: 'big' }, [num(r0(tot.kcal)), h('span', { class: 'unit', text: ' سعرة' })]));
      card.appendChild(h('div', { class: 'cal-foot' }, [h('span', { text: 'اضغط عشان تحدد سعراتك وهدفك' }), UI.icon(ICON_BACK)]));
      return card;
    }

    var left = target - tot.kcal, over = left < 0;
    var pct = target > 0 ? Math.min(100, Math.round(tot.kcal / target * 100)) : 0;
    card.appendChild(h('div', { class: 'cal-grid' }, [
      h('div', { class: 'cal-box' }, [
        h('div', { class: 'lbl', text: 'أكلت' }),
        h('div', { class: 'big' }, [num(r0(tot.kcal)), h('span', { class: 'unit', text: ' سعرة' })])
      ]),
      h('div', { class: 'cal-box' }, [
        h('div', { class: 'lbl', text: over ? 'تعدّيت بـ' : 'فاضلك' }),
        h('div', { class: 'big' + (over ? ' danger-text' : '') }, [num(r0(Math.abs(left))), h('span', { class: 'unit', text: ' سعرة' })])
      ])
    ]));
    card.appendChild(h('div', { class: 'progress' }, [h('i', { style: 'width:' + pct + '%' + (over ? ';background:var(--danger)' : '') })]));
    card.appendChild(h('div', { class: 'cal-foot' }, [
      h('span', {}, ['هدفك ', num(r0(target)), ' سعرة · التفاصيل والماكروز']),
      UI.icon(ICON_BACK)
    ]));
    return card;
  }

  window.GemmaScreens = window.GemmaScreens || {};
  window.GemmaScreens.home = function (box) {
    // صفحة التمرين (بتفتح من كارت التمرين)
    if (W.isOpen() && W.render(box)) return;
    box.appendChild(h('div', { class: 'page-head' }, [h('h1', { class: 'title', text: 'الرئيسية' })]));
    box.appendChild(calorieCard());
    box.appendChild(W.card());
  };
})();
