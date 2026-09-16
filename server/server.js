/**
 * PrivacyShield - Backend VLM Proxy Server
 * 
 * Complies with ISRO SIH Problem Statement:
 * - API keys are stored exclusively as server-side environment variables (never client-side).
 * - Routes sanitized screen context + task to VLMs (Gemini / Qwen2-VL / LLaVA).
 * - Returns strict JSON UI action directives or structured textual responses.
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3001;

// Enable CORS and generous JSON body limits for base64 sanitized images
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// API Keys from Environment
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.6-flash';
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const MODEL_NAME = process.env.VLM_MODEL || 'qwen/qwen-2-vl-72b-instruct';

// System Prompt enforcing strict JSON schemas
const SYSTEM_PROMPT = `
You are PrivacyShield Vision Agent, an autonomous AI vision agent running on a sanitized browser context.
The user has provided:
1. Sanitized DOM Text: All sensitive PII (Aadhaar, cards, emails, names, phones, secrets) has already been masked locally into deterministic tokens (e.g. [EMAIL_1], [AADHAAR_1]).
2. Sanitized Screenshot: All DOM sensitive text has solid privacy masks, and all human faces are blurred.
3. Screen Structure: A structured JSON listing interactive elements (inputs, buttons, forms, tables) with selectors and bounding boxes.
4. User Task: The specific instruction from the user.

Your goal is to accomplish the user task accurately.
You must respond with ONLY a valid, parseable JSON object matching one of two formats:

Format 1: UI Autonomous Action (if the user asked to fill a form, click a button, scroll, or interact)
{
  "type": "action",
  "actions": [
    {
      "type": "fill",
      "selector": "input#input-fullname",
      "fieldType": "name"
    },
    {
      "type": "fill",
      "selector": "input#input-user-email",
      "fieldType": "email"
    },
    {
      "type": "fill",
      "selector": "input#input-user-phone",
      "fieldType": "phone"
    },
    {
      "type": "fill",
      "selector": "input#input-user-aadhaar",
      "fieldType": "aadhaar"
    },
    {
      "type": "fill",
      "selector": "input#input-user-address",
      "fieldType": "address"
    }
  ]
}

CRITICAL RULES:
- Specify "fieldType" as the semantic category (e.g. "name", "email", "phone", "aadhaar", "pan", "address", "city").
- NEVER guess or output real PII values. The client replaces "fieldType" locally from a mock profile on device.
- NEVER GENERATE CLICK ACTIONS FOR SUBMIT BUTTONS. Under PrivacyShield security policy, forms must always be submitted manually by the human user after reviewing the filled fields. Do NOT click submit, confirm, or complete buttons on forms.

Format 2: Informational Answer / Summary (if the user asked a factual question, summary, or inspection)
{
  "type": "response",
  "text": "Your summary or direct answer here."
}

Do NOT wrap the JSON in markdown fences. Output raw JSON only.
`;

/**
 * Health Check Endpoint
 */
app.get('/health', (req, res) => {
  let activeProvider = 'Local Simulation Mode';
  let activeModel = 'Local Fallback';

  if (GEMINI_API_KEY) {
    activeProvider = 'Google Gemini VLM';
    activeModel = GEMINI_MODEL;
  } else if (OPENROUTER_API_KEY) {
    activeProvider = 'OpenRouter (Open-Weight)';
    activeModel = MODEL_NAME;
  }

  res.json({
    status: 'healthy',
    service: 'PrivacyShield VLM Proxy',
    provider: activeProvider,
    model: activeModel,
    timestamp: Date.now()
  });
});

/**
 * Main Agent Proxy Endpoint
 * POST /api/agent
 */
