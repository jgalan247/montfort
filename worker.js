/**
 * Cloudflare Worker — Monty Tadier Campaign Survey Proxy
 * 3-tier logic: reject abuse → response bank → Haiku fallback
 *
 * DEPLOY INSTRUCTIONS:
 * 1. Go to workers.cloudflare.com → Create Worker
 * 2. Paste this entire file
 * 3. Click Settings → Variables → Add:
 *      ANTHROPIC_API_KEY = sk-ant-your-key-here
 * 4. Save & Deploy
 */

const ALLOWED_ORIGIN = '*'; // Restrict to your domain later e.g. 'https://montytadier.github.io'

const SYSTEM_PROMPT = `You are a warm, friendly campaign assistant for Monty Tadier, Reform Jersey Deputy candidate for St Brelade in the 2026 Jersey election. Conduct a short survey as a natural conversation — not a stiff form. Ask ONE question at a time. Keep replies to 2-3 sentences max.

IMPORTANT: The user has already seen a welcome greeting and been asked their age group. Their first message is their answer to that question. Do NOT re-introduce yourself or welcome them again. Jump straight into acknowledging their answer and continuing the survey.

Follow this sequence exactly:
1. The user's first message is their age group answer — acknowledge it briefly, then ask their single biggest concern for Jersey (housing / cost of living / environment / healthcare / education / economy / other)
2. Ask them to rate satisfaction with housing availability in Jersey, 1 (very poor) to 5 (very good)
3. Ask: what one thing would most improve daily life in St Brelade or Jersey?
4. Ask: does the Jersey government listen to ordinary islanders? (yes / somewhat / no)
5. Ask if they'd like campaign updates from Monty — if yes, ask for email (clearly optional)
6. Thank them warmly. Say their response has been recorded and will directly inform Monty's campaign. Sign off warmly.

Rules: never ask two questions at once. Acknowledge each answer briefly. Sound human. Do not re-introduce yourself. After step 6, do not ask more questions.`;

// ── TIER 1: Abuse / off-topic filter ────────────────────────────
const ABUSE_PATTERNS = [
  /\b(fuck|shit|cunt|bastard|wanker|arsehole|asshole|dick|piss\s?off|bollocks|twat)\b/i,
  /\b(kill|die|bomb|attack|threat)\b/i,
  /\b(nigger|faggot|retard)\b/i,
];

const OFFTOPIC_PATTERNS = [
  /\b(tell me a joke|sing|poem|story|recipe|write me|code|program|translate|what is the meaning of life)\b/i,
  /\b(who is the president|capital of|how to hack|bitcoin|crypto|lottery)\b/i,
  /\b(ignore (previous|all|your) (instructions|prompt|rules))\b/i,
  /\b(you are now|act as|pretend to be|new persona|jailbreak|DAN)\b/i,
  /\b(system prompt|reveal your|what are your instructions)\b/i,
];

const REDIRECT_MSG = "Let's keep things on track! I'm here to help with Monty's campaign survey. Could you answer the question above so we can continue?";
const ABUSE_MSG = "I'd appreciate it if we could keep things respectful. Let's get back to the survey — could you answer the question above?";

function isAbusive(text) {
  return ABUSE_PATTERNS.some(p => p.test(text));
}

function isOffTopic(text) {
  return OFFTOPIC_PATTERNS.some(p => p.test(text));
}

// ── TIER 2: Response bank ───────────────────────────────────────
// Detect which survey step we're on based on how many assistant
// messages have been sent (including the welcome in the client).
// Step count = number of assistant messages so far:
//   1 = welcome already shown → user answering age group
//   2 = age acknowledged     → user answering concern
//   3 = concern acknowledged → user answering housing rating
//   4 = rating acknowledged  → user answering freeform improvement
//   5 = improvement acknowledged → user answering "does govt listen"
//   6 = listening acknowledged   → user answering updates/email
//   7 = thank you / done

