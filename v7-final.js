/**
 * ⚡ Velo.x AI - v7.0 (Final Translation Edition)
 * ---------------------------------------------
 * 核心修复：增加了“自动翻译”层。
 * 逻辑：用户输入中文 -> Groq 翻译成英文 -> SDXL 画图。
 * 解决：彻底解决 SDXL 听不懂中文导致画出风景或乱码的问题。
 */

const CONFIG = {
    TEXT_MODEL: 'llama-3.1-8b-instant', 
    SYSTEM_PROMPT: `You are a helpful assistant. Answer concisely in Chinese.`,
    MEMORY_LIMIT: 10,
    IMAGE_MODEL: '@cf/stabilityai/stable-diffusion-xl-base-1.0'
  };
  
  export default {
    async fetch(request, env) {
        if (request.method !== 'POST') return new Response('System Online.', { status: 200 });
  
        try {
            const update = await request.json();
            if (!update.message || !update.message.text) return new Response('OK');
  
            const chatId = update.message.chat.id;
            const userId = update.message.from.id;
            const text = update.message.text.trim();
            const messageId = update.message.message_id;
  
            if (env.ADMIN_ID && String(userId) !== String(env.ADMIN_ID)) return new Response('OK'); 
  
            // 🧹 清除记忆
            if (text === '/clear' || text === '/reset') {
                try {
                    await env.MEMORY.delete(String(chatId));
                    await sendText(chatId, "🧹 记忆已清除。", env);
                } catch (e) {}
                return new Response('OK');
            }
  
            // 🎨 绘图指令 (自动翻译版)
            if (text.startsWith('/img') || text.startsWith('/draw')) {
                const rawPrompt = text.replace(/^\/(img|draw)\s*/, '');
                if (!rawPrompt) {
                    await sendText(chatId, "⚠️ 请输入内容，例如：`/img 一只狗`", env);
                    return new Response('OK');
                }
                await sendChatAction(chatId, 'upload_photo', env);
                await handleImageGeneration(chatId, rawPrompt, messageId, env);
            } 
            
            // 💬 对话指令
            else {
                await sendChatAction(chatId, 'typing', env);
                let history = [];
                try { history = await env.MEMORY.get(String(chatId), { type: 'json' }) || []; } catch (e) { history = []; }
                
                const requestMessages = [...history, { role: "user", content: text }];
                const aiReply = await fetchGroq(requestMessages, env); // 复用通用请求函数
                
                await sendText(chatId, aiReply, env, messageId);
  
                try {
                    history.push({ role: "user", content: text });
                    history.push({ role: "assistant", content: aiReply });
                    if (history.length > CONFIG.MEMORY_LIMIT) history = history.slice(history.length - CONFIG.MEMORY_LIMIT);
                    await env.MEMORY.put(String(chatId), JSON.stringify(history));
                } catch (e) { }
            }
  
        } catch (e) { console.error(e); }
        return new Response('OK');
    }
  };
  
  // ==========================================
  // 🧠 Groq 通用请求 (对话 & 翻译)
  // ==========================================
  async function fetchGroq(messages, env) {
    try {
        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${env.GROQ_API_KEY}`
            },
            body: JSON.stringify({
                model: CONFIG.TEXT_MODEL,
                messages: messages,
                temperature: 0.6,
                max_tokens: 1024
            })
        });
        const data = await response.json();
        return data.choices?.[0]?.message?.content || "❌ 无响应";
    } catch (e) { return `Error: ${e.message}`; }
  }
  
  // ==========================================
  // 🎨 AI 绘图 (带自动翻译功能)
  // ==========================================
  async function handleImageGeneration(chatId, rawPrompt, replyId, env) {
    try {
        // 1. 关键步骤：先找 Groq 把中文翻译成英文 Prompt
        // 告诉 Groq：你是翻译官，只输出英文，不要废话。
        const transMessages = [
            { 
                role: "system", 
                // 👇👇👇 核心修改：加了三道金牌令箭，禁止输出中文 👇👇👇
                content: "You are an expert AI photographer. Your task is to rewrite the user's input into a detailed, photorealistic ENGLISH prompt. \n\nRULES:\n1. Output MUST be in English.\n2. NO Chinese characters allowed in output.\n3. Focus on lighting, texture, and realism." 
            },
            { role: "user", content: rawPrompt }
        ];
        
        // 获取翻译结果 (例如：'一只狗' -> 'A cute dog sitting on floor...')
        let englishPrompt = await fetchGroq(transMessages, env);
        
        // 如果翻译失败，回退到原始输入
        if (englishPrompt.includes("Error") || englishPrompt.includes("无响应")) {
            englishPrompt = rawPrompt; 
        }
  
        // 2. 将英文 Prompt 传给 SDXL
        const inputs = { prompt: englishPrompt, num_steps: 20 }; 
        const responseStream = await env.AI.run(CONFIG.IMAGE_MODEL, inputs);
  
        const arrayBuffer = await new Response(responseStream).arrayBuffer();
        const blob = new Blob([arrayBuffer], { type: 'image/png' });
  
        const formData = new FormData();
        formData.append('chat_id', chatId);
        formData.append('photo', blob, 'gen.png'); 
        // 3. 回复时显示 翻译后的英文提示词，让你知道它理解了什么
        formData.append('caption', `🎨 绘图完成\n原词: ${rawPrompt}\nAI理解: \`${englishPrompt}\``);
        formData.append('parse_mode', 'Markdown');
        formData.append('reply_to_message_id', replyId);
  
        const res = await fetch(`https://api.telegram.org/bot${env.TG_BOT_TOKEN}/sendPhoto`, {
            method: 'POST',
            body: formData
        });
        
        if (!res.ok) throw new Error("TG 发送失败");
  
    } catch (err) {
        await sendText(chatId, `❌ **绘图失败:** ${err.message}`, env);
    }
  }
  
  // ==========================================
  // 🛠️ 辅助工具
  // ==========================================
  async function sendChatAction(chatId, action, env) {
    try {
        await fetch(`https://api.telegram.org/bot${env.TG_BOT_TOKEN}/sendChatAction`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: chatId, action: action })
        });
    } catch (e) {}
  }
  
  async function sendText(chatId, text, env, replyId = null) {
    const url = `https://api.telegram.org/bot${env.TG_BOT_TOKEN}/sendMessage`;
    const payload = { chat_id: chatId, text: text, parse_mode: 'Markdown', reply_to_message_id: replyId };
    let res = await fetch(url, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(payload) });
    if (!res.ok) {
        delete payload.parse_mode;
        await fetch(url, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(payload) });
    }
  }
