import sys, os
pkgs = r"C:\Users\toshr\.workbuddy-ai\binaries\python\pkgs"
for p in (pkgs, os.path.join(pkgs, "win32"), os.path.join(pkgs, "win32", "lib")):
    if os.path.isdir(p) and p not in sys.path:
        sys.path.insert(0, p)
d = os.path.join(pkgs, "pywin32_system32")
if os.path.isdir(d):
    os.add_dll_directory(d)
import win32com.client
sh = win32com.client.Dispatch("WScript.Shell")
for lnk in [r"C:\Users\toshr\Desktop\THEOLOGICUS.lnk",
            r"C:\Users\toshr\AppData\Roaming\Microsoft\Windows\Start Menu\Programs\THEOLOGICUS\THEOLOGICUS.lnk"]:
    try:
        s = sh.CreateShortcut(lnk)
        print(lnk)
        print("   target :", s.TargetPath)
        print("   args   :", s.Arguments)
        print("   workdir:", s.WorkingDirectory)
    except Exception as e:
        print(lnk, "ERR", e)
