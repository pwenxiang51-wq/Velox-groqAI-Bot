# ⚡ Velo.x AI - 零成本地表最强 AI 助理指南

![Velo.x AI](https://images.unsplash.com/photo-1620712943543-bcc4688e7485?q=80&w=2000&auto=format&fit=crop)

> **声明**：这是一个利用 **Cloudflare Workers** + **Groq** + **Telegram** 实现的全能型 AI 助手。支持 **Llama 3.3 极速对话**、**长期记忆存储** 以及 **SDXL 电影级写实绘图**。

---

## 🌟 核心特性

- 💰 **完全免费**：白嫖 Cloudflare 和 Groq 的顶级算力。
- 🧠 **长期记忆**：基于 Cloudflare KV 数据库，支持上下文连贯对话。
- 🎨 **艺术创作**：内置写实增强算法，一键生成 8K 质感大片。
- 🔒 **私有部署**：支持 `ADMIN_ID` 鉴权，只听命于你一个人。
- 🛠️ **灾难恢复**：内置 Plan B，Groq 挂了可一键无缝切换至 CF 原生模型。

---

## 🛠️ 快速开始

### 1. 准备工作
- **Cloudflare**: 注册并登录 [Cloudflare Dash](https://dash.cloudflare.com/)。
- **Telegram**: 找 [@BotFather](https://t.me/botfather) 获取 `Bot_Token`。
- **Groq**: 在 [Groq Console](https://console.groq.com/) 申请免费 API Key。

### 2. 环境配置
在 Cloudflare Worker 的 **Settings** 中配置：
- **KV 绑定**: 创建 `AI_MEMORY` 空间，变量名设为 `MEMORY`。
- **AI 绑定**: 添加 Workers AI，变量名设为 `AI`。
- **环境变量**:
  - `TG_BOT_TOKEN`: 你的机器人 Token
  - `GROQ_API_KEY`: 你的 Groq 密钥
  - `ADMIN_ID`: 你的 TG 数字 ID

### 3. 部署代码
将仓库中的 `index.js` 代码复制到 Worker 编辑器并部署。

---



---

## 🚨 容灾方案 (Plan B)

如果 Groq API 故障，请将 `fetchGroqWithHistory` 替换为以下代码以调用 Cloudflare 原生模型：

```javascript
async function fetchGroqWithHistory(messages, env) {
    const response = await env.AI.run('@cf/meta/llama-3-8b-instruct', {
        messages: messages,
        stream: false
    });
    return response.response || "❌ CF AI 无响应";
}
```

<div align="center" style="margin-top: 20px; margin-bottom: 20px;">
  <img src="donate.jpg" width="200" style="border-radius: 12px; box-shadow: 0 4px 8px rgba(0,0,0,0.1);">
  
  <p style="font-size: 16px; font-weight: bold; margin-top: 12px;">
    微信支付 (WeChat Pay)
  </p>
  <p style="font-size: 14px; color: #777;">
    ☕ 請作者喝杯咖啡，支持持續更新
  </p>
</div>>
