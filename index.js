/**
 * ⚡ Velo.x AI - v5.0 (Final Ultimate Edition)
 * ---------------------------------------------
 * @module 1: Groq Llama 3.3 (对话 + 记忆)
 * @module 2: Stable Diffusion XL (写实画图)
 * @module 3: TG Bot API (交互核心)
 */

const CONFIG = {
    // 文本大脑
    TEXT_MODEL: 'llama-3.3-70b-versatile',
    SYSTEM_PROMPT: `You are Velo.x AI, a helpful assistant. Answer concisely in Chinese. Use Markdown.`,
    // 记忆限制 (滑动窗口)
    MEMORY_LIMIT: 12,
    // 绘图引擎
    IMAGE_MODEL: '@cf/stabilityai/stable-diffusion-xl-base-1.0'
};

export default {
    async fetch(request, env) {
        // Webhook 握手
        if (request.method !== 'POST') return new Response('Velo.x AI System Online.', { status: 200 });

        try {
            const update = await request.json();
            if (!update.message || !update.message.text) return new Response('OK');

            const chatId = update.message.chat.id;
            const userId = update.message.from.id;
            const text = update.message.text.trim();
            const messageId = update.message.message_id;

            // 🛡️ 1. 安全鉴权 (只服务大佬)
            if (env.ADMIN_ID && String(userId) !== String(env.ADMIN_ID)) {
                return new Response('OK'); 
            }

            // 🧹 2. 清除记忆指令
            if (text === '/clear' || text === '/reset') {
                try {
                    await env.MEMORY.delete(String(chatId));
                    await sendText(chatId, "🧹 **大脑已格式化，记忆已清除。**", env);
                } catch (e) {
                    await sendText(chatId, "⚠️ 清除失败，请检查是否绑定了 KV (变量名 MEMORY)", env);
                }
                return new Response('OK');
            }

            // 🎨 3. 绘图指令 (/img)
            if (text.startsWith('/img') || text.startsWith('/draw')) {
                const prompt = text.replace(/^\/(img|draw)\s*/, '');
                
                if (!prompt) {
                    await sendText(chatId, "⚠️ 请输入提示词，例如：`/img 赛博朋克`", env);
                    return new Response('OK');
                }

                // 发送“上传中”状态
                await sendChatAction(chatId, 'upload_photo', env);
                // 调用写实画图逻辑
                await handleImageGeneration(chatId, prompt, messageId, env);
            } 
            
            // 💬 4. 对话指令 (Groq + 记忆)
            else {
                await sendChatAction(chatId, 'typing', env);
                
                let history = [];
                try {
                    // 尝试读取记忆
                    history = await env.MEMORY.get(String(chatId), { type: 'json' }) || [];
                } catch (e) {
                    // 如果没绑 KV，就当作没有记忆继续跑，不报错
                    history = [];
                }
                
                // 拼接当前问题
                const requestMessages = [...history, { role: "user", content: text }];
                
                // 调用 Groq
                const aiReply = await fetchGroqWithHistory(requestMessages, env);
                
                // 发送回复
                await sendText(chatId, aiReply, env, messageId);

                // 更新并保存记忆
                try {
                    history.push({ role: "user", content: text });
                    history.push({ role: "assistant", content: aiReply });
                    // 裁剪超长记忆
                    if (history.length > CONFIG.MEMORY_LIMIT) {
                        history = history.slice(history.length - CONFIG.MEMORY_LIMIT);
                    }
                    await env.MEMORY.put(String(chatId), JSON.stringify(history));
                } catch (e) {
                    // KV 保存失败忽略，不影响对话
                }
            }

        } catch (e) {
            console.error(e);
        }
        return new Response('OK');
    }
};

// ==========================================
// 🧠 核心功能：Groq 对话 (Llama 3.3)
// ==========================================
async function fetchGroqWithHistory(messages, env) {
    try {
        const payloadMessages = [
            { role: "system", content: CONFIG.SYSTEM_PROMPT },
            ...messages
        ];

        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${env.GROQ_API_KEY}`
            },
            body: JSON.stringify({
                model: CONFIG.TEXT_MODEL,
                messages: payloadMessages,
                temperature: 0.6, // 0.6 比较均衡，适合对话
                max_tokens: 2048
            })
        });
        const data = await response.json();
        return data.choices?.[0]?.message?.content || "❌ Groq 无响应";
    } catch (e) {
        return `Groq Error: ${e.message}`;
    }
}

// ==========================================
// 🎨 核心功能：AI 绘图 (写实增强版 V2)
// ==========================================
async function handleImageGeneration(chatId, prompt, replyId, env) {
    try {
        // ✨ 自动注入“画质增强剂”
        const enhancedPrompt = prompt + ", photorealistic, 8k resolution, cinematic lighting, highly detailed, masterpiece, sharp focus";
        
        // 调用 CF 显卡
        const inputs = { prompt: enhancedPrompt, steps: 25 }; // 25步更细腻
        const responseStream = await env.AI.run(CONFIG.IMAGE_MODEL, inputs);

        // 格式转换 (ArrayBuffer -> Blob)
        const arrayBuffer = await new Response(responseStream).arrayBuffer();
        const blob = new Blob([arrayBuffer], { type: 'image/png' });

        // 打包发送给 TG
        const formData = new FormData();
        formData.append('chat_id', chatId);
        formData.append('photo', blob, 'gen.png'); 
        formData.append('caption', `🎨 \`${prompt}\``);
        formData.append('parse_mode', 'Markdown');
        formData.append('reply_to_message_id', replyId);

        const res = await fetch(`https://api.telegram.org/bot${env.TG_BOT_TOKEN}/sendPhoto`, {
            method: 'POST',
            body: formData
        });

        if (!res.ok) throw new Error(await res.text());

    } catch (err) {
        await sendText(chatId, `❌ **绘图失败:** ${err.message}`, env);
    }
}

// ==========================================
// 🛠️ 辅助工具
// ==========================================
async function sendChatAction(chatId, action, env) {
    await fetch(`https://api.telegram.org/bot${env.TG_BOT_TOKEN}/sendChatAction`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, action: action })
    });
}

async function sendText(chatId, text, env, replyId = null) {
    const url = `https://api.telegram.org/bot${env.TG_BOT_TOKEN}/sendMessage`;
    const payload = { chat_id: chatId, text: text, parse_mode: 'Markdown', reply_to_message_id: replyId };
    let res = await fetch(url, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(payload) });
    // 降级重试 (防止 Markdown 格式错误)
    if (!res.ok) {
        delete payload.parse_mode;
        await fetch(url, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(payload) });
    }
}
