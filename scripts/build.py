#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
LingXi Music Frontend Build Script
Compiles modular source files in src/ into:
  1. index.html (Root Web entry)
  2. 音乐.html (Root standalone entry)
  3. android/app/src/main/assets/index.html (Android APK entry)
"""

import os
import sys
import time
import shutil
import subprocess

ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
SRC_DIR = os.path.join(ROOT_DIR, 'src')
CSS_DIR = os.path.join(SRC_DIR, 'css')
JS_DIR = os.path.join(SRC_DIR, 'js')
TEMPLATE_FILE = os.path.join(SRC_DIR, 'template.html')

TARGET_FILES = [
    os.path.join(ROOT_DIR, 'index.html'),
    os.path.join(ROOT_DIR, '音乐.html'),
    os.path.join(ROOT_DIR, 'android', 'app', 'src', 'main', 'assets', 'index.html'),
]

def get_sorted_files(directory, extension):
    if not os.path.exists(directory):
        return []
    files = [
        os.path.join(directory, f)
        for f in os.listdir(directory)
        if f.endswith(extension)
    ]
    return sorted(files)

def build():
    start_time = time.time()

    if not os.path.exists(TEMPLATE_FILE):
        print(f"[Error] Template file not found: {TEMPLATE_FILE}")
        return False

    with open(TEMPLATE_FILE, 'r', encoding='utf-8') as f:
        template = f.read()

    # 1. Collect CSS
    css_files = get_sorted_files(CSS_DIR, '.css')
    css_chunks = []
    for cf in css_files:
        with open(cf, 'r', encoding='utf-8') as f:
            css_chunks.append(f.read())
    combined_css = '\n'.join(css_chunks)

    # 2. Collect JS
    js_files = get_sorted_files(JS_DIR, '.js')
    js_chunks = []
    for jf in js_files:
        with open(jf, 'r', encoding='utf-8') as f:
            js_chunks.append(f.read())
    combined_js = '\n'.join(js_chunks)

    # 3. Assemble
    if '/* {{STYLES}} */' not in template:
        print("[Error] Missing /* {{STYLES}} */ placeholder in template.html")
        return False
    if '/* {{SCRIPTS}} */' not in template:
        print("[Error] Missing /* {{SCRIPTS}} */ placeholder in template.html")
        return False

    output = template.replace('/* {{STYLES}} */', combined_css)
    output = output.replace('/* {{SCRIPTS}} */', combined_js)

    # 4. Write targets
    for target in TARGET_FILES:
        target_dir = os.path.dirname(target)
        if not os.path.exists(target_dir):
            os.makedirs(target_dir, exist_ok=True)
        with open(target, 'w', encoding='utf-8') as f:
            f.write(output)

    elapsed_ms = (time.time() - start_time) * 1000
    total_lines = len(output.splitlines())
    total_bytes = len(output.encode('utf-8'))

    print(f"[Build Success] Generated {len(TARGET_FILES)} targets in {elapsed_ms:.1f}ms")
    print(f"  - CSS modules: {len(css_files)} files ({len(combined_css.splitlines())} lines)")
    print(f"  - JS modules:  {len(js_files)} files ({len(combined_js.splitlines())} lines)")
    print(f"  - Total size:  {total_lines} lines ({total_bytes / 1024:.1f} KB)")
    return True

def check_syntax():
    js_files = get_sorted_files(JS_DIR, '.js')
    combined_js = '\n'.join([open(f, 'r', encoding='utf-8').read() for f in js_files])
    
    # Try node check if node is installed
    try:
        proc = subprocess.run(
            ['node', '-c', '-'],
            input=combined_js,
            text=True,
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
    last_mtimes = {}

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
            check_syntax()
    else:
        build()