function detectStep(messages) {
  const assistantCount = messages.filter(m => m.role === 'assistant').length;
  // The user's latest message is a reply to the last assistant message,
  // so the step they're answering = assistantCount
  return assistantCount;
}

const AGE_GROUPS = /(18|19|20|21|22|23|24|25|26|27|28|29|30|31|32|33|34|35|36|37|38|39|40|41|42|43|44|45|46|47|48|49|50|51|52|53|54|55|56|57|58|59|60|61|62|63|64|65|70|75|80)/;
const AGE_LABELS = /\b(18\s*[-–to]+\s*24|25\s*[-–to]+\s*34|35\s*[-–to]+\s*49|50\s*[-–to]+\s*64|65\s*\+|over 65|under 25|young|older|retired|teenager)\b/i;

const CONCERNS = {
  housing:        /\b(housing|house|homes?|rent|tenant|landlord|property|accommodation)\b/i,
  cost_of_living: /\b(cost of living|expensive|prices?|afford|inflation|wages?|salary|income|money|bills?)\b/i,
  environment:    /\b(environment|climate|green|pollution|nature|wildlife|carbon|recycling|sustainability)\b/i,
  healthcare:     /\b(health\s*care|hospital|doctor|GP|NHS|medical|mental health|dentist|waiting list)\b/i,
  education:      /\b(education|school|teacher|university|college|learning|students?|curriculum)\b/i,
  economy:        /\b(economy|jobs?|employment|unemployment|business|growth|recession|finance|tax)\b/i,
};

const RATINGS = /^[1-5]$|^\b(one|two|three|four|five|1|2|3|4|5)\b/i;
const RATING_MAP = { one: '1', two: '2', three: '3', four: '4', five: '5' };

const GOVT_LISTEN = /\b(yes|no|somewhat|sort of|kind of|not really|sometimes|maybe|a bit|definitely not|absolutely not|nope|yeah|nah)\b/i;

