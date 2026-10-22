#!/usr/bin/env python3
"""Patches the generated android/ project: icon aliases (dark/light) + IconSwitcher plugin."""
import re, sys

root = sys.argv[1] if len(sys.argv) > 1 else "android"
man = f"{root}/app/src/main/AndroidManifest.xml"
jdir = f"{root}/app/src/main/java/com/ziad/gemma"

s = open(man, encoding="utf-8").read()

# 1) المدخل الرئيسي يتنقل من MainActivity للـ aliases
s, n = re.subn(r"\s*<intent-filter>\s*<action android:name=\"android.intent.action.MAIN\" />\s*<category android:name=\"android.intent.category.LAUNCHER\" />\s*</intent-filter>", "", s, count=1)
assert n == 1, "launcher intent-filter not found"

# 2) أيقونة التطبيق الافتراضية = الداكنة
s = s.replace('android:icon="@mipmap/ic_launcher"', 'android:icon="@mipmap/gemma_dark"')
s = s.replace('android:roundIcon="@mipmap/ic_launcher_round"', 'android:roundIcon="@mipmap/gemma_dark"')

def alias(name, icon, enabled):
    return f'''
        <activity-alias
            android:name=".{name}"
            android:targetActivity=".MainActivity"
            android:icon="@mipmap/{icon}"
            android:roundIcon="@mipmap/{icon}"
            android:label="@string/app_name"
            android:enabled="{enabled}"
            android:exported="true">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity-alias>
'''

block = alias("IconDark", "gemma_dark", "true") + alias("IconLight", "gemma_light", "false")
assert "<provider" in s, "provider tag not found"
s = s.replace("<provider", block + "\n        <provider", 1)
open(man, "w", encoding="utf-8").write(s)

# 3) البلجن
open(f"{jdir}/IconSwitcherPlugin.java", "w", encoding="utf-8").write('''package com.ziad.gemma;

import android.content.ComponentName;
import android.content.pm.PackageManager;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "IconSwitcher")
public class IconSwitcherPlugin extends Plugin {

    private ComponentName comp(String n) {
        return new ComponentName(getContext().getPackageName(), "com.ziad.gemma." + n);
    }

    @PluginMethod
    public void setIcon(PluginCall call) {
        String mode = call.getString("mode", "dark");
        boolean light = "light".equals(mode);
        PackageManager pm = getContext().getPackageManager();
        ComponentName on = comp(light ? "IconLight" : "IconDark");
        ComponentName off = comp(light ? "IconDark" : "IconLight");
        try {
            pm.setComponentEnabledSetting(on, PackageManager.COMPONENT_ENABLED_STATE_ENABLED, PackageManager.DONT_KILL_APP);
            pm.setComponentEnabledSetting(off, PackageManager.COMPONENT_ENABLED_STATE_DISABLED, PackageManager.DONT_KILL_APP);
            JSObject r = new JSObject();
            r.put("mode", light ? "light" : "dark");
            call.resolve(r);
        } catch (Exception e) {
            call.reject("icon switch failed: " + e.getMessage());
        }
    }

    @PluginMethod
    public void getIcon(PluginCall call) {
        PackageManager pm = getContext().getPackageManager();
        int st = pm.getComponentEnabledSetting(comp("IconLight"));
        JSObject r = new JSObject();
        r.put("mode", st == PackageManager.COMPONENT_ENABLED_STATE_ENABLED ? "light" : "dark");
        call.resolve(r);
    }
}
''')

