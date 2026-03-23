---
title: Kubernetes 集群排障
description: 一次从症状到定位再到修复的 Kubernetes 故障排查记录。
---

# Kubernetes 集群排障

Kubernetes 的排障过程很像拼图。单看某一层信息往往不够，必须把 Pod、节点、镜像、网络和控制面状态放在一起看，才能判断问题到底卡在哪。

## 背景

这次遇到的情况是，应用 Pod 能创建，但状态一直不稳定，部分服务启动后马上重启，另一些服务则表现为访问超时。表面上看起来是“应用挂了”，但实际原因往往可能是：

- 镜像拉取失败
- 探针配置不合理
- 节点资源不足
- 配置挂载错误
- 网络策略或服务发现异常

因此排查时不能先入为主，最好从集群状态和事件开始。

## 第一轮观察

先看命名空间、Pod 和事件：

```bash
kubectl get ns
kubectl get pods -A -o wide
kubectl get events -A --sort-by=.metadata.creationTimestamp
```

如果某个 Pod 一直在重启，进一步看描述：

```bash
kubectl describe pod <pod-name> -n <namespace>
kubectl logs <pod-name> -n <namespace>
kubectl logs <pod-name> -n <namespace> --previous
```

这一步通常能直接看出大方向：

- 是启动失败，还是运行后崩溃
- 是配置问题，还是依赖问题
- 是健康检查过于激进，还是应用确实没起来

## 节点层检查

如果多个 Pod 同时异常，问题就不应该只盯着应用了，节点层也要一起看：

```bash
kubectl get nodes
kubectl describe node <node-name>
kubectl top nodes
kubectl top pods -A
```

要特别留意：

- 节点是否 `NotReady`
- 是否存在磁盘压力或内存压力
- 是否调度到了异常节点
- 是否 CPU 或内存资源超卖

在很多场景里，Pod 表现出来的“异常”其实只是节点状态不稳定的外显结果。

## 探针和资源

排障时一个特别容易忽略的地方是探针。很多服务本身还没完全启动，liveness probe 就已经开始判断失败，结果不断被重启。

常见检查点包括：

- `initialDelaySeconds` 是否太短
- `timeoutSeconds` 是否太小
- `failureThreshold` 是否过低
- `readinessProbe` 和 `livenessProbe` 是否配置一致
- 资源请求和限制是否和实际负载匹配

如果服务启动时间本来就长，就不要把探针配得过于激进，否则“健康检查”反而成了故障来源。

## 网络和服务发现

当 Pod 本身是正常的，但服务访问失败，就要看 Service、Endpoint 和 DNS：

```bash
kubectl get svc -A
kubectl get endpoints -A
kubectl get ingress -A
kubectl exec -it <pod-name> -n <namespace> -- nslookup kubernetes.default
```

如果入口走 Ingress，还需要继续确认：

- Ingress Controller 是否正常
- 路由规则是否匹配
- 后端 Service 是否有 Endpoints
- 证书和域名是否一致

## 修复思路

这次处理的原则是：

1. 先减小不确定性
2. 再逐层验证
3. 最后做一次单点回归

例如先暂时放宽探针，再确认镜像和配置正常，最后再把探针调回合理值。这样比一开始就大范围改动更稳妥。

## 复盘

Kubernetes 的排障价值在于，它强迫我们把“应用问题”和“基础设施问题”分开看。很多时候，Pod 报错只是表象，真正问题可能出在节点、网络、卷、配置或者入口层。

这类日志写完以后，最值得留下的是排查路径，而不是某一次错误文本。因为未来真正有用的，是下一次出问题时可以沿着同样的路径更快定位。
