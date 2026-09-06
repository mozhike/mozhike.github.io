---
title: 让另一台电脑的内存为你所用：跨平台算力打通全记录
published: 2026-09-06
description: 主力机 8GB 内存跑不动几百 MB 的数据面板，隔壁闲置的 Windows 有 16GB。这篇记录把两台机器用 SSH 接起来的完整过程：方案怎么选、密钥为什么死活不认、普通权限写系统目录为什么会“假成功”，以及跨系统传命令和传代码时那些咬人的编码与转义坑。
tags: [技术备忘, 跨平台, SSH, Windows]
category: 技术备忘
draft: false
---

复盘文章写过“一台电脑不够用了”的故事版。这篇是同一件事的**技术版**：把过程和坑位展开到可以直接照着做、以后遇到能回来查的程度。不煽情，全是命令、原理和教训。

> 适用场景：主力机内存吃紧（跑几百 MB 的 pandas 面板就 OOM），旁边有一台内存更大的闲置机器（这里是 Windows），想让主力机上的编码助手直接把重活扔过去跑。

## 一、先想清楚：用哪种“远程执行”通道

要让另一台机器执行命令，常见候选有四种，先对比再动手：

| 方案 | 优点 | 缺点 | 结论 |
|---|---|---|---|
| 专用 Agent 远程节点（如 OpenClaw node） | 与编排系统一体、权限受控 | **只有编排方（agent）能调用**，终端里的编码助手没有这个工具；执行通道对第三方不开放 | 不够用 |
| 自建任务队列（监听目录 + 轮询执行） | 完全自主 | 要写常驻服务、处理并发与状态，重 | 杀鸡用牛刀 |
| 远程桌面 / 手动操作 | 直观 | 没法自动化、没法被程序调用 | 否 |
| **SSH** | 轻、通用、密钥免密、scp 传文件、任何 shell 都能用 | 需要在目标机开一个服务（一次性的） | ✅ **选它** |

判断标准很简单：**要长期、被程序自动调用、跨系统**，SSH 是性价比最高的公共协议。目标机装一次 OpenSSH Server，之后 `ssh` 和 `scp` 就是万能通道。

## 二、打通步骤（按顺序）

### 1. 目标机装 OpenSSH Server

Windows 10/11 自带 OpenSSH 客户端，但服务端是可选功能，管理员 PowerShell 一条命令：

```powershell
Add-WindowsCapability -Online -Name OpenSSH.Server~~~~0.0.1.0
Start-Service sshd
Set-Service -Name sshd -StartupType Automatic
```

装完一般会自动放行防火墙 22 端口；连不上再手动补：

```powershell
New-NetFirewallRule -Name sshd -DisplayName 'OpenSSH Server' -Enabled True -Direction Inbound -Protocol TCP -Action Allow -LocalPort 22
```

### 2. 发起方生成密钥、分发公钥

```bash
ssh-keygen -t ed25519          # 没有就生成（有则跳过）
```

公钥分发到目标机用户目录：

```bash
# 目标机是 Linux：
ssh-copy-id user@host
# 目标机是 Windows：把公钥内容追加到 C:\Users\<用户>\.ssh\authorized_keys
```

### 3. 配置别名，测试连通

`~/.ssh/config` 加一段，以后不用敲 IP：

```
Host win
    HostName 192.168.x.x
    User 你的用户名
    IdentityFile ~/.ssh/id_ed25519
    ServerAliveInterval 30
    ServerAliveCountMax 3
```

测试：

```bash
ssh win "echo OK && whoami && python --version"
```

## 三、坑位一：密钥死活不认 —— 管理员组成员是个隐藏陷阱

第一次连：`Permission denied (publickey)`。公钥明明放进去了、文件权限也干净，就是不认。查 sshd 日志、查 `authorized_keys` 内容、查 ACL——全对。

**根因在 sshd 配置的 Match 块**：

```
# C:\ProgramData\ssh\sshd_config 里的有效配置（默认模板里这段常被取消注释）
Match Group administrators
       AuthorizedKeysFile __PROGRAMDATA__/ssh/administrators_authorized_keys
```

Windows OpenSSH 有个微妙行为：**目标用户只要属于 Administrators 组——哪怕是 UAC 里“仅用于拒绝”的过滤组成员——`Match Group administrators` 就命中**，于是 sshd 只去 `C:\ProgramData\ssh\administrators_authorized_keys` 找密钥，你放在 `~/.ssh/authorized_keys` 的那份**根本不会被读**。

验证方法：`whoami /groups | findstr S-1-5-32-544`，看到 Administrators（哪怕标注“只用于拒绝的组”）就要走管理员密钥文件。

**解法**：把公钥写进管理员密钥文件，并设严格 ACL：

```powershell
$key = 'ssh-ed25519 AAAA...你的公钥...'
Set-Content -Path 'C:\ProgramData\ssh\administrators_authorized_keys' -Value $key -Encoding ascii
icacls 'C:\ProgramData\ssh\administrators_authorized_keys' /inheritance:r /grant "Administrators:F" /grant "SYSTEM:F"
```

注意：这两条**必须真管理员执行**（见下一个坑）。`~/.ssh/authorized_keys` 那份留着也无害——哪天 Match 块被注释掉就能用上。

## 四、坑位二：普通权限写系统目录会“假成功”