# 3b) بلجن نسخ ملف من عنوان content:// لمساحة التطبيق (بالبث، من غير ما يحمّل الملف في الذاكرة)
open(f"{jdir}/FileCopyPlugin.java", "w", encoding="utf-8").write('''package com.ziad.gemma;

import android.net.Uri;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;

@CapacitorPlugin(name = "FileCopy")
public class FileCopyPlugin extends Plugin {

    @PluginMethod
    public void copyUri(PluginCall call) {
        String uri = call.getString("uri");
        String path = call.getString("path");
        if (uri == null || path == null || path.contains("..")) {
            call.reject("bad arguments");
            return;
        }
        File dest = new File(getContext().getFilesDir(), path);
        File parent = dest.getParentFile();
        if (parent != null) parent.mkdirs();
        File tmp = new File(dest.getPath() + ".part");
        long total = 0;
        try (InputStream in = getContext().getContentResolver().openInputStream(Uri.parse(uri))) {
            if (in == null) {
                call.reject("cannot open uri");
                return;
            }
            try (OutputStream out = new FileOutputStream(tmp)) {
                byte[] buf = new byte[65536];
                int n;
                while ((n = in.read(buf)) != -1) {
                    out.write(buf, 0, n);
                    total += n;
                }
                out.flush();
            }
        } catch (Exception e) {
            tmp.delete();
            call.reject("copy failed: " + e.getMessage());
            return;
        }
        if (dest.exists()) dest.delete();
        if (!tmp.renameTo(dest)) {
            tmp.delete();
            call.reject("rename failed");
            return;
        }
        JSObject r = new JSObject();
        r.put("size", total);
        call.resolve(r);
    }
}
''')

