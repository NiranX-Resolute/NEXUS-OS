import socket
import subprocess

def check_port(port):
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(1.0)
        return s.connect_ex(("127.0.0.1", port)) == 0

print("Port 5173 (Command Center):", check_port(5173))
print("Port 8088 (Puter AI Hub):", check_port(8088))

# Check nexus-ai.exe in tasklist
res = subprocess.run(["tasklist", "/FI", "IMAGENAME eq nexus-ai.exe"], capture_output=True, text=True)
print("nexus-ai.exe in tasklist:")
print(res.stdout.strip())