在打通过程中发现：用普通权限进程往 `C:\ProgramData\ssh\` 写这个密钥文件，PowerShell 返回成功（脚本进了成功分支、打印了 `WRITE_OK`），**但文件根本没落盘**——真实路径不存在，连 UAC 虚拟化的 VirtualStore 里也没有。

这是最阴的一种失败：**不报错、不落盘、无痕迹**。如果没发现，会带着“密钥已放好”的错误前提排查半天。

教训两条：
1. 写系统保护目录（ProgramData / Program Files）**永远以管理员身份执行**，别用普通权限进程“试试”；
2. 脚本里判断成功不能只看有没有抛异常——PowerShell 的非终止错误默认不触发 try/catch，**写完要回读验证**（`Test-Path` + 读内容比对）。

## 五、坑位三：跨系统远程执行，命令在传输中“变形”

这是跨平台远程执行最大的摩擦面。同一个命令字符串，从 Linux 的 shell 出发，经过执行通道，落到 Windows 的 PowerShell——中间每一层都在改写它：

**1. `$` 变量被吞**
PowerShell 变量 `$os` 传给远程执行时，如果命令串先经 bash 展开，`$os` 变成空字符串，命令变成残缺品：

```bash
# 坏：$os 被本地 bash 吃掉
powershell -Command "Write-Output $os.Caption"
# 输出一团乱码或直接语法错
```

**2. 引号被剥离**
`-Command "..."` 里的双引号在传输层可能被剥掉，PowerShell 收到的是被空格拆散的一堆参数，于是打印帮助页而不是执行。

**3. 分号断命令**
用 `;` 连接多条远程命令，某条通道会把分号后的内容当成上一条的参数，导致“第二条命令的报错全算在第一条头上”的诡异现象。

**4. 中文在链路里损坏**
heredoc 或命令行里带中文注释，经过多跳编码转换后变成乱码，甚至破坏 base64 串导致解码失败。

**通用解法：base64 编码命令，绕开一切转义层**

```bash
# 本地把 PowerShell 脚本编码成 UTF-16LE 的 base64（PowerShell 专用格式）
python3 -c "
import base64, sys
ps = open('script.ps1', encoding='utf-8').read()
print(base64.b64encode(ps.encode('utf-16-le')).decode())
"
# 远程执行：一串纯 ASCII，没有引号、没有 $、没有分号问题
ssh win "powershell -NoProfile -EncodedCommand <上面输出的base64>"
```

要点：PowerShell 的 `-EncodedCommand` 吃的是 **UTF-16LE** base64（不是 UTF-8）；用 python 生成后先解码自检一次再发。脚本内容也尽量**全 ASCII**——跨系统链路对非 ASCII 字符最不稳，中文注释写本地副本，远程脚本用英文。

更进一步的纪律：**复杂逻辑别硬塞一行命令**。把脚本写成 `.ps1` / `.py` 文件，传过去再执行：

```bash
scp script.ps1 win:F:/work/
ssh win "powershell -NoProfile -ExecutionPolicy Bypass -File F:/work/script.ps1"
```

一行命令适合“探测”，文件适合“干活”。

## 六、跨系统“代码互传识别”速查

两台系统间传代码/文本/数据，按这个清单检查，能躲开 90% 的坑：

| 项目 | Linux → Windows 注意 |
|---|---|
| 编码 | 文件内容 UTF-8 没问题（现代 Windows 工具都认）；**命令行参数/base64** 另算——PowerShell EncodedCommand 必须 UTF-16LE |
| 引号 | 双引号里的 `$` 会被 bash 展开；单引号包整体可保字面；嵌套引号最易碎，能用 base64 就别用引号 |
| 换行符 | 脚本文件 LF/CRLF 通常都能跑；但 `.bat`/`.cmd` 对 CRLF 敏感，PowerShell 无所谓 |
| 路径 | 反斜杠在 bash 字符串里是转义符，写 `C:\\path` 或单引号 `'C:\path'`；scp 远程路径用 `win:F:/work/` 正斜杠形式最稳 |
| 管道/重定向 | `|` `>` `2>&1` 在远程 Windows 命令里可能被本地 shell 先吃掉——整条命令进 base64 或文件 |
| 中文 | 链路非 ASCII 不稳：heredoc 中文会损坏 base64；远程脚本全 ASCII，中文只留本地 |
| 大小写 | Windows 文件系统不区分，但 SSH 配置/命令里保持小写省心 |
| 权限语义 | Windows 的“写成功”不等于“真落盘”（见坑位二）——写完回读验证 |

## 七、收尾：落地配置与权限边界

打通后做三件事，让这个通道长期可用且不失控：

1. **别名进 config**：`ssh win` 一个词搞定，宁记 IP；
2. **约定工作目录**：在目标机建专用目录（如 `F:\work`），所有远程任务的数据和产物只放这里——**目标机上的私人目录（用户 profile、其他应用的数据）一律不许碰**，这条要写进协作规矩，对能自主执行命令的助手尤其重要；
3. **验证链路**：`ssh win "python -c 'import pandas; print(pandas.__version__)'"`——先确认目标机环境（Python 版本、依赖）再跑大任务，别传过去才发现版本不对。

## 八、沉淀：下次照着做的检查清单

- [ ] 目标用户是不是管理员组成员？（`whoami /groups`）→ 是则密钥走 `administrators_authorized_keys`
- [ ] 密钥文件 ACL：`/inheritance:r` + 仅 Administrators/SYSTEM/本人
- [ ] 写系统目录的操作，确认在**真管理员**上下文执行，写完回读验证
- [ ] 远程命令带引号/变量/中文？→ 一律 base64（PowerShell 用 UTF-16LE）或写成文件传过去
- [ ] 探测用小命令，干活用文件；脚本全 ASCII
- [ ] 远程环境先验证（版本/依赖）再跑全量
- [ ] 约定工作目录 + 边界规矩，写进协作文档

打通一次，后续所有“另一台机器”的接入都复用这套：装服务 → 分密钥（注意管理员组）→ 别名 → 小命令探测 → 文件式干活。踩过的坑都在这了，下次十分钟。
