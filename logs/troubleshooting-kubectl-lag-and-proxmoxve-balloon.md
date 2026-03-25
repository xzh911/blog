---
title: 一次把 kubectl / Tab 补全卡顿定位到 PVE balloon + RHEL 9 crashkernel 的排障记录
description: 这不是一次 Kubernetes 控制面故障，而是一次典型的虚拟机可用内存被压垮后，表现成 kubectl、helm 和 Tab 补全异常卡顿的排障过程。
date: 2026-03-25
category: Kubernetes
tags:
  - Kubernetes
  - RHEL
  - Proxmox
  - Troubleshooting
---

# 一次把 `kubectl` / Tab 补全卡顿定位到 PVE balloon + RHEL 9 crashkernel 的排障记录

## 背景

这台机器是跑在 Proxmox VE 上的 RHEL 9 Kubernetes 管理机，平时主要装 `kubectl`、`helm`，通过 kubeconfig 访问家里的 HA 集群。前面的安装和连通性问题其实已经处理完了，`kubectl get nodes`、`helm list -A` 都能正常返回，看上去环境已经能用了。

但接着又冒出来一个更奇怪的问题：**`kubectl` 明显偏慢，`k get p<Tab>` 这种补全尤其卡，甚至会有几秒“像冻住一样”的感觉。**

一开始我怀疑的方向很常规：是不是 API VIP 慢、HAProxy 慢、DNS 慢、apiserver 慢，或者 etcd 有抖动。可这次真正的根因并不在 Kubernetes API，而是在 guest 自己的 usable RAM 已经被压到非常低，最后才通过 `kubectl` 和 bash 补全把问题放大出来。

## 第一步：先确认是不是网络链路慢

最先做的不是猜，而是直接测。同样访问 `/version`，`curl -k` 很快，但 `kubectl get --raw /version` 却慢很多，这就已经不太像 VIP、LB 或 DNS 问题了。

```bash
xxx@RHEL:~$ time curl -k -s -o /dev/null https://192.168.1.80:6443/version

real    0m0.044s
user    0m0.007s
sys     0m0.008s
xxx@RHEL:~$
xxx@RHEL:~$ time curl -k -s -o /dev/null https://k8s-lb.home.arpa:6443/version

real    0m0.041s
user    0m0.006s
sys     0m0.008s
xxx@RHEL:~$ time kubectl get --raw /version >/dev/null

real    0m1.385s
user    0m0.064s
sys     0m0.372s
```

这里很关键：如果链路本身真慢，`curl` 不会只有 40ms 左右。也就是说，**网络访问 API 的基础路径基本正常，慢更像是发生在 `kubectl` 进程自己身上。**

## 第二步：用 `kubectl --v=8` 把服务端和客户端拆开

既然 `curl` 很快，那下一步就要确认 apiserver 自己到底慢不慢。最直接的方法就是开高一点的 verbose，把请求和响应时间拆出来看。

