import ctypes
import ctypes.wintypes as wt

user32 = ctypes.windll.user32
kernel32 = ctypes.windll.kernel32

count = 0
def cb(hwnd, extra):
    global count
    count += 1
    title = ctypes.create_unicode_buffer(512)
    user32.GetWindowTextW(hwnd, title, 512)
    if title.value:
        print(f"[{count}] HWND: {hwnd} | Title: {title.value}")
    return 1

WNDENUMPROC = ctypes.WINFUNCTYPE(ctypes.c_int, ctypes.c_void_p, ctypes.c_void_p)
cb_func = WNDENUMPROC(cb)
ret = user32.EnumWindows(cb_func, 0)
print(f"Total evaluated: {count}, ret: {ret}, err: {kernel32.GetLastError()}")