# 3c) بلجن النسخ الاحتياطي والاستعادة (فولدر على التليفون عن طريق منتقي الفولدرات بتاع أندرويد)
open(f"{jdir}/BackupPlugin.java", "w", encoding="utf-8").write('''package com.ziad.gemma;

import android.app.Activity;
import android.content.ContentResolver;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.provider.DocumentsContract;
import android.webkit.MimeTypeMap;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.Callable;

@CapacitorPlugin(name = "Backup")
public class BackupPlugin extends Plugin {

    private static final String ROOT_NAME = "Gemma-Backup";
    private static final String[] MEDIA_DIRS = { "videos", "photos" };

    private volatile boolean cancelled = false;
    private volatile boolean busy = false;

    private static class Doc {
        String id;
        String name;
        boolean dir;
        long size;
    }

    private static class Prog {
        long done = 0;
        long total = 0;
        int index = 0;
        int count = 0;
        String name = "";
        long lastEmit = 0;
    }

    // ---------- أدوات SAF ----------

    private ContentResolver cr() {
        return getContext().getContentResolver();
    }

    private Uri docUri(Uri tree, String id) {
        return DocumentsContract.buildDocumentUriUsingTree(tree, id);
    }

    private List<Doc> children(Uri tree, String parentId) {
        List<Doc> out = new ArrayList<>();
        Uri q = DocumentsContract.buildChildDocumentsUriUsingTree(tree, parentId);
        Cursor c = null;
        try {
            c = cr().query(q, new String[] {
                DocumentsContract.Document.COLUMN_DOCUMENT_ID,
                DocumentsContract.Document.COLUMN_DISPLAY_NAME,
                DocumentsContract.Document.COLUMN_MIME_TYPE,
                DocumentsContract.Document.COLUMN_SIZE
            }, null, null, null);
            if (c == null) return out;
            while (c.moveToNext()) {
                Doc d = new Doc();
                d.id = c.getString(0);
                d.name = c.getString(1);
                d.dir = DocumentsContract.Document.MIME_TYPE_DIR.equals(c.getString(2));
                d.size = c.isNull(3) ? -1 : c.getLong(3);
                out.add(d);
            }
        } finally {
            if (c != null) c.close();
        }
        return out;
    }

    private Doc find(List<Doc> list, String name) {
        for (Doc d : list) {
            if (name.equals(d.name)) return d;
        }
        return null;
    }

    private String mimeOf(String name) {
        int i = name.lastIndexOf('.');
        if (i >= 0) {
            String m = MimeTypeMap.getSingleton().getMimeTypeFromExtension(name.substring(i + 1).toLowerCase(Locale.ROOT));
            if (m != null) return m;
        }
        return "application/octet-stream";
    }

    private String ensureDir(Uri tree, String parentId, String name) throws IOException {
        Doc d = find(children(tree, parentId), name);
        if (d != null) {
            if (!d.dir) throw new IOException("فيه ملف بنفس اسم الفولدر: " + name);
            return d.id;
        }
        Uri u = DocumentsContract.createDocument(cr(), docUri(tree, parentId), DocumentsContract.Document.MIME_TYPE_DIR, name);
        if (u == null) throw new IOException("مقدرتش أعمل فولدر " + name);
        return DocumentsContract.getDocumentId(u);
    }

    // لو الفولدر المختار فيه data.json مباشرة، أو فيه فولدر Gemma-Backup جواه data.json
    private String findBackupRoot(Uri tree) {
        String rootId = DocumentsContract.getTreeDocumentId(tree);
        List<Doc> top = children(tree, rootId);
        Doc dj = find(top, "data.json");
        if (dj != null && !dj.dir) return rootId;
        Doc g = find(top, ROOT_NAME);
        if (g != null && g.dir) {
            Doc dj2 = find(children(tree, g.id), "data.json");
            if (dj2 != null && !dj2.dir) return g.id;
        }
        return null;
    }

    // ---------- أدوات النسخ ----------

    private void emit(Prog p, boolean force) {
        long now = System.currentTimeMillis();
        if (!force && now - p.lastEmit < 250) return;
        p.lastEmit = now;
        JSObject o = new JSObject();
        o.put("done", p.done);
        o.put("total", p.total);
        o.put("index", p.index);
        o.put("count", p.count);
        o.put("name", p.name);
        notifyListeners("progress", o);
    }

    private long pump(InputStream in, OutputStream out, Prog p) throws IOException {
        byte[] buf = new byte[65536];
        long n = 0;
        int r;
        while ((r = in.read(buf)) != -1) {
            if (cancelled) throw new IOException("cancelled");
            out.write(buf, 0, r);
            n += r;
            if (p != null) {
                p.done += r;
                emit(p, false);
            }
        }
        out.flush();
        return n;
    }

    private String readText(Uri uri) throws IOException {
        try (InputStream in = cr().openInputStream(uri)) {
            if (in == null) throw new IOException("مقدرتش أفتح الملف");
            ByteArrayOutputStream bo = new ByteArrayOutputStream();
            byte[] buf = new byte[16384];
            int r;
            long total = 0;
            while ((r = in.read(buf)) != -1) {
                total += r;
                if (total > 64L * 1024 * 1024) throw new IOException("data.json كبير بشكل غير طبيعي");
                bo.write(buf, 0, r);
            }
            return bo.toString("UTF-8");
        }
    }

    private void runAsync(final PluginCall call, final Callable<JSObject> job) {
        if (busy) {
            call.reject("busy");
            return;
        }
        busy = true;
        cancelled = false;
        new Thread(() -> {
            try {
                call.resolve(job.call());
            } catch (Exception e) {
                call.reject(cancelled ? "cancelled" : (e.getMessage() == null ? e.toString() : e.getMessage()));
            } finally {
                busy = false;
            }
        }).start();
    }

    // ---------- اختيار فولدر ----------

    @PluginMethod
    public void pickFolder(PluginCall call) {
        Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);
        i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION | Intent.FLAG_GRANT_PREFIX_URI_PERMISSION);
        startActivityForResult(call, i, "pickFolderResult");
    }

    @ActivityCallback
    private void pickFolderResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        JSObject r = new JSObject();
        Intent data = result.getData();
        if (result.getResultCode() == Activity.RESULT_OK && data != null && data.getData() != null) {
            r.put("uri", data.getData().toString());
        } else {
            r.put("uri", JSObject.NULL);
        }
        call.resolve(r);
    }

    @PluginMethod
    public void cancel(PluginCall call) {
        cancelled = true;
        call.resolve();
    }

    // ---------- نسخة احتياطية: التطبيق ← فولدر ----------
    // بتنسخ videos و photos الأول (ومابتعيدش اللي موجود بنفس الحجم)، و data.json آخر حاجة.

    @PluginMethod
    public void exportTo(final PluginCall call) {
        final String treeStr = call.getString("treeUri");
        if (treeStr == null) {
            call.reject("مفيش فولدر");
            return;
        }
        runAsync(call, () -> doExport(Uri.parse(treeStr)));
    }

    private JSObject doExport(Uri tree) throws Exception {
        File base = getContext().getFilesDir();
        File dataFile = new File(base, "data.json");
        if (!dataFile.exists()) throw new IOException("data.json مش موجود");

        List<String> rels = new ArrayList<>();
        Prog p = new Prog();
        for (String dir : MEDIA_DIRS) {
            File[] fs = new File(base, dir).listFiles();
            if (fs == null) continue;
            for (File f : fs) {
                if (f.isFile() && !f.getName().endsWith(".part")) {
                    rels.add(dir + "/" + f.getName());
                    p.total += f.length();
                }
            }
        }
        p.total += dataFile.length();
        p.count = rels.size() + 1;

        String treeRoot = DocumentsContract.getTreeDocumentId(tree);
        String bk = ensureDir(tree, treeRoot, ROOT_NAME);
        Map<String, String> dirIds = new HashMap<>();
        Map<String, List<Doc>> listing = new HashMap<>();
        int copied = 0, skipped = 0;

        for (int i = 0; i < rels.size(); i++) {
            if (cancelled) throw new IOException("cancelled");
            String rel = rels.get(i);
            int slash = rel.indexOf('/');
            String dir = rel.substring(0, slash);
            String name = rel.substring(slash + 1);
            if (!dirIds.containsKey(dir)) {
                String id = ensureDir(tree, bk, dir);
                dirIds.put(dir, id);
                listing.put(dir, children(tree, id));
            }
            File src = new File(base, rel);
            long len = src.length();
            p.index = i + 1;
            p.name = name;
            Doc ex = find(listing.get(dir), name);
            if (ex != null && ex.dir) throw new IOException("فيه فولدر بنفس اسم الملف: " + name);
            if (ex != null && ex.size == len) {
                skipped++;
                p.done += len;
                emit(p, true);
                continue;
            }
            Uri target;
            if (ex != null) {
                target = docUri(tree, ex.id);
            } else {
                target = DocumentsContract.createDocument(cr(), docUri(tree, dirIds.get(dir)), mimeOf(name), name);
                if (target == null) throw new IOException("مقدرتش أعمل الملف " + name);
            }
            long written;
            try (InputStream in = new FileInputStream(src); OutputStream out = cr().openOutputStream(target, "wt")) {
                if (out == null) throw new IOException("مقدرتش أكتب " + name);
                written = pump(in, out, p);
            }
            if (written != len) throw new IOException("حجم الملف مش مظبوط بعد النسخ: " + name);
            copied++;
            emit(p, true);
        }

        // data.json آخر حاجة، فالنسخة ماتبقاش كاملة إلا لما كل الفيديوهات تكون وصلت
        if (cancelled) throw new IOException("cancelled");
        p.index = p.count;
        p.name = "data.json";
        List<Doc> top = children(tree, bk);
        Doc dj = find(top, "data.json");
        Uri djUri = dj != null ? docUri(tree, dj.id)
            : DocumentsContract.createDocument(cr(), docUri(tree, bk), "application/json", "data.json");
        if (djUri == null) throw new IOException("مقدرتش أعمل data.json");
        long w;
        try (InputStream in = new FileInputStream(dataFile); OutputStream out = cr().openOutputStream(djUri, "wt")) {
            if (out == null) throw new IOException("مقدرتش أكتب data.json");
            w = pump(in, out, p);
        }
        if (w != dataFile.length()) throw new IOException("حجم data.json مش مظبوط");
        emit(p, true);

        JSObject r = new JSObject();
        r.put("copied", copied);
        r.put("skipped", skipped);
        r.put("bytes", p.total);
        return r;
    }

    // ---------- استعادة، الخطوة 1: فحص النسخة ----------

    @PluginMethod
    public void inspect(final PluginCall call) {
        final String treeStr = call.getString("treeUri");
        if (treeStr == null) {
            call.reject("مفيش فولدر");
            return;
        }
        runAsync(call, () -> {
            Uri tree = Uri.parse(treeStr);
            JSObject r = new JSObject();
            String root = findBackupRoot(tree);
            if (root == null) {
                r.put("found", false);
                return r;
            }
            List<Doc> top = children(tree, root);
            Doc dj = find(top, "data.json");
            r.put("found", true);
            r.put("dataJson", readText(docUri(tree, dj.id)));
            int videos = 0, photos = 0;
            long bytes = 0;
            for (String dir : MEDIA_DIRS) {
                Doc d = find(top, dir);
                if (d == null || !d.dir) continue;
                for (Doc f : children(tree, d.id)) {
                    if (f.dir) continue;
                    if ("videos".equals(dir)) videos++; else photos++;
                    if (f.size > 0) bytes += f.size;
                }
            }
            r.put("videos", videos);
            r.put("photos", photos);
            r.put("bytes", bytes);
            return r;
        });
    }

    // ---------- استعادة، الخطوة 2: نسخ الفيديوهات والصور من الفولدر للتطبيق ----------
    // بتضيف وبتكتب فوق بس، ومابتمسحش حاجة. data.json بيتبدل بعدها من الجافاسكريبت.

    @PluginMethod
    public void restoreMedia(final PluginCall call) {
        final String treeStr = call.getString("treeUri");
        if (treeStr == null) {
            call.reject("مفيش فولدر");
            return;
        }
        runAsync(call, () -> doRestoreMedia(Uri.parse(treeStr)));
    }

    private JSObject doRestoreMedia(Uri tree) throws Exception {
        String root = findBackupRoot(tree);
        if (root == null) throw new IOException("مش لاقي نسخة احتياطية في الفولدر ده");
        List<Doc> top = children(tree, root);
        File base = getContext().getFilesDir();

        List<Doc> files = new ArrayList<>();
        List<String> dirsOf = new ArrayList<>();
        Prog p = new Prog();
        for (String dir : MEDIA_DIRS) {
            Doc d = find(top, dir);
            if (d == null || !d.dir) continue;
            for (Doc f : children(tree, d.id)) {
                if (f.dir) continue;
                if (f.name == null || f.name.contains("/") || f.name.contains("..") || f.name.endsWith(".part")) continue;
                files.add(f);
                dirsOf.add(dir);
                if (f.size > 0) p.total += f.size;
            }
        }
        p.count = files.size();
        int copied = 0, skipped = 0;

        for (int i = 0; i < files.size(); i++) {
            if (cancelled) throw new IOException("cancelled");
            Doc f = files.get(i);
            String dir = dirsOf.get(i);
            p.index = i + 1;
            p.name = f.name;
            File destDir = new File(base, dir);
            destDir.mkdirs();
            File dest = new File(destDir, f.name);
            if (dest.exists() && f.size >= 0 && dest.length() == f.size) {
                skipped++;
                if (f.size > 0) p.done += f.size;
                emit(p, true);
                continue;
            }
            File tmp = new File(destDir, f.name + ".part");
            long written;
            try (InputStream in = cr().openInputStream(docUri(tree, f.id)); OutputStream out = new FileOutputStream(tmp)) {
                if (in == null) throw new IOException("مقدرتش أقرا " + f.name);
                written = pump(in, out, p);
            } catch (Exception e) {
                tmp.delete();
                throw e;
            }
            if (f.size >= 0 && written != f.size) {
                tmp.delete();
                throw new IOException("حجم الملف مش مظبوط بعد النسخ: " + f.name);
            }
            if (dest.exists()) dest.delete();
            if (!tmp.renameTo(dest)) {
                tmp.delete();
                throw new IOException("مقدرتش أسمّي " + f.name);
            }
            copied++;
            emit(p, true);
        }

        JSObject r = new JSObject();
        r.put("copied", copied);
        r.put("skipped", skipped);
        return r;
    }
}
''')

# 4) MainActivity يسجّل البلجن
open(f"{jdir}/MainActivity.java", "w", encoding="utf-8").write('''package com.ziad.gemma;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(IconSwitcherPlugin.class);
        registerPlugin(FileCopyPlugin.class);
        registerPlugin(BackupPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
''')
print("patch ok")