```bash
xxx@RHEL:~$ time kubectl get --v=8 ns >/dev/null
I0325 16:37:35.070880   56061 cmd.go:527] kubectl command headers turned on
I0325 16:37:35.273194   56061 loader.go:402] Config loaded from file:  /home/xxx/.kube/config
I0325 16:37:35.351077   56061 envvar.go:172] "Feature gate default state" feature="ClientsAllowCBOR" enabled=false
I0325 16:37:35.359306   56061 envvar.go:172] "Feature gate default state" feature="ClientsPreferCBOR" enabled=false
I0325 16:37:35.359337   56061 envvar.go:172] "Feature gate default state" feature="InOrderInformers" enabled=true
I0325 16:37:35.359343   56061 envvar.go:172] "Feature gate default state" feature="InformerResourceVersion" enabled=false
I0325 16:37:35.359347   56061 envvar.go:172] "Feature gate default state" feature="WatchListClient" enabled=false
I0325 16:37:35.612834   56061 helper.go:113] "Request Body" body=""
I0325 16:37:35.662392   56061 round_trippers.go:527] "Request" verb="GET" url="https://k8s-lb.home.arpa:6443/api/v1/namespaces?limit=500" headers=<
        Accept: application/json;as=Table;v=v1;g=meta.k8s.io,application/json;as=Table;v=v1beta1;g=meta.k8s.io,application/json
        User-Agent: kubectl/v1.34.6 (linux/amd64) kubernetes/8b2bf66
 >
I0325 16:37:35.807731   56061 round_trippers.go:632] "Response" status="200 OK" headers=<
        Audit-Id: d85c7172-649c-490b-8e80-bae4b7ecb1cd
        Cache-Control: no-cache, private
        Content-Type: application/json
        Date: Wed, 25 Mar 2026 08:37:35 GMT
        X-Kubernetes-Pf-Flowschema-Uid: 470241f0-bfcb-4938-aa82-9a5810a40601
        X-Kubernetes-Pf-Prioritylevel-Uid: 52237cf0-99cf-419f-bed0-05fe08b9bd40
 > milliseconds=126
```

这一步几乎直接把方向扳正了：**真实 HTTP 请求只花了 126ms，但整条命令体感是秒级的。**  
所以慢的不是 apiserver 响应，而是 `kubectl` 客户端本地执行阶段。

我当时也顺手看了一轮 etcd，但没看到 leader 抖动、fsync timeout、apply 很慢这类典型异常，所以 control plane 不是主因。

## 第三步：看 `kubectl` 进程到底在等什么

既然怀疑是本地执行慢，就直接看 syscall。这里最有价值的地方在于：如果真是网络问题，通常会在 `connect`、`read`、`recv` 之类的调用上看到明显耗时；但这次并不是。

```bash
xxx@RHEL:~$ strace -c -f kubectl get --raw /version >/dev/null
strace: Process 56418 attached
strace: Process 56419 attached
strace: Process 56420 attached
strace: Process 56421 attached
% time     seconds  usecs/call     calls    errors syscall
------ ----------- ----------- --------- --------- ------------------
 65.99    0.977830        1298       753       147 futex
 29.89    0.442864         920       481           nanosleep
  3.71    0.054929         343       160           epoll_pwait
  0.09    0.001359          11       118           tgkill
  0.09    0.001298           4       261           sched_yield
  0.04    0.000554           4       118         1 rt_sigreturn
  0.04    0.000539           4       122           getpid
  0.02    0.000350          25        14         3 openat
  0.02    0.000345          57         6           write
  0.02    0.000278          15        18         2 read
  0.02    0.000259          25        10           sigaltstack
  0.01    0.000197           5        34           mmap
  0.01    0.000141          35         4           newfstatat
  0.01    0.000122           6        18           getdents64
  0.01    0.000119          29         4           clone
  0.01    0.000095          95         1         1 connect
  0.01    0.000084           0       114           rt_sigaction
  0.01    0.000082           3        26           fcntl
  0.01    0.000078          11         7           getrandom
  0.00    0.000060           4        14           rt_sigprocmask
  0.00    0.000059           6         9           gettid
  0.00    0.000054           6         8           pread64
  0.00    0.000034           3        11           close
  0.00    0.000023           3         7         5 epoll_ctl
  0.00    0.000021          21         1           socket
  0.00    0.000021          21         1           readlinkat
  0.00    0.000017           8         2           uname
  0.00    0.000013           3         4           fstat
  0.00    0.000013           2         5           setsockopt
  0.00    0.000013           6         2           prlimit64
  0.00    0.000008           4         2           ioctl
  0.00    0.000007           3         2           madvise
  0.00    0.000006           6         1           epoll_create1
  0.00    0.000005           2         2           statfs
  0.00    0.000005           5         1           eventfd2
  0.00    0.000004           4         1           getsockopt
  0.00    0.000003           3         1           getsockname
  0.00    0.000003           3         1           getpeername
  0.00    0.000000           0         1           execve
  0.00    0.000000           0         1           arch_prctl
  0.00    0.000000           0         1           sched_getaffinity
------ ----------- ----------- --------- --------- ------------------
100.00    1.481892         631      2347       159 total
```

