import ctypes

user32 = ctypes.windll.user32
kernel32 = ctypes.windll.kernel32

h_winsta = user32.GetProcessWindowStation()
h_desk = user32.GetThreadDesktop(kernel32.GetCurrentThreadId())
name_buf = ctypes.create_unicode_buffer(256)
user32.GetUserObjectInformationW(h_winsta, 2, name_buf, 256, None)
print("Window Station:", name_buf.value)
user32.GetUserObjectInformationW(h_desk, 2, name_buf, 256, None)
print("Desktop:", name_buf.value)
