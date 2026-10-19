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

# 4) MainActivity يسجّل البلجن
open(f"{jdir}/MainActivity.java", "w", encoding="utf-8").write('''package com.ziad.gemma;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(IconSwitcherPlugin.class);
        registerPlugin(FileCopyPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
''')
print("patch ok")
