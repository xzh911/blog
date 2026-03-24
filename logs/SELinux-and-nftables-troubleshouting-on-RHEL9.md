---
title:  RHEL 9 上连续踩到 SELinux 和 nftables 的排障记录
description: RHEL 9 中 user_home_t 与 bin_t 标签差异、ssh_port_t 端口约束及 nftables 规则残留引发的连续排障
date: 2026-03-22
category: Network
---

# RHEL 9 上连续踩到 SELinux 和 nftables 的排障记录

## 背景

这次本来的目标很简单：在家里的 RHEL 9 主机上跑 `frpc`，把 SSH 稳定映射出去；顺手再把 SSH 端口从 22 改到 60022，减少默认暴露面。

结果实际折腾下来，前后踩了两个坑：

1. `frpc` 手工能跑，但做成 systemd 服务后直接报 `203/EXEC`
2. `sshd` 明明已经监听 60022，本机也能连，但局域网其它机器就是连不上

现在回头看，这两个问题其实很像：**服务配置本身并没有错，真正没同步处理的是 RHEL 9 上那层系统安全控制。**

---

## 现象

最开始是 `frpc.service` 启动失败，systemd 里能看到：

```text
xxx@HOST:/opt/tools/frp$ systemctl status frpc
× frpc.service - frpc
     Loaded: loaded (/etc/systemd/system/frpc.service; enabled; preset: disabled)
     Active: failed (Result: exit-code) since Sun 2026-03-22 14:57:34 CST; 2s ago
   Duration: 662us
    Process: 73247 ExecStart=/opt/tools/frp/frpc -c /opt/tools/frp/frpc.toml (code=exited, status=203/EXEC)
   Main PID: 73247 (code=exited, status=203/EXEC)

Mar 22 14:57:34 HOST systemd[1]: frpc.service: Main process exited, code=exited, status=203/EXEC
Mar 22 14:57:34 HOST systemd[1]: frpc.service: Failed with result 'exit-code'.
Mar 22 14:57:34 HOST systemd[1]: frpc.service: Start request repeated too quickly.
Mar 22 14:57:34 HOST systemd[1]: Failed to start frpc.
```

后面 SSH 那段的现象也很典型：

* `sshd` 已经改成 `60022`
* `sshd -t` 通过
* `ss -ltnp` 能看到它在监听
* 本机 `ssh -p 60022 localhost` 能进
* Windows 侧 `ping` 通，但 `Test-NetConnection ***.***.***.227 -Port 60022` 失败

也就是说，看上去服务已经好了，但从外面看端口还是“死”的。

---

## 排查过程

### 第一段：`frpc` 为什么手工能跑，systemd 却报 `203/EXEC`

一开始看到 `203/EXEC`，我先想到的不是 frp 配置，而是：**systemd 是不是连二进制本身都没真正执行起来。**

因为如果真是 `frpc.toml` 写错，通常至少会进入程序，再报配置解析或连接错误；但 `203/EXEC` 更像是执行阶段就被挡住了。

所以先不继续改 unit 文件，而是直接回到最原始的验证：**这个二进制自己到底能不能跑。**

```text
xxx@HOST:/opt/tools/frp$ ./frpc -v
0.67.0

xxx@HOST:/opt/tools/frp$ ./frpc -c ./frpc.toml
2026-03-22 15:01:40.676 [I] [sub/root.go:159] start frpc service for config file [./frpc.toml]
2026-03-22 15:01:40.676 [I] [client/service.go:335] try to connect to server...
2026-03-22 15:01:40.752 [I] [client/service.go:327] [99a978d5398ed8c1] login to server success, get run id [99a978d5398ed8c1]
2026-03-22 15:01:40.752 [I] [proxy/proxy_manager.go:180] [99a978d5398ed8c1] proxy added: [ssh-home]
2026-03-22 15:01:40.776 [I] [client/control.go:172] [99a978d5398ed8c1] [ssh-home] start proxy success
```

这一步非常关键。因为它一下子把问题范围缩小了很多：

* 二进制本身没坏
* 配置文件能正常读取
* 网络能连到服务端
* token、remotePort、frps 这些都不是主因

到这里，思路就很自然地收敛成一句话：

> **frp 本身没问题，问题出在 systemd 这一层的执行环境。**

