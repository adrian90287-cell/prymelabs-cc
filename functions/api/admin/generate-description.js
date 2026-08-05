import { adminAuth } from '../../_utils/legacyAdminAuth.js'
import { corsHeaders, json } from '../../_utils/cors.js'
import { checkAdminRateLimit, adminRateLimitKey } from '../../_utils/adminRateLimit.js'


export async function onRequestPost({ request, env }) {
  if (!await adminAuth(request, env)) return json({ error: 'Unauthorized' }, 401)

  // Metered Workers AI call — throttle independently of login rate limiting
  // so a leaked/abused session can't drive unbounded AI spend.
  const rl = await checkAdminRateLimit(env, adminRateLimitKey(request, 'ai-generate'))
  if (rl.blocked) return json({ error: `Too many requests. Try again in ${Math.ceil(rl.retryAfter)}s.` }, 429)

  let body
  try { body = await request.json() } catch { return json({ error: 'Invalid JSON' }, 400) }

  const { name, category, size, department, field } = body
  if (!name) return json({ error: 'name required' }, 400)

  const isTagline = field === 'tagline'
  const cat = category || ''
  const sizeStr = size ? ` (${size})` : ''
  const dept = ['Peptides', 'Health & Wellness', 'Beauty & Grooming'].includes(department) ? department : 'Peptides'

  // Voice + rules per department so a cosmetic isn't described like a peptide.
  const STYLE = {
    'Peptides': {
      system: 'You are a professional scientific copywriter for a peptide research supply company. Write clear, factual, varied research copy. Never repeat boilerplate. Never mention human use, medical/therapeutic claims, dosing for people, purity specs, or "research use only" disclaimers — those live elsewhere on the page.',
      tagline: `Write a single punchy one-line tagline (4-7 words, no ending period) for a research peptide called "${name}"${sizeStr} in the category "${cat || 'Research Supplies'}". Highlight ONE specific research property, mechanism, or use case that makes it distinct — vary the angle. No purity, no disclaimers, no human/medical claims. Output only the tagline.`,
      desc: `Write a concise 2-sentence product description for a research peptide called "${name}"${sizeStr} in the category "${cat || 'Research Supplies'}". Focus on known research applications and properties. Professional, factual, scientific. No human/medical/therapeutic claims. Output only the description.`,
    },
    'Health & Wellness': {
      system: 'You are a professional copywriter for a premium health & wellness supplement brand. Write appealing, benefit-oriented copy. Stay FDA-compliant: never claim to diagnose, treat, cure, or prevent any disease. Use supportive language like "supports", "helps maintain", "promotes". You may mention key ingredients and general daily use. Never repeat boilerplate.',
      tagline: `Write a single punchy one-line tagline (4-7 words, no ending period) for a dietary/wellness supplement called "${name}"${sizeStr} in the category "${cat || 'General Wellness'}". Highlight ONE appealing everyday-wellness benefit. No disease/treatment claims. Output only the tagline.`,
      desc: `Write a concise 2-3 sentence product description for a dietary supplement called "${name}"${sizeStr} in the category "${cat || 'General Wellness'}". Say what it is, its key everyday-wellness benefit, and briefly how/when to take it. Benefit-oriented and compliant — no claims to diagnose, treat, cure, or prevent disease. Output only the description.`,
    },
    'Beauty & Grooming': {
      system: 'You are a professional copywriter for a premium skincare, hair-care, and men\'s grooming brand. Write sensory, benefit-oriented copy tailored to the exact product type (skincare, hair care, hair styling, beard care, body care, cleansers, toners, serums, moisturizers, soaps). Describe texture, finish, feel, and who it\'s for. Avoid medical or therapeutic claims. Never repeat boilerplate.',
      tagline: `Write a single punchy one-line tagline (4-7 words, no ending period) for a "${cat || 'personal care'}" product called "${name}"${sizeStr}. Match the voice to a ${cat || 'grooming'} product (e.g. hold/texture for styling, hydration for moisturizers, conditioning for beard care, deep-clean for cleansers). Highlight ONE appealing benefit or feel. No medical claims. Output only the tagline.`,
      desc: `Write a concise 2-3 sentence product description for a "${cat || 'personal care'}" product called "${name}"${sizeStr}. Match the voice to a ${cat || 'grooming'} product — describe its texture/finish, the core benefit (e.g. hold, hydration, cleansing, softening, exfoliation), and how to use it. Sensory and appealing. No medical/therapeutic claims. Output only the description.`,
    },
  }
  const style = STYLE[dept]
  const prompt = isTagline ? style.tagline : style.desc

  try {
    const response = await env.AI.run('@cf/meta/llama-3.1-8b-instruct-fp8', {
      messages: [
        { role: 'system', content: style.system },
        { role: 'user', content: prompt },
      ],
      max_tokens: isTagline ? 30 : 170,
      temperature: isTagline ? 0.9 : 0.7,
    })
    let text = response?.response?.trim().replace(/^["']|["']$/g, '') || ''
    if (isTagline) {
      // Strip any boilerplate the model bolts on despite instructions
      text = text
        .split('·').map(s => s.trim())
        .filter(s => !/purity|research use only|laboratory use only|not for human/i.test(s))
        .join(' · ')
    }
    return json(isTagline ? { tagline: text } : { description: text })
  } catch (err) {
    return json({ error: 'AI generation failed', details: String(err) }, 500)
  }
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: corsHeaders })
}
