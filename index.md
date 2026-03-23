---
layout: home

hero:
  name: DevOps Notes
  text: DevOps / Linux / Kubernetes 学习笔记
  tagline: 面向日常运维、平台工程与集群实践的文档化笔记，强调可执行、可复用、可维护。
  image:
    src: /logo.svg
    alt: DevOps Notes
  actions:
    - theme: brand
      text: 开始阅读
      link: /guide
    - theme: alt
      text: 日志总览
      link: /logs/

features:
  - title: Linux 基础与运维
    details: 从系统初始整理、权限、日志、服务和网络排障开始，把高频问题保留成可复用清单。
  - title: 容器与交付
    details: 记录 Docker、Compose、镜像构建与服务部署的实际过程，方便后续重复使用和迁移。
  - title: Kubernetes 实战
    details: 聚焦 Pod、Service、Ingress、探针、调度和排障等日常操作，强调故障定位思路。
---

<script setup>
import { data as logs } from './.vitepress/theme/logs.data.mjs'
</script>

<div class="dashboard-strip">
  <div class="dashboard-item">
    <span class="dashboard-label">内容方向</span>
    <strong>Blog + Notes + Debug Logs</strong>
  </div>
  <div class="dashboard-item">
    <span class="dashboard-label">当前主题</span>
    <strong>Linux / Container / Kubernetes / CI-CD</strong>
  </div>
  <div class="dashboard-item">
    <span class="dashboard-label">写作方式</span>
    <strong>以真实现场、命令和复盘为核心</strong>
  </div>
</div>

## 文档定位

<Badge type="tip" text="Documentation First" /> <Badge type="info" text="Debug Friendly" /> <Badge type="warning" text="Continuously Growing" />

这个站点用于整理 DevOps、Linux 与 Kubernetes 方向的学习笔记和技术日志。内容以实践视角组织，尽量避免冗长背景介绍，优先保留部署、排障、发布和维护过程中真正会重复用到的信息。

::: tip 为什么这种风格更适合技术站
一套真正好用的技术站点，不只是“能放文档”，更重要的是能让人快速找到决策上下文、排障路径和可复用的命令片段。VitePress 默认主题已经把结构和可读性做得很好，这里只是在它之上做更细致的呈现。
:::

## 最近日志

<div class="post-grid">
  <a
    v-for="post in logs.slice(0, 9)"
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

## 阅读方式

- 从 [Guide](/guide) 开始，快速了解站点的结构和写作规则。
- 从 [日志总览](/logs/) 进入具体文章，按主题继续扩展内容。
- 把每篇文档当作可持续补充的工作记录，而不是一次性教程。
- 保持主题拆分清晰，后续可按 Linux、容器、Kubernetes、CI/CD 等方向继续追加。

## 适用场景

- 个人技术学习笔记沉淀
- HomeLab 或小规模生产环境运维记录
- 团队内部知识库的轻量原型
- 以静态站点形式发布技术文档

## 站点结构

- 首页作为入口
- Guide 作为写作规则说明
- `logs/` 作为持续积累的技术日志区
- 后续可以继续按主题增加更多页面，而不需要重做导航

## 浏览节奏

<div class="timeline-list">
  <div class="timeline-item">
    <strong>入口页先建立上下文</strong>
    <p>首页负责回答这是什么站、写什么内容、适合谁看。</p>
  </div>
  <div class="timeline-item">
    <strong>日志页承接真实工作流</strong>
    <p>每篇文章尽量保留场景、命令、验证和复盘，让页面像一次真实维护记录。</p>
  </div>
  <div class="timeline-item">
    <strong>Guide 负责统一写作结构</strong>
    <p>这样后续继续扩展时，整体风格仍然会保持稳定，不会越来越乱。</p>
  </div>
</div>

## 这类站点怎么写才像博客

如果目标是做成“正经的博客和 debug 记录”，最有效的方式不是花哨设计，而是持续把内容写成可复用的现场记录：

- 先交代场景和环境
- 再写症状和判断
- 中间留下具体命令和配置
- 结尾给出修复方案和复盘

这样的文章读起来会更像一个真正干过活的人在整理笔记，也更适合后续不断补充新案例。