接着我开始往 RHEL 体系的典型问题上想：既然是 systemd 启动失败，而手工执行正常，那很可能不是 chmod，而是 **SELinux 上下文**。

先看 SELinux 状态：

```text
xxx@HOST:/opt/tools/frp$ getenforce
Enforcing
```

再看文件标签：

```text
xxx@HOST:/opt/tools/frp$ ls -Z /opt/tools/frp/frpc
unconfined_u:object_r:user_home_t:s0 /opt/tools/frp/frpc
```

看到这里，方向就基本对了。

`/opt/tools/frp/frpc` 这个文件虽然已经有执行权限，但它的 label 是 `user_home_t`。
这类标签放在交互式 shell 下未必立刻出事，但放到 systemd 这种系统服务上下文里，就很容易触发执行限制。

换句话说，这次不是“frpc 不能跑”，而是：

> **systemd 不能把一个带 `user_home_t` 标签的第三方二进制，当作规范的系统服务去执行。**

既然已经定位到这里，后面的处理就不该继续在 `/opt/tools/frp/` 上硬扛了，而是按 Linux 上更规范的方式处理：把可执行文件放进标准路径，并恢复正确 label。

```text
xxx@HOST:/opt/tools/frp$ sudo install -m 755 /opt/tools/frp/frpc /usr/local/bin/frpc
xxx@HOST:/opt/tools/frp$ sudo restorecon -v /usr/local/bin/frpc
xxx@HOST:/opt/tools/frp$ ls -Z /usr/local/bin/frpc
system_u:object_r:bin_t:s0 /usr/local/bin/frpc
```

然后把 unit 里的 `ExecStart` 改到新路径，再重载和重启服务：

```text
xxx@HOST:/opt/tools/frp$ sudo systemctl daemon-reload
xxx@HOST:/opt/tools/frp$ sudo systemctl reset-failed frpc
xxx@HOST:/opt/tools/frp$ sudo systemctl restart frpc
xxx@HOST:/opt/tools/frp$ sudo systemctl status frpc
● frpc.service - frpc
     Loaded: loaded (/etc/systemd/system/frpc.service; enabled; preset: disabled)
     Active: active (running)

Mar 22 15:05:38 HOST systemd[1]: Started frpc.
Mar 22 15:05:38 HOST frpc[73759]: 2026-03-22 15:05:38.852 [I] [sub/root.go:159] start frpc service for config file [/opt/tools/frp/frpc.toml]
Mar 22 15:05:38 HOST frpc[73759]: 2026-03-22 15:05:38.921 [I] [client/service.go:327] [857aa3f3acf49a75] login to server success, get run id [857aa3f3acf49a75]
Mar 22 15:05:38 HOST frpc[73759]: 2026-03-22 15:05:38.921 [I] [proxy/proxy_manager.go:180] [857aa3f3acf49a75] proxy added: [ssh-home]
Mar 22 15:05:38 HOST frpc[73759]: 2026-03-22 15:05:38.943 [I] [client/control.go:172] [857aa3f3acf49a75] [ssh-home] start proxy success
```

到这里，第一段问题就闭环了：
**不是 frp 配错，也不是网络不通，而是 RHEL 9 上 systemd + SELinux 对可执行文件上下文有要求。**

---

### 第二段：SSH 改成 60022 后，为什么本机能进，别人还是连不上

`frpc` 处理完后，接着开始折腾 SSH 端口。
这段一开始的思路其实也很朴素：先确认 `sshd` 到底有没有真的把新端口监听起来。

所以先查配置，再查语法，再看监听状态：

```text
xxx@HOST:~$ sudo sshd -t
xxx@HOST:~$ sudo cat /etc/ssh/sshd_config | grep Port
Port 60022
#GatewayPorts no

xxx@HOST:~$ sudo systemctl reload sshd
xxx@HOST:~$ sudo systemctl restart sshd

xxx@HOST:~$ ss -ltnp | grep 22
LISTEN 0      128          0.0.0.0:60022      0.0.0.0:*
LISTEN 0      128             [::]:60022         [::]:*

xxx@HOST:~$ sudo systemctl status sshd --no-pager -l
● sshd.service - OpenSSH server daemon
     Loaded: loaded (/usr/lib/systemd/system/sshd.service; enabled; preset: enabled)
     Active: active (running) since Sun 2026-03-22 15:16:37 CST; 4min 4s ago

Mar 22 15:16:37 HOST sshd[74119]: Server listening on 0.0.0.0 port 60022.
Mar 22 15:16:37 HOST sshd[74119]: Server listening on :: port 60022.
```