这组输出说明，时间主要耗在 `futex`、`nanosleep`、`epoll_pwait` 这种等待和调度相关的地方，而不是明显的网络 syscall。换句话说，**它更像“本机跑得很吃力”，而不是“对端回得很慢”。**

## 第四步：真正的转折点——guest 内存已经低到不正常

到这里，我开始把注意力转到这台 RHEL guest 自己的资源状态上，结果一看就坐实了：不是 `kubectl` 有问题，而是内存直接低到了一个异常的程度！

```bash
xxx@RHEL:~$ free -h
               total        used        free      shared  buff/cache   available
Mem:           224Mi       202Mi        68Mi       0.0Ki        45Mi        22Mi
Swap:          3.9Gi       157Mi       3.8Gi
xxx@RHEL:~$ vmstat 1 5
procs -----------memory---------- ---swap-- -----io---- -system-- ------cpu-----
 r  b   swpd   free   buff  cache   si   so    bi    bo   in   cs us sy id wa st
 4  0 160512  64772      0  52020   53   40  2170    49   79  101  0  0 100  0  0
 0  0 160512  64772      0  52040    0    0     0     0   84  105  0  0 100  0  0
 0  0 160512  64520      0  52040   12    0    12     0   88  113  0  0 100  0  0
 0  0 160512  64520      0  52040    0    0     0     0   91  107  0  0 100  0  0
 0  0 158720  75608      0  32728 9712  576 16336   630 2521 3973  1  1 93  6  0
```

这已经不是“有点紧”，而是非常离谱了：

- `MemTotal` 量级只剩 224MiB
- `available` 只剩 22MiB
- swap 已经在用
- `vmstat` 里能看到换页痕迹

所以此时问题被重新定义为：

> **为什么这台 VM 明明在 PVE 里的Minium memory为512MiB ，guest 里却只剩 224MiB 可用内存？**

## 第五步：继续追根，搞清楚这 224MiB 是怎么来的

接下来看的就是几个最关键的内存信息源：`/proc/meminfo`、启动参数、`kexec_crash_size` 和硬件层可见内存。

```bash
xxx@RHEL:~$ grep MemTotal /proc/meminfo
MemTotal: 230220 kB
xxx@RHEL:~$ cat /proc/cmdline
BOOT_IMAGE=(hd0,gpt2)/vmlinuz-5.14.0-570.55.1.el9_6.x86_64 root=/dev/mapper/rhel-root ro crashkernel=1G-4G:192M,4G-64G:256M,64G-:512M resume=/dev/mapper/rhel-swap rd.lvm.lv=rhel/root rd.lvm.lv=rhel/swap rhgb quiet
xxx@RHEL:~$ cat /sys/kernel/kexec_crash_size
201326592
xxx@RHEL:~$ sudo lshw -class memory
  *-memory
       description: System Memory
       physical id: 1000
       size: 1300MiB
       capacity: 1300MiB
```

这几条一拼起来，链路就开始清楚了：

1. 这台 VM 的配置内存不是 224MiB，而是大约 `1300MiB`
2. guest 里实际 `MemTotal` 却只有 `230220 kB`
3. RHEL 9 启动参数里带着 `crashkernel=1G-4G:192M`
4. `/sys/kernel/kexec_crash_size` 也验证了确实预留了 192MiB

也就是说，**guest 里看到的 `MemTotal` 本来就不是“虚拟机配置内存”，而是扣掉保留区和内核占用之后的 usable RAM。**  
而 RHEL 9 默认的 `crashkernel=192M`，对这种本来就不大的管理机来说，已经不是小数目了。

