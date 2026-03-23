---
title: 技术日志总览
description: DevOps / Linux / Kubernetes 的连续记录页，按主题沉淀可复用的运维笔记。
---

<script setup>
import { data as logs } from '../.vitepress/theme/logs.data.mjs'
</script>

# 技术日志总览

<Badge type="tip" text="Long-form Logs" /> <Badge type="info" text="Production Notes" /> <Badge type="warning" text="Debug Archive" />

这里不是零散笔记堆放区，而是按主题整理过的工作日志。每一篇都尽量保留实际环境中的背景、动作和结果，方便后续回看、复制和复盘。

<div class="dashboard-strip">
  <div class="dashboard-item">
    <span class="dashboard-label">文章风格</span>
    <strong>偏正式博客与排障复盘</strong>
  </div>
  <div class="dashboard-item">
    <span class="dashboard-label">阅读重点</span>
    <strong>背景、命令、修复、验证、复盘</strong>
  </div>
  <div class="dashboard-item">
    <span class="dashboard-label">更新方向</span>
    <strong>持续增加真实维护场景</strong>
  </div>
</div>

## 近期记录

<div class="post-grid">
  <a
    v-for="post in logs"
    :key="post.url"
    class="post-card"
    :href="post.url"
  >
    <span class="post-card-kicker">{{ post.category }}</span>
    <h3>{{ post.title }}</h3>
    <p>{{ post.description }}</p>
    <div class="post-card-meta">
      <time :datetime="post.date">{{ post.dateText }}</time>
    </div>
  </a>
</div>

## 推荐阅读路径

<div class="timeline-list">
  <div class="timeline-item">
    <strong>从基础环境到入口层</strong>
    <p>先看 Linux 初始整理和 Nginx/TLS 入口整理，建立机器与站点层的上下文。</p>
  </div>
  <div class="timeline-item">
    <strong>再看部署与发布</strong>
    <p>Docker Compose、发布回滚和 CI/CD 复盘三篇结合起来，适合串成一条交付链路阅读。</p>
  </div>
  <div class="timeline-item">
    <strong>最后看故障与观测</strong>
    <p>磁盘占满、Ingress 404、集群排障和监控收敛几篇可以形成比较完整的运维排障视角。</p>
  </div>
</div>

## 记录原则

### 先写事实，再写判断

日志页最重要的不是结论有多漂亮，而是过程是否能复现。建议优先记录：

- 当时的现象
- 具体执行过的命令
- 配置变更前后的差异
- 验证结果
- 回滚方式

### 只保留高频信息

如果一条经验不会在一个月后再次用到，就不必写得很长。真正值得留下来的通常是：

- 常见故障的排查顺序
- 容易忘记的参数和路径
- 和现网环境强相关的注意点

### 让页面可被快速扫读

每篇文章都尽量采用统一结构：

1. 背景
2. 过程
3. 验证
4. 复盘

这样既适合阅读，也适合在现场边查边用。

## 适合继续扩展的方向

- Linux 性能调优日志
- Docker 镜像体积优化日志
- Kubernetes 探针和资源限额日志
- Nginx 路由规则调整日志
- CI/CD 构建链路日志
- 存储、备份与恢复日志

## 写作建议

如果你想让这个站更像一个真正长期更新的博客，而不是单纯的文档站，后续文章可以尽量遵循下面的节奏：

- 每篇先写清楚背景和触发事件
- 中间多保留真实命令、配置和日志片段
- 结尾一定写复盘和后续预防点
- 同类问题尽量统一标题格式，方便串联阅读

这样积累一段时间后，站点会自然呈现出“有现场感”的技术日志风格，而不是几篇孤立的说明页。