做到这里，其实已经能排除很多最常见的错误了。
至少可以确定：

* `sshd_config` 已经改对
* 配置语法没问题
* 服务没挂
* 60022 确实在监听

接着我想到 RHEL 上改 SSH 端口有个老坑：**SELinux 不认新端口**。
所以继续查：

```text
xxx@HOST:~$ sudo firewall-cmd --list-all
FirewallD is not running

xxx@HOST:~$ getenforce
Enforcing

xxx@HOST:~$ sudo semanage port -l | grep ssh
ssh_port_t                     tcp      22
```

果然，一开始 `ssh_port_t` 里只有 22，没有 60022。
这个方向是对的，所以补进去：

```text
xxx@HOST:~$ sudo semanage port -a -t ssh_port_t -p tcp 60022
xxx@HOST:~$ sudo semanage port -l | grep ssh
ssh_port_t                     tcp      60022, 22
```

然后我做了这次排障里最有价值的一步：

```text
xxx@HOST:~$ ssh -p 60022 localhost
The authenticity of host '[localhost]:60022 ([::1]:60022)' can't be established.
ED25519 key fingerprint is SHA256:qKb9MD0IOH9mPCNw+Jh8pcOi7FZdXE1TzPDFg17znC0.
This host key is known by the following other names/addresses:
    ~/.ssh/known_hosts:1: ***.***.***.107
Are you sure you want to continue connecting (yes/no/[fingerprint])? yes
Warning: Permanently added '[localhost]:60022' (ED25519) to the list of known hosts.
Enter passphrase for key '~/.ssh/id_rsa':
```

本机一旦能这样进，含义就非常明确了：

* `sshd` 正常
* 60022 正常
* SELinux 至少已经不再阻止 sshd 使用这个端口
* SSH 协议本身没有问题

于是排障范围一下子就缩小成：

> **不是 sshd 自己的问题，而是外部到这台主机的 TCP 入口被某种规则挡住了。**

接着从内网 Windows 侧验证，也符合这个判断：

```text
PS C:\Users\xxx> ping ***.***.***.227

正在 Ping ***.***.***.227 具有 32 字节的数据:
来自 ***.***.***.227 的回复: 字节=32 时间<1ms TTL=64
来自 ***.***.***.227 的回复: 字节=32 时间<1ms TTL=64
```

```text
PS C:\Users\xxx> Test-NetConnection ***.***.***.227 -Port 60022
警告: TCP connect to (***.***.***.227 : 60022) failed

ComputerName           : ***.***.***.227
RemoteAddress          : ***.***.***.227
RemotePort             : 60022
InterfaceAlias         : 以太网
SourceAddress          : ***.***.***.117
PingSucceeded          : True
PingReplyDetails (RTT) : 1 ms
TcpTestSucceeded       : False
```

```text
PS C:\Users\xxx> ssh RHEL -vvv
OpenSSH_for_Windows_9.5p2, LibreSSL 3.8.2
debug1: Reading configuration data C:\\Users\\xxx/.ssh/config
debug1: C:\\Users\\xxx/.ssh/config line 18: Applying options for HOST
debug1: Connecting to ***.***.***.227 [***.***.***.227] port 60022.
```

这里的信号也很清楚：

* `ping` 通，说明主机在线、二层三层基本正常
* `TcpTestSucceeded : False`，说明问题还在 TCP 建连阶段
* `ssh -vvv` 卡在 `Connecting to ... port 60022`，说明根本还没进入 SSH 握手，更不是密钥问题

到这里，我一度还被两个现象误导过：

第一，`firewalld` 看起来没跑：

```text
xxx@HOST:~$ sudo firewall-cmd --list-all
FirewallD is not running
```

第二，`iptables -L` 看起来也很干净：

```text
xxx@HOST:/opt/tools/frp$ sudo iptables -L -n
Chain INPUT (policy ACCEPT)
target     prot opt source               destination

Chain FORWARD (policy ACCEPT)
target     prot opt source               destination

Chain OUTPUT (policy ACCEPT)
target     prot opt source               destination
```

