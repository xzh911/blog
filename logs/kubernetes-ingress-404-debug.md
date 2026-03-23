---
title: Ingress 404 排查记录
description: 一次 Ingress 访问返回 404 的完整定位过程。
---

# Ingress 404 排查记录

Kubernetes 里最让人困惑的故障之一，就是入口已经通了，但访问返回 404。Pod 明明在跑，Service 也存在，Ingress 规则看起来也写了，但外部一请求就是找不到路径。这个问题表面轻，实际上经常是路径、后端服务、控制器和规则匹配的某一层出了偏差。

## 现象

最开始的症状很简单：域名能解析，TLS 证书也正常，Nginx Ingress Controller 没有明显报错，但某些路径始终返回 404。

这种问题最容易让人误判为“后端服务挂了”，但实际上更常见的是：

- 路径匹配规则不对
- Service 端口和后端容器端口不一致
- Ingress 注解或 rewrite 规则写错
- 控制器没有接管对应 Ingress
- 请求路径和应用路由前缀不一致

## 第一轮检查

先看 Ingress 和 Service：

```bash
kubectl get ingress -A
kubectl describe ingress <name> -n <namespace>
kubectl get svc -n <namespace>
kubectl get endpoints -n <namespace>
```

如果 Endpoints 为空，问题就不在 Ingress，而在 Service 选择器或者 Pod 标签。如果 Endpoints 正常，但入口还是 404，就说明请求没有命中正确的规则。

## 路径匹配

很多 404 都出在路径匹配上。最常见的几种情况是：

### 1. 前缀不匹配

Ingress 按 `/app` 配，应用却只认 `/`，结果请求进来了，但后端路由找不到。

### 2. rewrite 规则不正确

有些应用部署在子路径下，需要把路径重写成根路径，否则前端资源和接口路径都会错位。

### 3. exact 和 prefix 混用

`Exact` 与 `Prefix` 的语义不同，写错后很容易出现看似“规则存在”，实际上永远命不中的情况。

检查时可以顺手看 Ingress 定义：

```bash
kubectl get ingress <name> -n <namespace> -o yaml
```

## 控制器层

如果规则本身没明显错误，再看 Ingress Controller 是否真的接管了这条规则。重点是看：

- Controller Pod 是否健康
- 对应类名是否正确
- 注解是否被识别
- 日志里是否有规则同步信息

```bash
kubectl logs -n ingress-nginx deploy/ingress-nginx-controller
```

在日志里，经常能看到类似“同步成功但未命中”或者“后端服务端口不存在”的线索。比起反复改 YAML，这时候读日志通常更快。

## 后端验证

为了确认问题是否在入口层，可以直接从集群内部访问后端服务：

```bash
kubectl run tmp-shell --rm -it --image=curlimages/curl -- sh
curl -I http://<service-name>.<namespace>.svc.cluster.local:<port>/
```

如果集群内直连后端是正常的，那入口层问题的概率就很高。如果后端本身也返回 404，就说明问题在应用路由，而不在 Ingress。

## 修复过程

这次的处理思路是先缩小变量范围，再一点点改：

1. 先把后端路径和应用实际路由对齐
2. 再检查 Service 端口和 selector
3. 再看 Ingress path 和 rewrite 规则
4. 最后验证控制器是否同步成功

有时候只是少写了一个路径前缀，或者 Service 端口指错了，看起来很小，但在 Kubernetes 里会表现成“入口全坏了”。

## 验证

修复后建议从多个维度确认：

- 浏览器访问是否正常
- `curl -I` 是否返回预期状态码
- Ingress Controller 日志是否干净
- 后端 Pod 是否没有新的错误日志

```bash
curl -I https://docs.example.com/app/
```

如果前端资源走静态路径，还要检查页面是否出现资源 404。很多入口层问题在首页看不出来，得打开浏览器控制台才会暴露。

## 复盘

Ingress 404 的经验是，入口层问题经常不像故障，更像“配置没对齐”。真正能减少这类问题的，不是临时记住某条规则，而是把以下信息固定下来：

- 应用实际路由前缀
- Service 端口和目标端口
- Ingress path 和 rewrite 约定
- Controller 的版本和注解支持情况

这些信息一旦标准化，后续新服务接入时就不会反复踩同样的坑。
