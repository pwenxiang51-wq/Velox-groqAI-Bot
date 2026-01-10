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

## 💻 核心代码 (v5.0 终极版)

```javascript
/**
 * ⚡ Velo.x AI - v5.0 (Final Ultimate Edition)
 * ---------------------------------------------
 * 包含：Groq对话、KV记忆、SDXL写实绘图、安全鉴权
 */

const CONFIG = {
    TEXT_MODEL: 'llama-3.3-70b-versatile',
    SYSTEM_PROMPT: `You are Velo.x AI, a helpful assistant. Answer concisely in Chinese. Use Markdown.`,
    MEMORY_LIMIT: 12,
    IMAGE_MODEL: '@cf/stabilityai/stable-diffusion-xl-base-1.0'
};

export default {
    async fetch(request, env) {
        if (request.method !== 'POST') return new Response('Online', { status: 200 });

        try {
            const update = await request.json();
            if (!update.message || !update.message.text) return new Response('OK');

            const chatId = update.message.chat.id;
            const userId = update.message.from.id;
            const text = update.message.text.trim();
            const messageId = update.message.message_id;

            if (env.ADMIN_ID && String(userId) !== String(env.ADMIN_ID)) return new Response('OK');

            if (text === '/clear' || text === '/reset') {
                await env.MEMORY.delete(String(chatId));
                await sendText(chatId, "🧹 **记忆已清除**", env);
                return new Response('OK');
            }

            if (text.startsWith('/img') || text.startsWith('/draw')) {
                const prompt = text.replace(/^\/(img|draw)\s*/, '');
                if (!prompt) return await sendText(chatId, "⚠️ 请输入提示词", env);
                await sendChatAction(chatId, 'upload_photo', env);
                await handleImageGeneration(chatId, prompt, messageId, env);
            } else {
                await sendChatAction(chatId, 'typing', env);
                let history = await env.MEMORY.get(String(chatId), { type: 'json' }) || [];
                const requestMessages = [...history, { role: "user", content: text }];
                const aiReply = await fetchGroqWithHistory(requestMessages, env);
                await sendText(chatId, aiReply, env, messageId);
                history.push({ role: "user", content: text }, { role: "assistant", content: aiReply });
                if (history.length > CONFIG.MEMORY_LIMIT) history = history.slice(-CONFIG.MEMORY_LIMIT);
                await env.MEMORY.put(String(chatId), JSON.stringify(history));
            }
        } catch (e) { console.error(e); }
        return new Response('OK');
    }
};

async function fetchGroqWithHistory(messages, env) {
    const response = await fetch('[https://api.groq.com/openai/v1/chat/completions](https://api.groq.com/openai/v1/chat/completions)', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${env.GROQ_API_KEY}` },
        body: JSON.stringify({
            model: CONFIG.TEXT_MODEL,
            messages: [{ role: "system", content: CONFIG.SYSTEM_PROMPT }, ...messages],
            temperature: 0.6,
            max_tokens: 2048
        })
    });
    const data = await response.json();
    return data.choices?.[0]?.message?.content || "❌ 无响应";
}

async function handleImageGeneration(chatId, prompt, replyId, env) {
    const enhancedPrompt = prompt + ", photorealistic, 8k resolution, cinematic lighting, masterpiece, sharp focus";
    const responseStream = await env.AI.run(CONFIG.IMAGE_MODEL, { prompt: enhancedPrompt, steps: 25 });
    const arrayBuffer = await new Response(responseStream).arrayBuffer();
    const blob = new Blob([arrayBuffer], { type: 'image/png' });
    const formData = new FormData();
    formData.append('chat_id', chatId);
    formData.append('photo', blob, 'gen.png'); 
    formData.append('caption', `🎨 \`${prompt}\``);
    formData.append('reply_to_message_id', replyId);
    await fetch(`https://api.telegram.org/bot${env.TG_BOT_TOKEN}/sendPhoto`, { method: 'POST', body: formData });
}

async function sendChatAction(chatId, action, env) {
    await fetch(`https://api.telegram.org/bot${env.TG_BOT_TOKEN}/sendChatAction`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, action: action })
    });
}

async function sendText(chatId, text, env, replyId = null) {
    const url = `https://api.telegram.org/bot${env.TG_BOT_TOKEN}/sendMessage`;
    const payload = { chat_id: chatId, text: text, parse_mode: 'Markdown', reply_to_message_id: replyId };
    await fetch(url, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(payload) });
}
```

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

---

## 📝 许可证
MIT License. 自由分发，请保留 **Velo.x AI** 出处。

---

### ☕ 请我喝杯咖啡 (Buy Me a Coffee)

如果你觉得这个项目对你有帮助，欢迎请作者喝杯咖啡！你的支持是我持续维护的最大动力。🚀

| 微信支付 (WeChat Pay) |
| :---: |
| ![微信收款码](./donate.jpg) |

> **提示**：赞赏请备注 "Velo-AI"，感谢每一位支持技术开源的大佬！
