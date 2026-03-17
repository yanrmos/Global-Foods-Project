// api/process.js
// Serverless function - API keys ficam aqui, nunca expostos ao usuário

export const config = { maxDuration: 120 };

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const GEMINI_KEY = process.env.GEMINI_API_KEY;
  const MODEL = process.env.GEMINI_MODEL || 'gemini-3.1-flash-image-preview';

  if (!GEMINI_KEY) {
    return res.status(500).json({ error: 'API key not configured on server' });
  }

  try {
    const { imageB64, mimeType } = req.body;
    if (!imageB64 || !mimeType) {
      return res.status(400).json({ error: 'imageB64 and mimeType are required' });
    }

    const PROMPT = `High-end product photography retouching of the exact original subject. Do not alter the product's shape, design, or any existing text/typography under any circumstances.
1. Background & Framing: Isolate the product perfectly and place it centered on a pure, seamless white background (RGB 255,255,255). Fit the composition within a strict 1000x1000px square canvas with equal padding on all sides.
2. Glare & Reflection Removal: Aggressively target and eliminate all harsh light reflections, specular highlights, and flash glare. CRITICAL: When glare overlaps any text, logo, or QR code, do NOT reconstruct or regenerate letters — preserve original pixel data in those zones.
3. Color & Lighting: Apply professional color correction, balance the white point, and brighten overall exposure for a clean, vibrant, commercial look.
4. Shadowing: Generate a very soft, natural, realistic contact shadow directly beneath the product.`;

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${GEMINI_KEY}`;

    const geminiRes = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          role: 'user',
          parts: [
            { text: PROMPT },
            { inline_data: { mime_type: mimeType, data: imageB64 } }
          ]
        }],
        generationConfig: { responseModalities: ['IMAGE'] }
      })
    });

    if (!geminiRes.ok) {
      const err = await geminiRes.json().catch(() => ({}));
      return res.status(geminiRes.status).json({ error: err?.error?.message || `Gemini error ${geminiRes.status}` });
    }

    const data = await geminiRes.json();
    const parts = data?.candidates?.[0]?.content?.parts || [];
    const imgPart = parts.find(p =>
      p.inlineData?.mimeType?.startsWith('image/') ||
      p.inline_data?.mime_type?.startsWith('image/')
    );

    if (!imgPart) {
      const textPart = parts.find(p => p.text);
      const reason = data?.candidates?.[0]?.finishReason || '';
      return res.status(422).json({
        error: textPart?.text
          ? 'Recusado: ' + textPart.text.slice(0, 120)
          : `Sem imagem na resposta (${reason}) — tente novamente`
      });
    }

    return res.status(200).json({
      resultB64: imgPart.inlineData?.data || imgPart.inline_data?.data,
      mimeType: 'image/png'
    });

  } catch (err) {
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
}
