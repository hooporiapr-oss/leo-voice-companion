const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3001;

// --- Middleware ---
app.use(cors({
  origin: function(origin, callback) {
    /* Allow all origins for now — tighten later when live */
    callback(null, true);
  },
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type']
}));
app.use(express.json());

// --- Environment Variables (set in Render dashboard) ---
// ANTHROPIC_API_KEY — your Claude API key
// ELEVENLABS_API_KEY — your ElevenLabs API key

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const LEO_VOICE_ID = 'jzmAudEi0DeODCFmt4mt';
const TTS_MODEL = 'eleven_multilingual_v2';

// --- System Prompt Builder ---
function buildSystemPrompt(municipality) {
  let muniBlock = '';
  if (municipality) {
    muniBlock = `\nThe user has selected ${municipality}, Puerto Rico. Focus this conversation on ${municipality}. Share everything you know: history, culture, food, beaches, landmarks, neighborhoods, cost of living, real estate, schools, safety, nightlife, and what makes this municipality unique among all 78. Be specific and passionate about ${municipality}.\n`;
  }

  return `You are La Voz — the voice of Puerto Rico. You are an AI voice guide created by GoStar Digital LLC that knows every one of Puerto Rico's 78 municipalities intimately. You speak with warmth, pride, and authentic Puerto Rican energy.
${muniBlock}
VOICE AND PERSONALITY:
You are warm, confident, proud, and passionate about Puerto Rico. You speak naturally in whatever language the user speaks — English or Spanish, switching fluidly. You use Puerto Rican expressions naturally: Wepa, Mira, Oye, Dime, Pa'lante. You have strong opinions about food. You talk like a proud local, not a tour guide reading from a script.

RESPONSE RULES:
- MAX 2-3 sentences per response. Keep it tight.
- Be specific — names, places, prices, years, details.
- If you don't know something, say so honestly.
- Never make up facts about a specific business, price, or address.
- Match the user's energy and language.

When recommending restaurants, hotels, or services, mention them by name with genuine enthusiasm. If someone asks about partnering with La Voz PR, direct them to info@lavozpr.com.

You are an AI voice guide for educational and informational purposes only. You are not a lawyer, tax advisor, real estate agent, or financial professional. GoStar Digital LLC does not provide professional advice. Always recommend consulting qualified professionals for legal, tax, or financial decisions.`;
}

// --- Health Check ---
app.get('/', (req, res) => {
  res.json({ status: 'La Voz PR API is live', version: '1.0.0' });
});

// --- Chat Endpoint (Claude API) ---
app.post('/api/chat', async (req, res) => {
  try {
    if (!ANTHROPIC_API_KEY) {
      return res.status(500).json({ error: 'Anthropic API key not configured' });
    }

    const { messages, municipality } = req.body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'Messages array required' });
    }

    const systemPrompt = buildSystemPrompt(municipality);

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 200,
        system: systemPrompt,
        messages: messages
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Claude API error:', response.status, errorText);
      return res.status(response.status).json({ error: 'Claude API error', details: errorText });
    }

    const data = await response.json();
    const text = data.content && data.content[0] ? data.content[0].text : '';

    res.json({ reply: text });

  } catch (err) {
    console.error('Chat endpoint error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// --- TTS Endpoint (ElevenLabs) ---
app.post('/api/tts', async (req, res) => {
  try {
    if (!ELEVENLABS_API_KEY) {
      return res.status(500).json({ error: 'ElevenLabs API key not configured' });
    }

    const { text } = req.body;

    if (!text || text.trim().length === 0) {
      return res.status(400).json({ error: 'Text required' });
    }

    // Cap text length to control costs
    const trimmedText = text.slice(0, 500);

    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${LEO_VOICE_ID}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'xi-api-key': ELEVENLABS_API_KEY
      },
      body: JSON.stringify({
        text: trimmedText,
        model_id: TTS_MODEL,
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
          style: 0.3,
          use_speaker_boost: true
        }
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('ElevenLabs TTS error:', response.status, errorText);
      return res.status(response.status).json({ error: 'TTS error', details: errorText });
    }

    // Stream audio back to client
    res.set({
      'Content-Type': 'audio/mpeg',
      'Cache-Control': 'no-cache'
    });

    const arrayBuffer = await response.arrayBuffer();
    res.send(Buffer.from(arrayBuffer));

  } catch (err) {
    console.error('TTS endpoint error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// --- Start Server ---
app.listen(PORT, () => {
  console.log(`La Voz PR API running on port ${PORT}`);
});
