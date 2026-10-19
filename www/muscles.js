/* جِمّا - قايمة العضلات الأولية (www/muscles.js)
   12 عضلة شاملة. كل عضلة ليها أجزاء، والتمرين بيتحط تحت جزء.
   العضلة اللي من غير أجزاء: التمرين بيتحط تحت اسمها مباشرة.
   الأرقام (id) ثابتة ومايتغيرتش عشان البيانات والتحليلات تفضل سليمة. */
(function () {
  var SEED = [
    { id: 'chest', name: 'الصدر', parts: [
      { id: 'chest_upper', name: 'علوي' },
      { id: 'chest_mid', name: 'وسط' },
      { id: 'chest_lower', name: 'سفلي' } ] },
    { id: 'back', name: 'الضهر', parts: [
      { id: 'back_lats', name: 'عرض (Lats)' },
      { id: 'back_thick', name: 'سمك (وسط الضهر)' },
      { id: 'back_lower', name: 'أسفل الضهر' } ] },
    { id: 'shoulder', name: 'الكتف', parts: [
      { id: 'shoulder_front', name: 'أمامي' },
      { id: 'shoulder_side', name: 'جانبي' },
      { id: 'shoulder_rear', name: 'خلفي' } ] },
    { id: 'biceps', name: 'الباي', parts: [
      { id: 'biceps_long', name: 'رأس طويل' },
      { id: 'biceps_short', name: 'رأس قصير' },
      { id: 'biceps_brachialis', name: 'براكياليس' } ] },
    { id: 'triceps', name: 'التراي', parts: [
      { id: 'triceps_long', name: 'رأس طويل' },
      { id: 'triceps_lateral', name: 'رأس جانبي' },
      { id: 'triceps_medial', name: 'رأس إنسي' } ] },
    { id: 'forearm', name: 'الساعد', parts: [
      { id: 'forearm_inner', name: 'باطن الساعد' },
      { id: 'forearm_outer', name: 'ظهر الساعد' } ] },
    { id: 'traps', name: 'الترابيس', parts: [
      { id: 'traps_upper', name: 'علوي' },
      { id: 'traps_midlow', name: 'وسط وسفلي' } ] },
    { id: 'quads', name: 'الفخد الأمامي (كوادز)', parts: [] },
    { id: 'hamstrings', name: 'الفخد الخلفي (هامسترنج)', parts: [] },
    { id: 'glutes', name: 'الأرداف (جلوتس)', parts: [] },
    { id: 'calves', name: 'السمانة', parts: [] },
    { id: 'abs', name: 'البطن', parts: [
      { id: 'abs_upper', name: 'علوي' },
      { id: 'abs_lower', name: 'سفلي' },
      { id: 'abs_oblique', name: 'جانبي (أوبليك)' } ] }
  ];

  function seed() {
    return SEED.map(function (m, i) {
      return { id: m.id, name: m.name, order: i,
        parts: m.parts.map(function (p, j) { return { id: p.id, name: p.name, order: j }; }) };
    });
  }

  // لو القايمة فاضية (أول تشغيل) نملاها. ماتلمسش قايمة موجودة.
  function ensureSeeded(data) {
    if (!data.muscles || data.muscles.length === 0) { data.muscles = seed(); return true; }
    return false;
  }

  // كل الأماكن اللي التمرين ينفع يتحط تحتها (جزء، أو عضلة من غير أجزاء)
  function places(data) {
    var out = [];
    data.muscles.forEach(function (m) {
      if (m.parts && m.parts.length) {
        m.parts.forEach(function (p) { out.push({ id: p.id, name: p.name, muscleId: m.id, muscleName: m.name }); });
      } else {
        out.push({ id: m.id, name: m.name, muscleId: m.id, muscleName: m.name });
      }
    });
    return out;
  }

  function findPlace(data, placeId) {
    return places(data).filter(function (p) { return p.id === placeId; })[0] || null;
  }

  window.GemmaMuscles = { seed: seed, ensureSeeded: ensureSeeded, places: places, findPlace: findPlace };
})();
