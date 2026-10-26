#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
LingXi Music Frontend Build Script
Compiles modular source files in src/ into:
  1. index.html (Root Web entry)
  2. 音乐.html (Root standalone entry, generated locally, NOT tracked by git)
  3. android/app/src/main/assets/index.html (Android APK entry)

version.json is the single source of truth for the release version. Every build
stamps it into:
  - APP_CONFIG.version / APP_CONFIG.build in the generated bundle
  - android/app/build.gradle (versionCode / versionName)
  - MainActivity.java (getAppVersion / getAppVersionCode fallbacks)
"""

import hashlib
import json
import os
import re
import subprocess
import sys
import time

ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
SRC_DIR = os.path.join(ROOT_DIR, 'src')
CSS_DIR = os.path.join(SRC_DIR, 'css')
JS_DIR = os.path.join(SRC_DIR, 'js')
TEMPLATE_FILE = os.path.join(SRC_DIR, 'template.html')
VERSION_FILE = os.path.join(ROOT_DIR, 'version.json')
GRADLE_FILE = os.path.join(ROOT_DIR, 'android', 'app', 'build.gradle')
MAIN_ACTIVITY_FILE = os.path.join(
    ROOT_DIR, 'android', 'app', 'src', 'main', 'java', 'com', 'lingxi', 'music', 'MainActivity.java')

TARGET_FILES = [
    os.path.join(ROOT_DIR, 'index.html'),
    os.path.join(ROOT_DIR, '音乐.html'),
    os.path.join(ROOT_DIR, 'android', 'app', 'src', 'main', 'assets', 'index.html'),
]

LAST_COMBINED_JS = ''

def get_sorted_files(directory, extension):
    if not os.path.exists(directory):
        return []
    files = [
        os.path.join(directory, f)
        for f in os.listdir(directory)
        if f.endswith(extension)
    ]
    return sorted(files)

def load_version_info():
    with open(VERSION_FILE, 'r', encoding='utf-8') as f:
        return json.load(f)

def stamp_js_version(js_source, version_name, build_date):
    m = re.search(r'const APP_CONFIG = \{[^}]*\}', js_source, re.S)
    if not m:
        print('[Warn] APP_CONFIG block not found, version stamp skipped for bundle')
        return js_source
    block = m.group(0)
    block, n_ver = re.subn(r"version:\s*'[^']*'", "version: '" + version_name + "'", block)
    block, n_build = re.subn(r"build:\s*'[^']*'", "build: '" + build_date + "'", block)
    if n_ver == 0 or n_build == 0:
        print('[Warn] APP_CONFIG version/build fields not found, stamp incomplete')
        return js_source
    return js_source[:m.start()] + block + js_source[m.end():]

def sync_file_if_changed(path, new_text, label):
    if not os.path.exists(path):
        print(f'[Warn] {label} not found at {path}, version sync skipped')
        return
    with open(path, 'r', encoding='utf-8') as f:
        old_text = f.read()
    if old_text == new_text:
        return
    with open(path, 'w', encoding='utf-8') as f:
        f.write(new_text)
    print(f'[Sync] {label} version updated from version.json')

def sync_native_versions(version_name, version_code):
    if os.path.exists(GRADLE_FILE):
        with open(GRADLE_FILE, 'r', encoding='utf-8') as f:
            gradle = f.read()
        new_gradle = re.sub(r'versionCode \d+', 'versionCode ' + str(version_code), gradle, count=1)
        new_gradle = re.sub(r'versionName "[^"]*"', 'versionName "' + version_name + '"', new_gradle, count=1)
        sync_file_if_changed(GRADLE_FILE, new_gradle, 'build.gradle')
    else:
        print('[Warn] build.gradle not found, version sync skipped')

    if os.path.exists(MAIN_ACTIVITY_FILE):
        with open(MAIN_ACTIVITY_FILE, 'r', encoding='utf-8') as f:
            java = f.read()
        m_ver = re.search(r'public String getAppVersion\(\) \{.*?\n        \}', java, re.S)
        m_code = re.search(r'public int getAppVersionCode\(\) \{.*?\n        \}', java, re.S)
        if not m_ver or not m_code:
            print('[Warn] getAppVersion/getAppVersionCode not found, MainActivity sync skipped')
            return
        new_ver_block, n1 = re.subn(r'return "[^"]*";', 'return "' + version_name + '";', m_ver.group(0))
        new_code_block, n2 = re.subn(r'return \d+;', 'return ' + str(version_code) + ';', m_code.group(0))
        if n1 == 0 or n2 == 0:
            print('[Warn] MainActivity version return statements not found, sync skipped')
            return
        new_java = java[:m_ver.start()] + new_ver_block + java[m_ver.end():m_code.start()] + new_code_block + java[m_code.end():]
        sync_file_if_changed(MAIN_ACTIVITY_FILE, new_java, 'MainActivity.java')
    else:
        print('[Warn] MainActivity.java not found, version sync skipped')

def compress_css(css):
    # CSS has no line-continuation strings (verified), so per-line strip is safe.
    lines = [ln.strip() for ln in css.split('\n')]
    return '\n'.join(ln for ln in lines if ln)

def compress_js_light(js):
    # JS sources contain multiline template literals, so leading indentation must
    # stay. Only trailing whitespace and 2+ consecutive blank lines are removed.
    lines = [ln.rstrip() for ln in js.split('\n')]
    return re.sub(r'\n{3,}', '\n\n', '\n'.join(lines))

def build():
    global LAST_COMBINED_JS
    start_time = time.time()

    if not os.path.exists(TEMPLATE_FILE):
        print(f"[Error] Template file not found: {TEMPLATE_FILE}")
        return False

    try:
        version_info = load_version_info()
        version_name = str(version_info.get('versionName', ''))
        version_code = version_info.get('versionCode', 0)
    except Exception as e:
        print(f"[Error] Failed to read version.json: {e}")
        return False
    build_date = time.strftime('%Y.%m.%d')

    with open(TEMPLATE_FILE, 'r', encoding='utf-8') as f:
        template = f.read()

    # 1. Collect CSS
    css_files = get_sorted_files(CSS_DIR, '.css')
    css_chunks = []
    for cf in css_files:
        with open(cf, 'r', encoding='utf-8') as f:
            css_chunks.append(f.read())
    combined_css = compress_css('\n'.join(css_chunks))

    # 2. Collect JS
    js_files = get_sorted_files(JS_DIR, '.js')
    js_chunks = []
    for jf in js_files:
        with open(jf, 'r', encoding='utf-8') as f:
            js_chunks.append(f.read())
    combined_js = compress_js_light('\n'.join(js_chunks))
    combined_js = stamp_js_version(combined_js, version_name, build_date)
    LAST_COMBINED_JS = combined_js

    # 3. Assemble
    if '/* {{STYLES}} */' not in template:
        print("[Error] Missing /* {{STYLES}} */ placeholder in template.html")
        return False
    if '/* {{SCRIPTS}} */' not in template:
        print("[Error] Missing /* {{SCRIPTS}} */ placeholder in template.html")
        return False

    output = template.replace('/* {{STYLES}} */', combined_css)
    output = output.replace('/* {{SCRIPTS}} */', combined_js)

    # 4. Sync native version declarations (build.gradle / MainActivity.java)
    sync_native_versions(version_name, version_code)

    # 5. Write targets (binary mode keeps LF endings so md5 verification is exact)
    output_bytes = output.encode('utf-8')
    for target in TARGET_FILES:
        target_dir = os.path.dirname(target)
        if not os.path.exists(target_dir):
            os.makedirs(target_dir, exist_ok=True)
        with open(target, 'wb') as f:
            f.write(output_bytes)

    # 6. Verify all mirrors are byte-identical
    expected_md5 = hashlib.md5(output_bytes).hexdigest()
    all_ok = True
    for target in TARGET_FILES:
        with open(target, 'rb') as f:
            actual_md5 = hashlib.md5(f.read()).hexdigest()
        status = 'OK' if actual_md5 == expected_md5 else 'MISMATCH'
        if actual_md5 != expected_md5:
            all_ok = False
        print(f"  - {os.path.relpath(target, ROOT_DIR)}: md5 {actual_md5[:12]} [{status}]")

    elapsed_ms = (time.time() - start_time) * 1000
    total_lines = len(output.splitlines())
    total_bytes = len(output.encode('utf-8'))

    print(f"[Build Success] Generated {len(TARGET_FILES)} targets in {elapsed_ms:.1f}ms")
    print(f"  - Version:    v{version_name} (code {version_code}) stamped from version.json")
    print(f"  - CSS modules: {len(css_files)} files ({len(combined_css.splitlines())} lines)")
    print(f"  - JS modules:  {len(js_files)} files ({len(combined_js.splitlines())} lines)")
    print(f"  - Total size:  {total_lines} lines ({total_bytes / 1024:.1f} KB)")
    return all_ok

def check_syntax():
    if not LAST_COMBINED_JS:
        print('[Check Error] No built JS available, run build first')
        return False
    try:
        proc = subprocess.run(
            ['node', '-c', '-'],
            input=LAST_COMBINED_JS,
            text=True,
            encoding='utf-8',
            capture_output=True,
            timeout=5
        )
        if proc.returncode == 0:
            print("[Check] Combined JavaScript syntax is valid (Node.js syntax check passed).")
            return True
        else:
            print(f"[Check Error] JavaScript syntax error:\n{proc.stderr}")
            return False
    except FileNotFoundError:
        print("[Check] Node.js not found in PATH, skipped AST syntax check.")
        return True
    except Exception as e:
        print(f"[Check Error] Failed to run syntax check: {e}")
        return False

def watch():
    print("[Watch] Watching src/ directory for changes... Press Ctrl+C to stop.")

    def get_all_mtimes():
        mtimes = {}
        for root, _, files in os.walk(SRC_DIR):
            for file in files:
                p = os.path.join(root, file)
                try:
                    mtimes[p] = os.path.getmtime(p)
                except OSError:
                    pass
        return mtimes

    last_mtimes = get_all_mtimes()
    build()

    try:
        while True:
            time.sleep(0.5)
            current_mtimes = get_all_mtimes()
            if current_mtimes != last_mtimes:
                last_mtimes = current_mtimes
                print("\n[Change Detected] Rebuilding...")
                build()
    except KeyboardInterrupt:
        print("\n[Watch] Watch stopped.")

if __name__ == '__main__':
    if '--watch' in sys.argv:
        watch()
    elif '--check' in sys.argv:
        if build():
            sys.exit(0 if check_syntax() else 1)
        sys.exit(1)
    else:
        sys.exit(0 if build() else 1)