const UPDATES_YES = /\b(yes|yeah|sure|ok|please|yep|absolutely|definitely|love to|go ahead|why not)\b/i;
const UPDATES_NO  = /\b(no|nah|nope|not really|no thanks|pass|skip|rather not|don't want)\b/i;
const EMAIL_PATTERN = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;

function tryResponseBank(messages) {
  const step = detectStep(messages);
  const userMsg = messages[messages.length - 1];
  if (!userMsg || userMsg.role !== 'user') return null;
  const text = userMsg.content.trim();
  const lower = text.toLowerCase();

  switch (step) {
    // Step 1: User answering age group
    case 1: {
      if (AGE_LABELS.test(text) || AGE_GROUPS.test(text)) {
        return {
          content: [{ type: 'text', text: `Thanks for that! Now, what would you say is your single biggest concern for Jersey right now? For example: housing, cost of living, environment, healthcare, education, economy — or something else entirely?` }]
        };
      }
      return null; // unclear answer → let Haiku handle
    }

    // Step 2: User answering biggest concern
    case 2: {
      let matched = null;
      for (const [key, pattern] of Object.entries(CONCERNS)) {
        if (pattern.test(text)) { matched = key; break; }
      }
      if (matched) {
        const label = matched.replace(/_/g, ' ');
        return {
          content: [{ type: 'text', text: `${label.charAt(0).toUpperCase() + label.slice(1)} — that's a big one, and something Monty feels strongly about too. Next question: how would you rate your satisfaction with housing availability in Jersey? 1 being very poor, 5 being very good.` }]
        };
      }
      // "other" or a freeform concern
      if (lower.length > 2 && lower.length < 200) {
        return {
          content: [{ type: 'text', text: `That's a really valid concern — thank you for sharing. Now, how would you rate your satisfaction with housing availability in Jersey? 1 being very poor, 5 being very good.` }]
        };
      }
      return null;
    }

    // Step 3: User answering housing rating
    case 3: {
      const numMatch = text.match(/[1-5]/);
      const wordMatch = lower.match(/\b(one|two|three|four|five)\b/);
      const rating = numMatch ? numMatch[0] : (wordMatch ? RATING_MAP[wordMatch[1]] : null);
      if (rating) {
        const comments = {
          '1': "That's a really low score — clearly housing is a real struggle.",
          '2': "Below average — sounds like there's a lot of room for improvement.",
          '3': "Middle of the road — not terrible but not great either.",
          '4': "Not bad, though there's always room for improvement.",
          '5': "Good to hear you feel it's in a decent place."
        };
        return {
          content: [{ type: 'text', text: `${comments[rating]} Here's the big one: what one thing would most improve daily life in St Brelade or Jersey for you?` }]
        };
      }
      return null;
    }

    // Step 4: Freeform — "what would improve daily life"
    // Always send to Haiku so it can respond naturally to open-ended input
    case 4:
      return null;

    // Step 5: "Does the government listen?"
    case 5: {
      if (GOVT_LISTEN.test(text)) {
        return {
          content: [{ type: 'text', text: `Understood — that's really useful feedback. Last thing: would you like to receive campaign updates from Monty? If so, just pop your email below. Totally optional — no pressure at all!` }]
        };
      }
      return null;
    }

    // Step 6: Updates / email
    case 6: {
      const email = text.match(EMAIL_PATTERN);
      if (email) {
        return {
          content: [{ type: 'text', text: `Brilliant — we've noted ${email[0]}. Thank you so much for taking the time to share your views! Your response has been recorded and will directly inform Monty's campaign priorities. All the best! 🙏` }]
        };
      }
      if (UPDATES_NO.test(text)) {
        return {
          content: [{ type: 'text', text: `No problem at all! Thank you so much for taking the time to share your views — it really does make a difference. Your response has been recorded and will directly inform Monty's campaign. All the best! 🙏` }]
        };
      }
      if (UPDATES_YES.test(text)) {
        return {
          content: [{ type: 'text', text: `Great! Just drop your email address below and we'll keep you in the loop. Completely optional of course.` }]
        };
      }
      return null;
    }

    default:
      return null;
  }
}

// ── Main handler ────────────────────────────────────────────────
export default {
  async fetch(request, env) {

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        }
      });
    }

    // Only POST /chat
    const url = new URL(request.url);
    if (request.method !== 'POST' || url.pathname !== '/chat') {
      return new Response('Not found', { status: 404 });
    }

    try {
      const body = await request.json();
      const { messages } = body;

      if (!messages || !Array.isArray(messages)) {
        return new Response(JSON.stringify({ error: 'Invalid request' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      const lastMsg = messages[messages.length - 1];
      const userText = (lastMsg && lastMsg.role === 'user') ? lastMsg.content : '';

      // ── TIER 1: Reject abuse / off-topic ──
      if (userText && isAbusive(userText)) {
        return respond(ABUSE_MSG);
      }
      if (userText && isOffTopic(userText)) {
        return respond(REDIRECT_MSG);
      }
      // Block very long messages (token waste / prompt injection)
      if (userText && userText.length > 500) {
        return respond("That's quite a long message! Could you keep your answer a bit shorter so we can continue with the survey?");
      }

      // ── TIER 2: Response bank ──
      const banked = tryResponseBank(messages);
      if (banked) {
        return new Response(JSON.stringify(banked), {
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
          }
        });
      }

      // ── TIER 3: Haiku fallback ──
      const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 300,
          system: SYSTEM_PROMPT,
          messages: messages
        })
      });

      const data = await anthropicRes.json();

      return new Response(JSON.stringify(data), {
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
        }
      });

    } catch (err) {
      return new Response(JSON.stringify({ error: 'Server error' }), {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
        }
      });
    }
  }
};

// Helper: return a canned response in the same format the client expects
function respond(text) {
  return new Response(JSON.stringify({
    content: [{ type: 'text', text }]
  }), {
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
    }
  });
}
