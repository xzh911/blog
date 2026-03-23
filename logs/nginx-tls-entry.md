---
title: Nginx 与 TLS 入口整理
description: 把反向代理、证书和站点入口收束到一个可维护模板中。
---

# Nginx 与 TLS 入口整理

这篇日志记录的是把服务对外入口统一整理的过程。很多站点一开始只是“能访问就行”，但时间长了以后，域名、证书、路径跳转和反向代理规则会慢慢变得混乱。入口层一旦混乱，后面每次改动都会很费力。

## 背景

入口层的典型问题通常有这些：

- HTTP 和 HTTPS 配置不一致
- 证书更新方式不统一
- 路由规则分散在多个文件
- 反向代理头部配置缺失
- 日志定位困难

整理入口层的目标不是单纯加一层 Nginx，而是让站点对外行为稳定、明确、容易回看。

## 入口模板

一个清晰的 Nginx 入口通常会把这几个动作写明白：

```nginx
server {
  listen 80;
  server_name docs.example.com;
  return 301 https://$host$request_uri;
}

server {
  listen 443 ssl http2;
  server_name docs.example.com;

  ssl_certificate     /etc/nginx/certs/fullchain.pem;
  ssl_certificate_key /etc/nginx/certs/privkey.pem;

  location / {
    proxy_pass http://web:4173;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

这类配置的关键不在“参数很多”，而在“行为清楚”：

- 80 端口统一跳转到 HTTPS
- 证书路径固定
- 反向代理头部完整
- 后端服务名稳定

## TLS 证书

证书相关问题通常不是部署时才出现，而是在续期、重载和路径更新时才暴露。为了减少风险，建议把证书文件放在稳定目录，并明确记录：

- 证书来源
- 续期方式
- 重载命令
- 证书过期检查方式

如果是自动化管理，最重要的是保留“续期后如何验证”的步骤。很多系统证书本身已经更新了，但 Nginx 没有 reload，结果外部看到的还是旧证书。

## 常见验证

整理入口后，至少应该确认：

```bash
nginx -t
systemctl reload nginx
curl -I http://docs.example.com
curl -Ik https://docs.example.com
```

还可以顺手检查：

- 是否正确返回跳转状态码
- 是否存在证书链问题
- 是否有混合内容或静态资源引用错误
- 访问日志里是否出现异常 4xx、5xx

## 排障顺序

当入口层出问题时，建议按这个顺序查：

1. Nginx 配置语法是否正确
2. 证书文件是否存在
3. 后端服务是否可达
4. 域名解析是否正确
5. 防火墙和安全组是否放行

这个顺序能尽量把问题缩小在入口层本身，而不是一上来就怀疑应用。

## 复盘

入口层整理完以后，最大的收益是心智负担变小了。以后再加新站点时，只要复制这个模板，改域名、证书和后端地址，基本就能快速落地。

对于长期维护来说，稳定比复杂更重要。Nginx 这一层只要结构清楚，整个站点就会好维护很多。
