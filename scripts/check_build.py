import urllib.request
import json
import time
import sys
import os
import subprocess

headers = {'User-Agent': 'Mozilla/5.0'}

# If TARGET_SHA passed in args, use it; otherwise get latest commit
if len(sys.argv) > 1:
    TARGET_SHA = sys.argv[1]
else:
    try:
        res = subprocess.run(["git", "rev-parse", "--short", "HEAD"], capture_output=True, text=True)
        TARGET_SHA = res.stdout.strip()
    except Exception:
        TARGET_SHA = ""

print(f"Watching GitHub Actions for commit SHA prefix: {TARGET_SHA}...", flush=True)

def check_and_wait():
    for i in range(150): # up to 20 minutes
        try:
            url = 'https://api.github.com/repos/visitor315/lingxi-music/actions/runs?per_page=5'
            req = urllib.request.Request(url, headers=headers)
            with urllib.request.urlopen(req) as resp:
                data = json.loads(resp.read().decode('utf-8'))
                for run in data.get('workflow_runs', []):
                    if run.get('name') == 'Build Android APK' and run.get('head_sha', '').startswith(TARGET_SHA):
                        status = run['status']
                        conclusion = run['conclusion']
                        print(f"[{i+1}/150] Run {run['id']}: status={status}, conclusion={conclusion}", flush=True)
                        if status == 'completed':
                            return run
        except Exception as e:
            print("Error polling:", e, flush=True)
        time.sleep(8)
    return None

run = check_and_wait()
if run:
    print(f"Run completed with conclusion: {run['conclusion']}")
    if run['conclusion'] == 'success':
        # Wait a moment for Release asset upload to finalize
        time.sleep(6)
        download_url = 'https://github.com/visitor315/lingxi-music/releases/download/v1.4.0/LingXiMusic.apk'
        print(f"Downloading from {download_url}...", flush=True)
        try:
            req = urllib.request.Request(download_url, headers=headers)
            with urllib.request.urlopen(req) as resp:
                apk_data = resp.read()
                dest1 = r'C:\Users\Administrator\Desktop\LingXiMusic.apk'
                dest2 = r'C:\Users\Administrator\Desktop\灵犀音乐.apk'
                with open(dest1, 'wb') as f:
                    f.write(apk_data)
                with open(dest2, 'wb') as f:
                    f.write(apk_data)
                print(f"Successfully downloaded APK! Size: {len(apk_data)} bytes", flush=True)

                # Check if ADB device is connected
                res_dev = subprocess.run(["adb", "devices"], capture_output=True, text=True)
                lines = [l.strip() for l in res_dev.stdout.splitlines() if l.strip() and not l.startswith("List of devices")]
                devices = [l.split()[0] for l in lines if "\tdevice" in l]

                if devices:
                    print(f"Found connected ADB device(s): {devices}, installing update (retaining user data)...", flush=True)
                    res = subprocess.run(["adb", "install", "-r", dest1], capture_output=True, text=True)
                    print("ADB install stdout:", res.stdout, flush=True)
                    print("ADB install stderr:", res.stderr, flush=True)
                    if "INSTALL_FAILED_UPDATE_INCOMPATIBLE" in res.stdout or "INSTALL_FAILED_UPDATE_INCOMPATIBLE" in res.stderr:
                        print("Notice: Legacy ephemeral signature detected. Performing one-time migration to permanent signature...", flush=True)
                        subprocess.run(["adb", "uninstall", "com.lingxi.music"], capture_output=True, text=True)
                        res = subprocess.run(["adb", "install", "-r", dest1], capture_output=True, text=True)
                        print("Migration ADB install stdout:", res.stdout, flush=True)
                        print("Migration ADB install stderr:", res.stderr, flush=True)

                    print("Setting appops permissions...", flush=True)
                    subprocess.run(["adb", "shell", "appops", "set", "com.lingxi.music", "SYSTEM_ALERT_WINDOW", "allow"])
                    subprocess.run(["adb", "shell", "appops", "set", "com.lingxi.music", "ACCESS_RESTRICTED_SETTINGS", "allow"])

                    print("Starting app via ADB...", flush=True)
                    res_start = subprocess.run(["adb", "shell", "am", "start", "-n", "com.lingxi.music/.MainActivity"], capture_output=True, text=True)
                    print("ADB start stdout:", res_start.stdout, flush=True)
                else:
                    print("No ADB device currently attached. APK is saved on Desktop.", flush=True)

        except Exception as e:
            print("Download or install error:", e, flush=True)
            sys.exit(1)
    else:
        sys.exit(1)
else:
    print("Timeout waiting for build to complete", flush=True)
    sys.exit(1)
