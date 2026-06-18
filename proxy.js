// ══════════════════════════════════════════════════════════════════════════════
// StatAnalyse Pro — Proxy Netlify
// Providers : Cerebras · Groq · Gemini · Mistral · DeepSeek · Claude
// Variables d'env à configurer sur Netlify :
//   CEREBRAS_KEY · GROQ_KEY · GEMINI_KEY · MISTRAL_KEY · DEEPSEEK_KEY · CLAUDE_KEY
// ══════════════════════════════════════════════════════════════════════════════

exports.handler = async (event) => {
  // CORS — autoriser ton domaine GitHub Pages
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
  };

  // Preflight OPTIONS
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Méthode non autorisée' }) };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'JSON invalide' }) };
  }

  const { prompt, provider, model } = body;

  if (!prompt || !provider) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'prompt et provider requis' }) };
  }

  try {
    let text;

    switch (provider) {

      // ── CEREBRAS ────────────────────────────────────────────────────────────
      case 'cerebras': {
        const key = process.env.CEREBRAS_KEY;
        if (!key) throw new Error('CEREBRAS_KEY non configurée');
        const res = await fetch('https://api.cerebras.ai/v1/chat/completions', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: model || 'llama3.1-70b',
            messages: [{ role: 'user', content: prompt }],
            max_tokens: 2048,
          }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error?.message || 'Erreur Cerebras');
        text = json.choices[0].message.content;
        break;
      }

      // ── GROQ ────────────────────────────────────────────────────────────────
      case 'groq': {
        // Rotation sur 3 clés pour éviter les rate limits
        const groqKeys = [
          process.env.GROQ_KEY_1,
          process.env.GROQ_KEY_2,
          process.env.GROQ_KEY_3,
        ].filter(Boolean);
        if (!groqKeys.length) throw new Error('Aucune GROQ_KEY configurée');
        const key = groqKeys[Math.floor(Math.random() * groqKeys.length)];
        const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: model || 'llama-3.3-70b-versatile',
            messages: [{ role: 'user', content: prompt }],
            max_tokens: 2048,
          }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error?.message || 'Erreur Groq');
        text = json.choices[0].message.content;
        break;
      }

      // ── GEMINI ──────────────────────────────────────────────────────────────
      case 'gemini': {
        const key = process.env.GEMINI_KEY;
        if (!key) throw new Error('GEMINI_KEY non configurée');
        const geminiModel = model || 'gemini-2.0-flash';
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${key}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }],
              generationConfig: { maxOutputTokens: 2048 },
            }),
          }
        );
        const json = await res.json();
        if (!res.ok) throw new Error(json.error?.message || 'Erreur Gemini');
        text = json.candidates[0].content.parts[0].text;
        break;
      }

      // ── MISTRAL ─────────────────────────────────────────────────────────────
      case 'mistral': {
        const key = process.env.MISTRAL_KEY;
        if (!key) throw new Error('MISTRAL_KEY non configurée');
        const res = await fetch('https://api.mistral.ai/v1/chat/completions', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: model || 'mistral-small-latest',
            messages: [{ role: 'user', content: prompt }],
            max_tokens: 2048,
          }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error?.message || 'Erreur Mistral');
        text = json.choices[0].message.content;
        break;
      }

      // ── DEEPSEEK ────────────────────────────────────────────────────────────
      case 'deepseek': {
        const key = process.env.DEEPSEEK_KEY;
        if (!key) throw new Error('DEEPSEEK_KEY non configurée');
        const res = await fetch('https://api.deepseek.com/chat/completions', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: model || 'deepseek-chat',
            messages: [{ role: 'user', content: prompt }],
            max_tokens: 2048,
          }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error?.message || 'Erreur DeepSeek');
        text = json.choices[0].message.content;
        break;
      }

      // ── CLAUDE (Anthropic) ──────────────────────────────────────────────────
      case 'claude': {
        const key = process.env.CLAUDE_KEY;
        if (!key) throw new Error('CLAUDE_KEY non configurée — achetez une clé Anthropic');
        const res = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'x-api-key': key,
            'anthropic-version': '2023-06-01',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: model || 'claude-3-5-haiku-20241022',
            max_tokens: 2048,
            messages: [{ role: 'user', content: prompt }],
          }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error?.message || 'Erreur Claude');
        text = json.content[0].text;
        break;
      }

      default:
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: `Provider inconnu : ${provider}` }),
        };
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ text }),
    };

  } catch (err) {
    console.error(`[proxy] Erreur ${provider}:`, err.message);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