如果停在这里，很容易以为“这机器没有防火墙”。
但这正是这次踩坑最有代表性的地方：**RHEL 9 上不能只看 `firewalld` 状态和 `iptables -L`。**

真正把问题钉死的是这条命令：

```text
xxx@HOST:/opt/tools/frp$ sudo nft list ruleset
table inet firewalld {
        chain filter_IN_public_allow {
                tcp dport 22 accept
                ip6 daddr fe80::/64 udp dport 546 accept
                tcp dport 9090 accept
        }
        ...
        reject with icmpx admin-prohibited
}
```

看到这里就彻底明白了。

虽然 `firewalld` 服务看起来没在跑，`iptables` 兼容层也看起来很空，但内核里真正生效的 `nftables` 规则还在，而且只放行了 `22/tcp` 和 `9090/tcp`。
换句话说，60022 并没有被允许，所以外部连过来的 TCP 包最后被 reject 掉了。

这也正好解释了前面的所有现象：

* 本机 `localhost:60022` 能进
* `sshd` 在监听
* `ssh_port_t` 已经补了
* Windows 侧 `ping` 通
* 但 TCP 端口就是不通

因为问题已经不在服务本身，而是在**主机入口规则**。

---

## 处理

这次真正的修复其实分成两部分。

### `frpc` 那部分

核心不是继续调 `frpc.toml`，而是把部署方式改规范：

* 二进制放进 `/usr/local/bin`
* 用 `restorecon` 把 label 修成 `bin_t`
* unit 文件指向标准路径
* 再交给 systemd 启动

### SSH 那部分

核心不是继续怀疑密钥，而是把“改了 SSH 端口”这件事同步到整个系统安全面：

* `sshd_config` 改端口
* `sshd -t` 检查语法
* `semanage port` 把 60022 加进 `ssh_port_t`
* 再检查真正生效的 `nftables` 规则
* 把 60022 放行

本质上，这两段其实是一个共同问题：
**服务配置变了，但对应的 SELinux / nftables 规则没有一起跟上。**

---

## 结论

这次最值得记住的，不是某条命令，而是两条更底层的经验。

### 1. 在 RHEL 9 上，查主机防火墙不能停在 `firewalld` 和 `iptables -L`

这次最容易误判的点就是：

* `FirewallD is not running`
* `iptables -L -n` 看起来全 ACCEPT

但真正生效的规则仍然可能在 `nftables` 里。
所以以后只要在 RHEL 8/9 上遇到“服务活着、端口却不通”的情况，`sudo nft list ruleset` 应该尽早看。

### 2. SELinux 不只是“端口能不能用”，还包括“这个文件能不能被当作系统服务执行”

这次我前后碰到的是 SELinux 的两个不同层面：

* `ssh_port_t`：决定 sshd 能不能合法使用 60022
* `user_home_t` / `bin_t`：决定 systemd 能不能规范地执行这个二进制

这两个坑表面不一样，但本质其实是一回事：
**RHEL 上很多“看起来权限没问题”的行为，真正决定成败的是 SELinux 上下文。**

---

## 这次留下的经验

以后再做这类部署，我会优先按下面的顺序想，而不是一上来就在配置文件里乱翻：

### 遇到 systemd `203/EXEC`

先手工跑二进制。
只要手工能跑，问题大概率就不在业务配置，而在执行环境、路径、label 或挂载属性。

### 遇到 SSH 改端口后连不上

先做本机自测：

```bash
ssh -p 60022 localhost
```

这一步非常值钱。
本机通，说明问题已经从“服务本身”收敛到了“外部路径 / 防火墙 / ACL”。

### 在 RHEL 9 上查网络过滤

不要只看：

```bash
firewall-cmd --list-all
iptables -L -n
```

要直接看：

```bash
sudo nft list ruleset
```

---

## 最后

这次排障表面上是两个问题：

* `frpc.service` 启动失败
* `sshd` 改端口后外部连不上

但把它们放在一起看，其实就是一句话：

> **在 RHEL 9 这类系统上，只改服务配置往往不够，必须同步检查 SELinux 和 nftables。**

否则就很容易出现一种很迷惑的状态：
服务明明“看起来已经好了”，但从系统视角看，它其实还没有被真正允许工作。
