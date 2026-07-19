const WELCOME_TEXT =
  "Birbirinden güzel her gün '' tamamen ücretsiz '' orijinal ve reklamsız içerikler seni bekliyor. aşağıdan katılman yeterli.";

async function callTelegram(botToken, method, params) {
  const res = await fetch(`https://api.telegram.org/bot${botToken}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  return res.json();
}

async function handleWebhook(request, env) {
  const secret = request.headers.get("X-Telegram-Bot-Api-Secret-Token");
  if (secret !== env.WEBHOOK_SECRET) {
    return new Response("forbidden", { status: 403 });
  }

  const update = await request.json();
  const message = update.message;
  if (!message) return new Response("ok");

  const chatId = message.chat.id;

  if (message.text && message.text.startsWith("/start")) {
    const already = await env.SUBSCRIBERS.get(String(chatId));
    if (!already) {
      await env.SUBSCRIBERS.put(String(chatId), JSON.stringify({
        joined_at: new Date().toISOString(),
        username: message.from.username || null,
        first_name: message.from.first_name || null,
      }));
    }

    await callTelegram(env.BOT_TOKEN, "sendMessage", {
      chat_id: chatId,
      text: WELCOME_TEXT,
      reply_markup: {
        inline_keyboard: [[{ text: "🎬 Kanallara Katıl", url: env.JOIN_LINK }]],
      },
    });
  }

  return new Response("ok");
}

async function handleBroadcast(request, env) {
  const url = new URL(request.url);
  if (url.searchParams.get("secret") !== env.BROADCAST_SECRET) {
    return new Response("forbidden", { status: 403 });
  }

  const text = url.searchParams.get("text");
  if (!text) {
    return new Response("missing text param", { status: 400 });
  }

  let cursor;
  let sent = 0;
  let failed = 0;
  do {
    const page = await env.SUBSCRIBERS.list({ cursor, limit: 1000 });
    for (const key of page.keys) {
      const result = await callTelegram(env.BOT_TOKEN, "sendMessage", {
        chat_id: key.name,
        text,
      });
      if (result.ok) sent++; else failed++;
    }
    cursor = page.cursor;
    if (!page.list_complete && cursor) {
      // small delay to stay well under Telegram's rate limits
      await new Promise((r) => setTimeout(r, 50));
    } else {
      cursor = undefined;
    }
  } while (cursor);

  return new Response(JSON.stringify({ sent, failed }), {
    headers: { "Content-Type": "application/json" },
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/telegram-webhook" && request.method === "POST") {
      return handleWebhook(request, env);
    }
    if (url.pathname === "/broadcast") {
      return handleBroadcast(request, env);
    }
    return new Response("not found", { status: 404 });
  },
};