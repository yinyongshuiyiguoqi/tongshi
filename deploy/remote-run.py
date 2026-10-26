"""在服务器上跑一条命令，方便排查。密码或私钥都行。

    uv run --with paramiko python deploy/remote-run.py <IP> <密码|私钥路径> "命令"
"""

import os
import sys

import paramiko

host, cred, cmd = sys.argv[1], sys.argv[2], sys.argv[3]

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
kwargs = dict(hostname=host, port=22, username="root", timeout=25, banner_timeout=25, auth_timeout=25)
if os.path.exists(cred):
    kwargs.update(key_filename=cred, look_for_keys=False, allow_agent=False)
else:
    kwargs["password"] = cred
client.connect(**kwargs)

_, out, err = client.exec_command(cmd, timeout=120)
o = out.read().decode("utf-8", "replace")
e = err.read().decode("utf-8", "replace")
if o.strip():
    print(o.rstrip())
if e.strip():
    print("[stderr]", e.rstrip())
client.close()