## 第六步：再看启动日志，证明系统在很早期就已经内存告急

到这里还差最后一块拼图：到底只是用户态后来慢慢变卡，还是系统从一开机就已经很紧。答案在 `dmesg` 里很直接。

```bash
xxx@RHEL:~$ dmesg | grep -i -E 'Memory:|mem='
[ 0.016198] Memory: 245116K/1309800K available (16384K kernel code, 5766K rwdata, 13628K rodata, 4044K init, 7384K bss, 363088K reserved, 0K cma-reserved)
[ 6.832029] Out of memory: Killed process 931 (firewalld) total-vm:128324kB, anon-rss:120kB, file-rss:128kB, shmem-rss:0kB, UID:0 pgtables:148kB oom_score_adj:0
[ 6.890972] Out of memory: Killed process 1825 (kexec) total-vm:18520kB, anon-rss:140kB, file-rss:128kB, shmem-rss:0kB, UID:0 pgtables:84kB oom_score_adj:0
```

这组日志的信息量很大：

- 硬件层可见量级接近 `1309800K`
- 但真正 available 只有 `245116K`
- 还有 `363088K reserved`
- 启动早期就已经发生 OOM，连 `firewalld` 和 `kexec` 都被杀了

到这里，整个判断就闭环了。更稳妥的表述不是把 `crashkernel=192M` 和 `363088K reserved` 简单机械相加，而是这样理解：

- **PVE 开了 ballooning，guest 在线内存被压低**
- **RHEL 9 默认 `crashkernel=192M` 又切走一块**
- **Linux 的 `MemTotal` 还要再扣 reserved bits、kernel code 等保留区**
- 所以 guest 最终只剩两百多 MiB usable RAM，并进一步触发 swap 和 OOM

这也解释了一个很容易误解的点：**PVE 的 Minimum Memory，不等于 guest 里 `free -h` 看到的 `MemTotal` 下限。**  
前者更偏虚拟机管理层的在线内存约束；后者是 Linux 内核视角下，扣完保留区以后真正能给系统用的可用物理内存。

## 第七步：处理方式其实很直接

定位到这里以后，修复反而简单了：**把 VM 内存调大，关闭 balloon / 动态内存气球，然后重启 guest。**

```bash
xxx@RHEL:~$ free -h
               total        used        free      shared  buff/cache   available
Mem:           1.2Gi       472Mi       578Mi       4.0Mi       309Mi       738Mi
Swap:          3.9Gi          0B       3.9Gi
```

这一步是最直接的验证：

- `MemTotal` 回到正常量级
- `available` 恢复到 738Mi
- swap 不再被动使用
- `kubectl`、`helm`、Tab 补全一起恢复正常

## 结论

这次不是 `kubectl` 自己有病，也不是 Kubernetes API 真慢，而是一次很典型、也很容易误判的虚拟机内存问题。真正的链条是：

- PVE 开了 ballooning
- guest 在线内存被压低
- RHEL 9 默认 `crashkernel=192M` 再占一块
- Linux `MemTotal` 继续扣掉 reserved / kernel code
- guest usable RAM 最终只剩两百多 MiB
- `kubectl` 这种 Go 二进制在启动、读 kubeconfig、做 discovery、跑补全时被成倍放大，最终表现成“命令能跑，但非常卡”

## 这次排障最值得记住的几点

1. 看到 `kubectl` 慢，先拆层：网络、apiserver、客户端本地执行，不要一上来就盯着控制面。
2. `kubectl --v=8` 很有用，它能很快把“请求慢”还是“本地慢”分开。
3. 在虚拟机里看内存，必须分清配置内存、balloon 后在线内存、`MemTotal` 和 `available`，它们不是一回事。
4. 小内存 RHEL 上，默认 `crashkernel` 绝对不是可以忽略的零头。
5. 管理机别省到极限，尤其不要在小内存场景里再叠加 ballooning。