app.post('/api/agent', async (req, res) => {
  const startTime = Date.now();
  const { sanitizedText, sanitizedImageBase64, screenStructure, task, pageClassification } = req.body;

  if (!task) {
    return res.status(400).json({ error: 'Missing required field: "task"' });
  }

  console.log(`[Proxy] Received request. Task: "${task}". Page: ${pageClassification?.pageType || 'UNKNOWN'}`);

  try {
    let resultJson = null;

    // 1. GEMINI VLM INFERENCE
    if (GEMINI_API_KEY) {
      console.log(`[Proxy] Calling Gemini (${GEMINI_MODEL})...`);
      const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
      
      const parts = [
        { text: SYSTEM_PROMPT },
        { text: `Task: ${task}\n\nSanitized DOM Context:\n${(sanitizedText || '').slice(0, 3000)}\n\nScreen Structure:\n${JSON.stringify(screenStructure?.elements?.slice(0, 30) || [])}` }
      ];

      // Attach sanitized image if present
      if (sanitizedImageBase64 && sanitizedImageBase64.includes('base64,')) {
        const mimeType = sanitizedImageBase64.split(';')[0].split(':')[1] || 'image/jpeg';
        const base64Data = sanitizedImageBase64.split('base64,')[1];
        parts.push({
          inlineData: {
            mimeType: mimeType,
            data: base64Data
          }
        });
      }

      const response = await fetch(geminiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: parts }],
          generationConfig: {
            temperature: 0.1,
            responseMimeType: 'application/json'
          }
        })
      });

      if (!response.ok) {
        const errText = await response.text();
        console.warn(`[Proxy] Gemini returned HTTP ${response.status}:`, errText);
        throw new Error(`Gemini API error (${response.status}): ${errText}`);
      }

      const data = await response.json();
      const rawContent = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
      resultJson = JSON.parse(rawContent.replace(/```json\n?|```/g, '').trim());
    }
    // 2. OPENROUTER VLM INFERENCE
    else if (OPENROUTER_API_KEY) {
      console.log('[Proxy] Calling OpenRouter VLM API...');
      const messages = [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content: [
            { type: 'text', text: `Task: ${task}\n\nSanitized DOM Context:\n${(sanitizedText || '').slice(0, 3000)}\n\nScreen Structure:\n${JSON.stringify(screenStructure?.elements?.slice(0, 20) || [])}` },
            ...(sanitizedImageBase64 ? [{ type: 'image_url', image_url: { url: sanitizedImageBase64 } }] : [])
          ]
        }
      ];

      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://privacyshield.isro-sih.org',
          'X-Title': 'PrivacyShield ISRO SIH'
        },
        body: JSON.stringify({
          model: MODEL_NAME,
          messages: messages,
          temperature: 0.1,
          response_format: { type: 'json_object' }
        })
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`OpenRouter error (${response.status}): ${errText}`);
      }

      const data = await response.json();
      const rawContent = data.choices[0]?.message?.content || '{}';
      resultJson = JSON.parse(rawContent.replace(/```json\n?|```/g, '').trim());
    }
    // 3. SMART ON-DEVICE SIMULATION FALLBACK
    else {
      console.log('[Proxy] No external API key found. Running intelligent local simulation response...');
      const lowerTask = task.toLowerCase();

      if (lowerTask.includes('fill') || lowerTask.includes('form') || lowerTask.includes('complete') || lowerTask.includes('auto')) {
        const inputs = (screenStructure?.elements || []).filter(e => e.type.startsWith('input') || e.type === 'select_dropdown' || e.type === 'textarea');
        const actions = [];

        inputs.forEach(inp => {
          let fieldType = 'name';
          const lbl = (inp.label || inp.selector || '').toLowerCase();
          if (lbl.includes('email')) fieldType = 'email';
          else if (lbl.includes('phone') || lbl.includes('mobile') || lbl.includes('contact') || lbl.includes('tel')) fieldType = 'phone';
          else if (lbl.includes('aadhaar') || lbl.includes('uid') || lbl.includes('aadhar')) fieldType = 'aadhaar';
          else if (lbl.includes('pan')) fieldType = 'pan';
          else if (lbl.includes('addr') || lbl.includes('street') || lbl.includes('residence') || lbl.includes('flat')) fieldType = 'address';
          else if (lbl.includes('city')) fieldType = 'city';
          else if (lbl.includes('state')) fieldType = 'state';
          else if (lbl.includes('pin') || lbl.includes('zip')) fieldType = 'pincode';

          actions.push({
            action: 'fill',
            type: 'fill',
            selector: inp.selector || `input[name="${inp.label}"]`,
            target: { type: 'selector', value: inp.selector || `input[name="${inp.label}"]` },
            fieldType: fieldType,
            confidence: 0.95
          });
        });

        // NOTE: Forms must never be submitted automatically
        resultJson = {
          type: 'action',
          actions: actions.length > 0 ? actions : [
            { action: 'fill', type: 'fill', selector: '#input-fullname, input[name="name"]', target: { type: 'selector', value: '#input-fullname' }, fieldType: 'name', confidence: 0.95 },
            { action: 'fill', type: 'fill', selector: '#input-user-email, input[name="email"]', target: { type: 'selector', value: '#input-user-email' }, fieldType: 'email', confidence: 0.95 },
            { action: 'fill', type: 'fill', selector: '#input-user-phone, input[name="phone"]', target: { type: 'selector', value: '#input-user-phone' }, fieldType: 'phone', confidence: 0.95 },
            { action: 'fill', type: 'fill', selector: '#input-user-aadhaar, input[name="aadhaar"]', target: { type: 'selector', value: '#input-user-aadhaar' }, fieldType: 'aadhaar', confidence: 0.95 },
            { action: 'fill', type: 'fill', selector: '#input-user-address, input[name="address"]', target: { type: 'selector', value: '#input-user-address' }, fieldType: 'address', confidence: 0.95 }
          ]
        };
      } else if (lowerTask.includes('click') || lowerTask.includes('press')) {
        if (lowerTask.includes('submit')) {
          resultJson = {
            type: 'response',
            text: 'PrivacyShield Safety Policy: Form submissions cannot be performed autonomously. Please review the details and submit manually.'
          };
        } else {
          const buttons = (screenStructure?.elements || []).filter(e => e.type === 'button');
          const safeBtns = buttons.filter(b => !(b.label || b.selector || '').toLowerCase().includes('submit'));
          const btn = safeBtns[0] || buttons[0];
          resultJson = {
            type: 'action',
            actions: btn ? [{
              action: 'click',
              type: 'click',
              selector: btn.selector,
              target: { type: 'selector', value: btn.selector },
              confidence: 0.94
            }] : []
          };
        }
      } else {
        resultJson = {
          type: 'response',
          text: `[PrivacyShield Vision Agent]\nAnalyzed ${screenStructure?.totalElements || 0} UI elements for task: "${task}".\n\nIdentified page classification: ${pageClassification?.pageType || 'General Page'}.\nAll sensitive PII was scrubbed locally on device before transmission.`
        };
      }
    }

    const duration = Date.now() - startTime;
    return res.json({
      success: true,
      data: resultJson,
      type: resultJson.type,
      durationMs: duration,
      sanitizedTokensCount: ((sanitizedText || '').match(/\[[A-Z0-9_]+\]/g) || []).length
    });

  } catch (err) {
    console.error('[Proxy Error]:', err);
    return res.status(500).json({
      success: false,
      error: err.message,
      hint: 'Check your API key and proxy server logs in server/.'
    });
  }
});

app.listen(PORT, () => {
  console.log(`====================================================`);
  console.log(`🛡️  PrivacyShield VLM Proxy Server running on port ${PORT}`);
  console.log(`📡 Endpoint: http://localhost:${PORT}/api/agent`);
  console.log(`🩺 Health:   http://localhost:${PORT}/health`);
  console.log(`🔑 Model:    ${GEMINI_MODEL}`);
  console.log(`====================================================`);
});
