/* جِمّا - طبقة التخزين (www/storage.js)
   بتحفظ البيانات في data.json جوه مساحة التطبيق الخاصة، بكتابة آمنة. */
(function () {
  var FILE = 'data.json', TMP = 'data.tmp', BAK = 'data.bak';
  var DIR = 'DATA';
  var SCHEMA = 1;

  var data = null;
  var queue = Promise.resolve();

  function fs() {
    var p = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Filesystem;
    if (!p) throw new Error('Filesystem plugin not available');
    return p;
  }

  function emptyData() {
    return {
      schema: SCHEMA,
      muscles: [],
      exercises: [],
      days: [],
      programs: [],
      programHistory: [],
      sessions: [],
      notes: {},
      bodyWeights: [],
      measurements: [],
      waterLogs: [],
      foods: [],
      foodLogs: [],
      savedMeals: [],
      photos: [],
      profile: {},
      settings: { lang: 'ar', theme: 'dark', lastBackup: null }
    };
  }

  // ترحيل الصيغة: كل رقم إصدار جديد يتضاف هنا
  function migrate(d) {
    var base = emptyData();
    Object.keys(base).forEach(function (k) { if (d[k] === undefined) d[k] = base[k]; });
    // مثال لمرحلة جاية: if (d.schema < 2) { ...; d.schema = 2; }
    d.schema = SCHEMA;
    return d;
  }

  async function readText(name) {
    var r = await fs().readFile({ path: name, directory: DIR, encoding: 'utf8' });
    return r.data;
  }
  async function exists(name) {
    try { await fs().stat({ path: name, directory: DIR }); return true; }
    catch (e) { return false; }
  }
  async function tryParse(name) {
    try {
      if (!(await exists(name))) return null;
      var obj = JSON.parse(await readText(name));
      return (obj && typeof obj === 'object') ? obj : null;
    } catch (e) { return null; }
  }

  async function init() {
    var d = await tryParse(FILE);
    if (!d) d = await tryParse(BAK);
    if (!d) d = await tryParse(TMP);
    data = migrate(d || emptyData());
    await fs().mkdir({ path: 'videos', directory: DIR, recursive: true }).catch(function () {});
    await fs().mkdir({ path: 'photos', directory: DIR, recursive: true }).catch(function () {});
    if (!d) await save();
    return data;
  }

  // حفظ: اكتب مؤقت ← خد نسخة من القديم ← بدّل الاسم
  function save() {
    queue = queue.then(async function () {
      var text = JSON.stringify(data);
      await fs().writeFile({ path: TMP, directory: DIR, data: text, encoding: 'utf8' });
      if (await exists(FILE)) {
        await fs().copy({ from: FILE, to: BAK, directory: DIR, toDirectory: DIR });
      }
      await fs().rename({ from: TMP, to: FILE, directory: DIR, toDirectory: DIR });
    });
    queue = queue.catch(function (e) { console.error('save failed', e); throw e; });
    var p = queue;
    queue = queue.catch(function () {});
    return p;
  }

  function id(prefix) {
    return (prefix || 'x') + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function today() {
    var d = new Date();
    var m = String(d.getMonth() + 1).padStart(2, '0');
    var day = String(d.getDate()).padStart(2, '0');
    return d.getFullYear() + '-' + m + '-' + day;
  }

  // ملفات (فيديو/صور) جوه مساحة التطبيق
  async function fileUri(relPath) {
    var r = await fs().getUri({ path: relPath, directory: DIR });
    return window.Capacitor.convertFileSrc(r.uri);
  }
  async function copyIn(fromUri, relPath) {
    // fromUri: مسار الملف اللي اختاره المنتقي
    await fs().copy({ from: fromUri, to: relPath, toDirectory: DIR });
    return relPath;
  }
  async function removeFile(relPath) {
    try { await fs().deleteFile({ path: relPath, directory: DIR }); } catch (e) {}
  }

  window.GemmaStore = {
    init: init,
    save: save,
    get data() { return data; },
    id: id,
    today: today,
    fileUri: fileUri,
    copyIn: copyIn,
    removeFile: removeFile,
    SCHEMA: SCHEMA
  };
})();
