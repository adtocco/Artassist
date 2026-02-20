import express from 'express';
import bodyParser from 'body-parser';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(bodyParser.json({ limit: '50mb' }));

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE) {
  console.warn('Warning: SUPABASE_URL and SUPABASE_SERVICE_ROLE must be provided as env vars.');
}
if (!OPENAI_API_KEY) {
  console.warn('Warning: OPENAI_API_KEY not set — photo analysis will fail.');
}
if (!ANTHROPIC_API_KEY) {
  console.warn('Warning: ANTHROPIC_API_KEY not set — collection/series/wall analysis will fail.');
}

const supabaseAdmin = SUPABASE_URL && SUPABASE_SERVICE_ROLE 
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE, { auth: { persistSession: false } })
  : null;

const openai = OPENAI_API_KEY ? new OpenAI({ apiKey: OPENAI_API_KEY }) : null;
const anthropic = ANTHROPIC_API_KEY ? new Anthropic({ apiKey: ANTHROPIC_API_KEY }) : null;

// ─── Prompt constants ────────────────────────────────────────────────────────

const SYSTEM_PROMPTS = {
  artist: `Vous êtes un critique d'art expert analysant des photographies d'un point de vue artistique.
Concentrez-vous sur : la composition, l'éclairage, la théorie des couleurs, l'impact émotionnel,
l'exécution technique, l'originalité et le mérite artistique.

IMPORTANT : Analysez TOUJOURS la photo d'un point de vue artistique, même si elle contient des personnes.
Ne tentez JAMAIS d'identifier les personnes. Analysez uniquement les aspects techniques et artistiques de l'image.`,

  gallery: `Vous êtes un conservateur de galerie évaluant des photographies pour leur potentiel d'exposition.
Concentrez-vous sur : commercialisabilité, attrait en galerie, cohérence thématique, impact visuel
dans l'espace d'exposition, intérêt des collectionneurs et adéquation avec les tendances du marché.

IMPORTANT : Analysez TOUJOURS la photo, même si elle contient des personnes. Ne tentez pas de les identifier,
analysez uniquement la qualité artistique et le potentiel d'exposition.`,

  socialMedia: `Vous êtes un·e stratège en médias sociaux analysant des photographies pour l'engagement en ligne.
Concentrez-vous sur : l'attrait visuel pour les plateformes, partageabilité, esthétiques tendance,
résonance émotionnelle pour le public en ligne, potentiel de hashtags et probabilité de viralité.

IMPORTANT : Analysez TOUJOURS la photo pour son potentiel sur les réseaux sociaux, même si elle contient des personnes.
Ne tentez pas de les identifier, analysez uniquement l'impact visuel et l'engagement potentiel.`
};

const COLLECTION_ANALYSIS_PROMPTS = {
  general: {
    fr: `Vous êtes un critique d'art expert. Analysez cette photographie de manière complète en couvrant tous les aspects artistiques : composition, lumière, couleurs, émotion et technique.`,
    en: `You are an expert art critic. Analyze this photograph comprehensively, covering all artistic aspects: composition, lighting, colors, emotion, and technique.`
  },
  series: {
    fr: `Vous êtes un conservateur d'art spécialisé dans les séries photographiques. Analysez cette photo en considérant comment elle pourrait s'intégrer dans une série cohérente. Évaluez les éléments visuels récurrents potentiels, les thèmes narratifs, et la cohérence stylistique.`,
    en: `You are an art curator specialized in photographic series. Analyze this photo considering how it could fit into a coherent series. Evaluate potential recurring visual elements, narrative themes, and stylistic consistency.`
  },
  technique: {
    fr: `Vous êtes un expert technique en photographie. Concentrez votre analyse sur : la maîtrise technique (netteté, exposition, balance des blancs), l'utilisation de l'équipement, le post-traitement, les réglages apparents (ouverture, vitesse, ISO), et les suggestions d'amélioration technique.`,
    en: `You are a technical photography expert. Focus your analysis on: technical mastery (sharpness, exposure, white balance), equipment usage, post-processing, apparent settings (aperture, speed, ISO), and technical improvement suggestions.`
  },
  composition: {
    fr: `Vous êtes un expert en composition visuelle. Analysez en profondeur : la règle des tiers, les lignes directrices, le point focal, l'équilibre visuel, l'espace négatif, le cadrage, la perspective, et comment ces éléments guident le regard du spectateur.`,
    en: `You are a visual composition expert. Analyze in depth: rule of thirds, leading lines, focal point, visual balance, negative space, framing, perspective, and how these elements guide the viewer's eye.`
  },
  color: {
    fr: `Vous êtes un expert en colorimétrie et théorie des couleurs. Analysez : la palette de couleurs dominante, l'harmonie chromatique (complémentaire, analogue, triadique), la température des couleurs, la saturation, le contraste colorimétrique, et l'impact émotionnel des choix de couleurs.`,
    en: `You are a colorimetry and color theory expert. Analyze: dominant color palette, chromatic harmony (complementary, analogous, triadic), color temperature, saturation, color contrast, and the emotional impact of color choices.`
  },
  style: {
    fr: `Vous êtes un historien de l'art et critique spécialisé dans les styles photographiques. Identifiez : le courant artistique apparent, les influences stylistiques, les références à des photographes ou mouvements connus, l'originalité de la vision, et comment le style contribue au message de l'image.`,
    en: `You are an art historian and critic specialized in photographic styles. Identify: apparent artistic movement, stylistic influences, references to known photographers or movements, originality of vision, and how style contributes to the image's message.`
  },
  custom: {
    fr: `Vous êtes un critique d'art expert. Suivez attentivement les instructions personnalisées fournies pour votre analyse.`,
    en: `You are an expert art critic. Carefully follow the custom instructions provided for your analysis.`
  },
  artist: {
    fr: `Vous êtes un critique d'art expert analysant des photographies d'un point de vue artistique. Concentrez-vous sur : la composition, l'éclairage, la théorie des couleurs, l'impact émotionnel, l'exécution technique, l'originalité et le mérite artistique.`,
    en: `You are an expert art critic analyzing photographs from an artistic perspective. Focus on: composition, lighting, color theory, emotional impact, technical execution, originality, and artistic merit.`
  },
  socialMedia: {
    fr: `Vous êtes un·e stratège en marketing digital et réseaux sociaux spécialisé·e dans le contenu visuel. Analysez cette photographie sous l'angle marketing et engagement :

FOCUS MARKETING :
- Potentiel d'engagement (likes, partages, commentaires)
- Attrait visuel immédiat et capacité à capter l'attention dans un feed
- Émotions déclenchées propices à l'interaction
- Storytelling marketing : quelle histoire/message cette image véhicule-t-elle ?
- Ciblage d'audience : quel public cette image attirera-t-elle ?
- Call-to-action implicite : qu'est-ce que cette image inspire à faire ?
- Cohérence avec les tendances visuelles actuelles des réseaux sociaux
- Optimisation pour différentes plateformes (Instagram, Facebook, LinkedIn, TikTok)
- Potentiel de viralité et partageabilité
- Suggestions de hashtags pertinents et stratégie de publication

Évaluez comment cette photo peut servir des objectifs marketing : notoriété de marque, génération de leads, engagement communautaire, ou conversion.`,
    en: `You are a digital marketing and social media strategist specialized in visual content. Analyze this photograph from a marketing and engagement perspective:

MARKETING FOCUS:
- Engagement potential (likes, shares, comments)
- Immediate visual appeal and feed-stopping power
- Emotions triggered that encourage interaction
- Marketing storytelling: what story/message does this image convey?
- Audience targeting: which demographics will this image attract?
- Implicit call-to-action: what does this image inspire people to do?
- Alignment with current social media visual trends
- Optimization for different platforms (Instagram, Facebook, LinkedIn, TikTok)
- Virality potential and shareability
- Relevant hashtag suggestions and posting strategy

Evaluate how this photo can serve marketing objectives: brand awareness, lead generation, community engagement, or conversion.`
  }
};

// ─── JSON structures for photo analysis ──────────────────────────────────────

const JSON_STRUCTURE_FR = `IMPORTANT: Répondez UNIQUEMENT avec un objet JSON valide (sans texte avant ou après) avec cette structure exacte:
{
  "name": "Titre Évocateur",
  "appreciation": "Bonne",
  "summary": "Une phrase résumant l'impression générale de l'image.",
  "story": "Une histoire en 2 lignes qui raconte ce que cette image évoque, comme un récit imaginaire inspiré par la scène.",
  "composition": "Analyse de la composition, cadrage, règle des tiers, lignes directrices...",
  "lighting": "Analyse de l'éclairage, contrastes, ombres, lumière naturelle/artificielle...",
  "colors": "Analyse des couleurs, harmonie, palette, saturation, température...",
  "emotion": "Impact émotionnel, atmosphère, sentiment transmis...",
  "technique": "Qualité technique, netteté, exposition, profondeur de champ...",
  "strengths": ["Point fort 1", "Point fort 2", "Point fort 3"],
  "improvements": ["Suggestion d'amélioration 1", "Suggestion d'amélioration 2"]
}

Règles:
- "name": titre poétique de 1 à 3 mots capturant l'essence de la photo
- "appreciation": UNE seule appréciation parmi les suivantes (en respectant exactement l'orthographe) :
  * "Insuffisante" : Photo ratée (floue, mal exposée, sans intérêt)
  * "Faible" : Photo avec des défauts majeurs, peu d'intérêt artistique
  * "Moyenne" : Photo correcte mais banale, manque d'originalité
  * "Bonne" : Maîtrise technique, quelques qualités artistiques notables
  * "Très bonne" : Composition soignée, vrai regard artistique
  * "Excellente" : Maîtrise remarquable, forte émotion, originalité
  * "Exceptionnelle" : Chef-d'œuvre, digne d'une exposition majeure
  Soyez STRICT : une photo amateur typique devrait recevoir "Moyenne" ou "Bonne". Réservez "Excellente" et "Exceptionnelle" aux photos véritablement remarquables.
- "story": exactement 2 lignes racontant une histoire imaginaire inspirée par la photo
- Chaque champ texte: 1-3 phrases concises et pertinentes
- "strengths": exactement 3 points forts
- "improvements": exactement 2 suggestions concrètes d'amélioration`;

const JSON_STRUCTURE_EN = `IMPORTANT: Respond ONLY with a valid JSON object (no text before or after) with this exact structure:
{
  "name": "Evocative Title",
  "appreciation": "Good",
  "summary": "One sentence summarizing the overall impression of the image.",
  "story": "A 2-line story that narrates what this image evokes, like an imaginary tale inspired by the scene.",
  "composition": "Analysis of composition, framing, rule of thirds, leading lines...",
  "lighting": "Analysis of lighting, contrasts, shadows, natural/artificial light...",
  "colors": "Analysis of colors, harmony, palette, saturation, temperature...",
  "emotion": "Emotional impact, atmosphere, conveyed feeling...",
  "technique": "Technical quality, sharpness, exposure, depth of field...",
  "strengths": ["Strength 1", "Strength 2", "Strength 3"],
  "improvements": ["Improvement suggestion 1", "Improvement suggestion 2"]
}

Rules:
- "name": poetic title of 1 to 3 words capturing the essence of the photo
- "appreciation": ONE single appreciation from the following (use exact spelling):
  * "Insufficient": Failed photo (blurry, badly exposed, no interest)
  * "Weak": Major flaws, little artistic interest
  * "Average": Adequate but unremarkable, lacks originality
  * "Good": Technical mastery, some notable artistic qualities
  * "Very good": Careful composition, genuine artistic vision
  * "Excellent": Remarkable mastery, strong emotion, originality
  * "Exceptional": Masterpiece, worthy of a major exhibition
  Be STRICT: a typical amateur photo should receive "Average" or "Good". Reserve "Excellent" and "Exceptional" for truly remarkable photos.
- "story": exactly 2 lines narrating an imaginary story inspired by the photo
- Each text field: 1-3 concise and relevant sentences
- "strengths": exactly 3 strengths
- "improvements": exactly 2 concrete improvement suggestions`;

const JSON_STRUCTURE_MARKETING_FR = `IMPORTANT: Répondez UNIQUEMENT avec un objet JSON valide (sans texte avant ou après) avec cette structure exacte pour une ANALYSE MARKETING / RÉSEAUX SOCIAUX:
{
  "name": "Titre Accrocheur",
  "appreciation": "Bon potentiel",
  "summary": "Une phrase résumant le potentiel de viralité et d'engagement de l'image.",
  "subject": "Description claire et précise du sujet/objet principal de la photo et ce qu'il représente.",
  "marketing": "Analyse marketing complète : potentiel d'engagement (likes, partages, commentaires), public cible, émotions déclenchées, optimisation multi-plateformes (Instagram, Facebook, LinkedIn, TikTok), potentiel de viralité, objectifs marketing (notoriété/leads/conversion).",
  "hashtags": ["#hashtag1", "#hashtag2", "#hashtag3", "#hashtag4", "#hashtag5", "#hashtag6", "#hashtag7", "#hashtag8", "#hashtag9", "#hashtag10"],
  "captions": [
    "Première proposition de texte pour accompagner la photo sur les réseaux sociaux. Engageant et accrocheur.",
    "Deuxième proposition de texte, avec un angle différent ou un ton plus formel/professionnel.",
    "Troisième proposition de texte, peut-être plus créatif ou avec un call-to-action."
  ],
  "strengths": ["Point fort marketing 1", "Point fort marketing 2", "Point fort marketing 3"],
  "improvements": ["Suggestion d'amélioration pour plus d'impact 1", "Suggestion d'amélioration pour plus d'impact 2"]
}

Règles:
- "name": titre accrocheur de 1 à 3 mots pour les réseaux sociaux
- "appreciation": UNE seule appréciation de VIRALITÉ / ENGAGEMENT parmi les suivantes (en respectant exactement l'orthographe) :
  * "Aucun potentiel" : Image sans intérêt pour les réseaux
  * "Faible potentiel" : Contenu banal, peu partageable
  * "Potentiel modéré" : Correct mais ne se démarque pas dans un feed
  * "Bon potentiel" : Attire l'attention, suscite quelques interactions
  * "Très bon potentiel" : Visuellement percutant, partageable
  * "Excellent potentiel" : Contenu remarquable, forte probabilité de viralité
  * "Potentiel exceptionnel" : Digne de devenir viral à grande échelle
  Soyez STRICT : un contenu moyen devrait recevoir "Potentiel modéré" ou "Bon potentiel". Réservez "Excellent potentiel" et au-dessus aux contenus vraiment percutants.
- "subject": description détaillée du sujet/objet principal de la photo (2-3 phrases)
- "marketing": analyse marketing détaillée et complète (minimum 4-5 phrases)
- "hashtags": exactement 10 hashtags pertinents et populaires, en commençant par #
- "captions": exactement 3 propositions de textes différents pour accompagner la photo
- "strengths": exactement 3 points forts marketing
- "improvements": exactement 2 suggestions pour améliorer l'impact`;

const JSON_STRUCTURE_MARKETING_EN = `IMPORTANT: Respond ONLY with a valid JSON object (no text before or after) with this exact structure for a MARKETING / SOCIAL MEDIA ANALYSIS:
{
  "name": "Catchy Title",
  "appreciation": "Good potential",
  "summary": "One sentence summarizing the virality and engagement potential of the image.",
  "subject": "Clear and precise description of the main subject/object of the photo and what it represents.",
  "marketing": "Complete marketing analysis: engagement potential (likes, shares, comments), target audience, triggered emotions, multi-platform optimization (Instagram, Facebook, LinkedIn, TikTok), virality potential, marketing objectives (awareness/leads/conversion).",
  "hashtags": ["#hashtag1", "#hashtag2", "#hashtag3", "#hashtag4", "#hashtag5", "#hashtag6", "#hashtag7", "#hashtag8", "#hashtag9", "#hashtag10"],
  "captions": [
    "First text proposal to accompany the photo on social media. Engaging and catchy.",
    "Second text proposal, with a different angle or a more formal/professional tone.",
    "Third text proposal, perhaps more creative or with a call-to-action."
  ],
  "strengths": ["Marketing strength 1", "Marketing strength 2", "Marketing strength 3"],
  "improvements": ["Suggestion to improve impact 1", "Suggestion to improve impact 2"]
}

Rules:
- "name": catchy title of 1 to 3 words for social media
- "appreciation": ONE single VIRALITY / ENGAGEMENT appreciation from the following (use exact spelling):
  * "No potential": Image with no social media appeal
  * "Weak potential": Mundane content, not shareable
  * "Moderate potential": Adequate but does not stand out in a feed
  * "Good potential": Catches attention, generates some interactions
  * "Very good potential": Visually striking, shareable
  * "Excellent potential": Remarkable content, high virality probability
  * "Exceptional potential": Worthy of going viral at scale
  Be STRICT: average content should receive "Moderate potential" or "Good potential". Reserve "Excellent potential" and above for truly striking content.
- "subject": detailed description of the main subject/object of the photo (2-3 sentences)
- "marketing": detailed and complete marketing analysis (minimum 4-5 sentences)
- "hashtags": exactly 10 relevant and popular hashtags, starting with #
- "captions": exactly 3 different text proposals to accompany the photo
- "strengths": exactly 3 marketing strengths
- "improvements": exactly 2 suggestions to improve impact`;

// ─── Helper: parse JSON from AI response ─────────────────────────────────────

function extractJSON(content) {
  let jsonStr = content.trim();
  if (jsonStr.includes('```json')) {
    const m = jsonStr.match(/```json\s*([\s\S]*?)\s*```/);
    if (m) jsonStr = m[1].trim();
  } else if (jsonStr.includes('```')) {
    const m = jsonStr.match(/```\s*([\s\S]*?)\s*```/);
    if (m) jsonStr = m[1].trim();
  } else {
    const first = jsonStr.indexOf('{');
    const last = jsonStr.lastIndexOf('}');
    if (first !== -1 && last > first) jsonStr = jsonStr.substring(first, last + 1);
  }
  return jsonStr.trim();
}

// ─── API Endpoints ───────────────────────────────────────────────────────────

// Health check
app.get('/health', (req, res) => res.json({ ok: true }));

/**
 * POST /api/analyze-photo
 * Body: { imageUrl, promptType, lang, collectionAnalysis, userSettings }
 */
app.post('/api/analyze-photo', async (req, res) => {
  try {
    if (!openai) return res.status(503).json({ error: 'OpenAI not configured' });

    const { imageUrl, promptType = 'artist', lang = 'fr', collectionAnalysis = null, userSettings = null } = req.body;
    if (!imageUrl) return res.status(400).json({ error: 'imageUrl is required' });

    let systemPrompt;
    let isSocialMediaAnalysis = false;

    if (userSettings?.prompt_photo_analysis) {
      systemPrompt = userSettings.prompt_photo_analysis;
      isSocialMediaAnalysis = (collectionAnalysis?.type === 'socialMedia') || promptType === 'socialMedia';
    } else if (collectionAnalysis?.type && COLLECTION_ANALYSIS_PROMPTS[collectionAnalysis.type]) {
      systemPrompt = COLLECTION_ANALYSIS_PROMPTS[collectionAnalysis.type][lang] || COLLECTION_ANALYSIS_PROMPTS[collectionAnalysis.type].en;
      isSocialMediaAnalysis = collectionAnalysis.type === 'socialMedia';
      if (collectionAnalysis.type === 'custom' && collectionAnalysis.instructions) {
        systemPrompt += `\n\nInstructions personnalisées : ${collectionAnalysis.instructions}`;
      }
    } else {
      systemPrompt = SYSTEM_PROMPTS[promptType] || SYSTEM_PROMPTS.artist;
      isSocialMediaAnalysis = promptType === 'socialMedia';
    }

    // Apply user settings customizations
    if (userSettings) {
      if (userSettings.analysis_detail_level === 'concise') {
        systemPrompt += `\n\nSTYLE : Soyez concis et direct. Limitez chaque section à 1-2 phrases maximum.`;
      } else if (userSettings.analysis_detail_level === 'detailed') {
        systemPrompt += `\n\nSTYLE : Fournissez une analyse approfondie et détaillée. Développez chaque aspect avec précision.`;
      }
      if (userSettings.analysis_tone === 'friendly') {
        systemPrompt += `\n\nTON : Adoptez un ton amical, encourageant et accessible. Utilisez un langage chaleureux.`;
      } else if (userSettings.analysis_tone === 'technical') {
        systemPrompt += `\n\nTON : Utilisez des termes techniques précis. Soyez spécifique sur les aspects techniques (ISO, ouverture, etc.).`;
      }
      if (userSettings.focus_areas?.length > 0) {
        systemPrompt += `\n\nPRIORITÉS : Accordez une attention particulière à ces aspects : ${userSettings.focus_areas.join(', ')}. Développez-les davantage que les autres aspects.`;
      }
    }

    const languageNote = lang && lang !== 'en' ? `Répondez en français.` : 'Respond in English.';
    let jsonStructure;
    if (isSocialMediaAnalysis) {
      jsonStructure = lang === 'fr' ? JSON_STRUCTURE_MARKETING_FR : JSON_STRUCTURE_MARKETING_EN;
    } else {
      jsonStructure = lang === 'fr' ? JSON_STRUCTURE_FR : JSON_STRUCTURE_EN;
    }

    const response = await openai.chat.completions.create({
      model: "gpt-5.2",
      messages: [
        {
          role: "system",
          content: `${systemPrompt}\n\n${languageNote}\n\n${jsonStructure}`
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: isSocialMediaAnalysis
                ? (lang === 'fr'
                  ? 'Analysez cette photographie pour une utilisation sur les réseaux sociaux. Évaluez son potentiel marketing, proposez des hashtags pertinents et 3 textes d\'accompagnement différents.'
                  : 'Analyze this photograph for social media use. Evaluate its marketing potential, suggest relevant hashtags and 3 different caption texts.')
                : (lang === 'fr'
                  ? 'Analysez cette photographie d\'un point de vue artistique et technique. Si la photo contient des personnes, analysez la composition, la posture, l\'expression et l\'émotion sans chercher à identifier qui elles sont.'
                  : 'Analyze this photograph from an artistic and technical perspective. If the photo contains people, analyze the composition, posture, expression, and emotion without attempting to identify who they are.')
            },
            {
              type: "image_url",
              image_url: { url: imageUrl }
            }
          ]
        }
      ],
      max_completion_tokens: 2000
    });

    const content = response.choices[0]?.message?.content;
    if (!content) return res.status(500).json({ error: 'Empty response from OpenAI' });

    try {
      const jsonStr = extractJSON(content);
      const parsed = JSON.parse(jsonStr);
      return res.json({
        name: parsed.name || (lang === 'fr' ? 'Sans titre' : 'Untitled'),
        analysis: JSON.stringify({
          appreciation: parsed.appreciation || (lang === 'fr' ? 'Non évaluée' : 'Not rated'),
          summary: parsed.summary || '',
          story: parsed.story || '',
          subject: parsed.subject || null,
          marketing: parsed.marketing || null,
          hashtags: parsed.hashtags || null,
          captions: parsed.captions || null,
          composition: parsed.composition || '',
          lighting: parsed.lighting || '',
          colors: parsed.colors || '',
          emotion: parsed.emotion || '',
          technique: parsed.technique || '',
          strengths: parsed.strengths || [],
          improvements: parsed.improvements || []
        })
      });
    } catch (parseError) {
      return res.json({
        name: lang === 'fr' ? 'Sans titre' : 'Untitled',
        analysis: JSON.stringify({
          score: 0,
          summary: content,
          composition: '',
          lighting: '',
          colors: '',
          emotion: '',
          technique: '',
          strengths: [],
          improvements: []
        })
      });
    }
  } catch (error) {
    console.error('Error in /api/analyze-photo:', error);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

/**
 * POST /api/analyze-collection
 * Body: { analyses, lang, instructions, userSettings, analysisType }
 * analysisType: 'collection' | 'series'
 */
app.post('/api/analyze-collection', async (req, res) => {
  try {
    if (!anthropic) return res.status(503).json({ error: 'Anthropic not configured' });

    const { analyses, lang = 'fr', instructions = '', userSettings = null, analysisType = 'collection' } = req.body;
    if (!analyses || !Array.isArray(analyses)) return res.status(400).json({ error: 'analyses array is required' });

    const photoList = analyses.map((a) => {
      const name = a.photo_name || a.file_name || 'Sans titre';
      const url = a.photo_url || '';
      return { name, url, analysis: a.analysis };
    });

    const analysisTexts = photoList.map(p => `"${p.name}" (URL: ${p.url}): ${p.analysis}`).join('\n\n');
    const photoNames = photoList.map(p => p.name).join(', ');

    const languageNote = lang && lang !== 'en' ? `Veuillez répondre en ${lang === 'fr' ? 'français' : lang}.` : 'Please respond in English.';
    const instructionNote = instructions?.trim()
      ? (lang === 'fr'
          ? `Consignes supplémentaires pour l'analyse de la série : ${instructions}`
          : `Additional instructions for the series analysis: ${instructions}`)
      : '';
    const hasCustomInstructions = instructions?.trim();
    const namingInstruction = lang === 'fr'
      ? `IMPORTANT: Utilisez TOUJOURS les noms exacts des photos (${photoNames}) pour les identifier, jamais "Photo 1", "Photo 2", etc.`
      : `IMPORTANT: ALWAYS use the exact photo names (${photoNames}) to identify them, never "Photo 1", "Photo 2", etc.`;

    let basePrompt;
    if (analysisType === 'series' && userSettings?.prompt_series_analysis) {
      basePrompt = userSettings.prompt_series_analysis;
    } else if (analysisType === 'collection' && userSettings?.prompt_collection_analysis) {
      basePrompt = userSettings.prompt_collection_analysis;
    } else {
      basePrompt = lang === 'fr'
        ? `Vous êtes un conservateur d'art expert analysant une collection de photographies.\nVotre tâche est d'identifier quelles photos fonctionnent bien ensemble en série, lesquelles sont les plus intéressantes individuellement, et de fournir des raisons claires pour vos recommandations.`
        : `You are an expert art curator analyzing a collection of photographs.\nYour task is to identify which photos work well together as a series, which ones are the most interesting individually, and to provide clear reasons for your recommendations.`;
    }

    // Style modifiers
    let styleModifiers = '';
    if (userSettings) {
      const detailLevel = userSettings.analysis_detail_level || 'balanced';
      const tone = userSettings.analysis_tone || 'professional';
      if (detailLevel === 'concise') {
        styleModifiers += lang === 'fr' ? '\nSTYLE : Soyez concis et direct. Limitez chaque section à 1-2 phrases maximum.' : '\nSTYLE: Be concise and direct. Limit each section to 1-2 sentences maximum.';
      } else if (detailLevel === 'detailed') {
        styleModifiers += lang === 'fr' ? '\nSTYLE : Fournissez une analyse approfondie et détaillée. Développez chaque aspect avec précision.' : '\nSTYLE: Provide a thorough and detailed analysis. Develop each aspect with precision.';
      }
      if (tone === 'friendly') {
        styleModifiers += lang === 'fr' ? '\nTON : Adoptez un ton amical, encourageant et accessible. Utilisez un langage chaleureux.' : '\nTONE: Use a friendly, encouraging and accessible tone. Use warm language.';
      } else if (tone === 'technical') {
        styleModifiers += lang === 'fr' ? '\nTON : Utilisez des termes techniques précis. Soyez spécifique sur les aspects artistiques et techniques.' : '\nTONE: Use precise technical terms. Be specific about artistic and technical aspects.';
      }
    }

    if (analysisType === 'collection') {
      const jsonInstruction = lang === 'fr'
        ? `FORMAT DE RÉPONSE OBLIGATOIRE: Répondez UNIQUEMENT avec un objet JSON valide (sans texte avant ou après, sans bloc markdown \`\`\`json) avec cette structure exacte:
{
  "series": [
    {
      "name": "Nom évocateur de la série",
      "description": "Description de la série et pourquoi ces photos fonctionnent ensemble (2-3 phrases)",
      "photo_names": ["nom_photo_1", "nom_photo_2"],
      "reasoning": "Explication détaillée de la cohérence visuelle, narrative ou thématique"
    }
  ],
  "highlights": [
    {
      "photo_name": "nom_photo",
      "reason": "Pourquoi cette photo est remarquable individuellement"
    }
  ],
  "global_analysis": "Analyse globale de la collection (3-5 phrases) : cohérence, forces, axes d'amélioration, recommandations de présentation"${hasCustomInstructions ? `,
  "custom_instructions_response": "Réponse détaillée aux instructions spécifiques de l'utilisateur (3-6 phrases). Adressez PRÉCISÉMENT la demande : ${instructions.trim().replace(/"/g, '\\"')}"` : ''}
}

Règles:
- "series": proposez entre 1 et 5 séries de 2 à 6 photos chacune
- "photo_names": utilisez EXACTEMENT les noms des photos fournis (${photoNames})
- "highlights": 1 à 3 photos individuellement remarquables
- "name": titre poétique/évocateur pour chaque série
- Chaque photo peut apparaître dans plusieurs séries
- Ne proposez PAS de série avec une seule photo`
        : `MANDATORY RESPONSE FORMAT: Respond ONLY with a valid JSON object (no text before or after, no markdown \`\`\`json block) with this exact structure:
{
  "series": [
    {
      "name": "Evocative series name",
      "description": "Description of the series and why these photos work together (2-3 sentences)",
      "photo_names": ["photo_name_1", "photo_name_2"],
      "reasoning": "Detailed explanation of visual, narrative or thematic coherence"
    }
  ],
  "highlights": [
    {
      "photo_name": "photo_name",
      "reason": "Why this photo is individually remarkable"
    }
  ],
  "global_analysis": "Global analysis of the collection (3-5 sentences): coherence, strengths, improvements, presentation recommendations"${hasCustomInstructions ? `,
  "custom_instructions_response": "Detailed response to the user's specific instructions (3-6 sentences). Address PRECISELY the request: ${instructions.trim().replace(/"/g, '\\"')}"` : ''}
}

Rules:
- "series": propose between 1 and 5 series of 2 to 6 photos each
- "photo_names": use EXACTLY the photo names provided (${photoNames})
- "highlights": 1 to 3 individually remarkable photos
- "name": poetic/evocative title for each series
- Each photo can appear in multiple series
- Do NOT propose a series with only one photo`;

      const systemPrompt = `${basePrompt}${styleModifiers}\n\n${namingInstruction}\n\n${jsonInstruction}\n\n${languageNote}`;
      const userMessage = `${instructionNote}\n\nAnalyses des photos de la collection:\n${analysisTexts}`;

      const response = await anthropic.messages.create({
        model: "claude-opus-4-6",
        max_tokens: 4096,
        system: systemPrompt,
        messages: [{ role: "user", content: userMessage }],
      });

      const content = response.content[0].text;
      try {
        const cleaned = content.replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim();
        const parsed = JSON.parse(cleaned);
        return res.json({ result: JSON.stringify(parsed) });
      } catch {
        return res.json({ result: content });
      }
    }

    // Series analysis — markdown format
    const markdownInstruction = lang === 'fr'
      ? `FORMAT DE RÉPONSE: Utilisez UNIQUEMENT du Markdown pur. N'utilisez JAMAIS de balises HTML (<div>, <img>, <span>, etc.). Pour afficher les photos, utilisez EXCLUSIVEMENT la syntaxe Markdown image: ![nom](url). Placez chaque image sur sa propre ligne.`
      : `RESPONSE FORMAT: Use ONLY pure Markdown. NEVER use HTML tags (<div>, <img>, <span>, etc.). To display photos, use EXCLUSIVELY Markdown image syntax: ![name](url). Place each image on its own line.`;

    const systemPrompt = `${basePrompt}${styleModifiers}\n\n${namingInstruction}\n\n${markdownInstruction}\n\n${languageNote}`;
    const userMessage = `${instructionNote}\n\nSur la base des analyses ci-dessous, merci d'identifier :\n1. Quelles photos fonctionneraient bien ensemble en série (groupes de 2 à 5 photos) - INCLURE les aperçus des photos en Markdown pour chaque série\n2. Quelles photos individuelles sont les plus intéressantes ou puissantes - INCLURE l'aperçu\n3. Recommandations pour organiser ou présenter cette collection\n\nAnalyses:\n${analysisTexts}\n\nVeuillez fournir une sortie structurée avec des recommandations claires. Référencez chaque photo par son nom et incluez les images en Markdown.`;

    const response = await anthropic.messages.create({
      model: "claude-opus-4-6",
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
    });

    return res.json({ result: response.content[0].text });
  } catch (error) {
    console.error('Error in /api/analyze-collection:', error);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

/**
 * POST /api/analyze-wall
 * Body: { wallData, lang, instructions, userSettings }
 */
app.post('/api/analyze-wall', async (req, res) => {
  try {
    if (!anthropic) return res.status(503).json({ error: 'Anthropic not configured' });

    const { wallData, lang = 'fr', instructions = '', userSettings = null } = req.body;
    if (!wallData) return res.status(400).json({ error: 'wallData is required' });

    const { wallName, wallWidthCm, wallHeightCm, backgroundColor, items: wallItems } = wallData;

    const itemDescriptions = wallItems.map((item, idx) => {
      const name = item.photoName || item.fileName || `Photo ${idx + 1}`;
      const widthCm = item.widthCm;
      const heightCm = item.heightCm;
      const xCm = item.xCm;
      const yCm = item.yCm;
      const centerXCm = xCm + widthCm / 2;
      const centerYCm = yCm + heightCm / 2;
      const frame = item.frameColor && item.frameWidthCm > 0
        ? `cadre ${item.frameColor} de ${item.frameWidthCm} cm`
        : 'sans cadre';
      const mat = item.matWidthCm > 0
        ? `passe-partout ${item.matColor || '#ffffff'} de ${item.matWidthCm} cm`
        : '';
      const analysis = item.analysis || '';
      return `- "${name}" : ${widthCm.toFixed(1)}×${heightCm.toFixed(1)} cm, position centre (${centerXCm.toFixed(1)}, ${centerYCm.toFixed(1)}) cm depuis coin haut-gauche, ${frame}${mat ? `, ${mat}` : ''}${analysis ? `\n  Analyse : ${analysis.substring(0, 300)}` : ''}`;
    }).join('\n');

    const languageNote = lang && lang !== 'en' ? `Veuillez répondre en ${lang === 'fr' ? 'français' : lang}.` : 'Please respond in English.';

    let basePrompt;
    if (userSettings?.prompt_wall_analysis) {
      basePrompt = userSettings.prompt_wall_analysis;
    } else {
      basePrompt = lang === 'fr'
        ? `Vous êtes un scénographe d'exposition expert. Analysez la disposition des photographies sur ce mur en tenant compte de leurs positions, tailles, espacements et encadrements.`
        : `You are an expert exhibition scenographer. Analyze the arrangement of photographs on this wall considering their positions, sizes, spacing and framing.`;
    }

    const detailLevel = userSettings?.analysis_detail_level || 'balanced';
    const tone = userSettings?.analysis_tone || 'professional';
    let modifiers = '';
    if (detailLevel === 'concise') modifiers += lang === 'fr' ? '\nSoyez concis et allez à l\'essentiel.' : '\nBe concise and to the point.';
    else if (detailLevel === 'detailed') modifiers += lang === 'fr' ? '\nFournissez une analyse très détaillée et approfondie.' : '\nProvide a very detailed and thorough analysis.';
    if (tone === 'friendly') modifiers += lang === 'fr' ? '\nUtilisez un ton amical et accessible.' : '\nUse a friendly and accessible tone.';
    else if (tone === 'technical') modifiers += lang === 'fr' ? '\nUtilisez un ton technique et précis.' : '\nUse a technical and precise tone.';

    const instructionNote = instructions?.trim()
      ? (lang === 'fr' ? `\nInstructions supplémentaires : ${instructions}` : `\nAdditional instructions: ${instructions}`)
      : '';

    const wallDescription = lang === 'fr'
      ? `Mur "${wallName}" : ${(wallWidthCm / 100).toFixed(2)} m × ${(wallHeightCm / 100).toFixed(2)} m, couleur de fond : ${backgroundColor}\n${wallItems.length} photos disposées :\n${itemDescriptions}`
      : `Wall "${wallName}": ${(wallWidthCm / 100).toFixed(2)} m × ${(wallHeightCm / 100).toFixed(2)} m, background color: ${backgroundColor}\n${wallItems.length} photos arranged:\n${itemDescriptions}`;

    const markdownInstruction = lang === 'fr'
      ? `FORMAT DE RÉPONSE: Utilisez du Markdown pur. Structurez votre analyse avec des titres ## et des sous-sections. N'utilisez JAMAIS de balises HTML. Soyez synthétique : chaque section doit faire 2-3 phrases maximum. Privilégiez la qualité à la quantité.`
      : `RESPONSE FORMAT: Use pure Markdown. Structure your analysis with ## headings and sub-sections. NEVER use HTML tags. Be concise: each section should be 2-3 sentences maximum. Prioritize quality over quantity.`;

    const systemPrompt = `${basePrompt}${modifiers}\n\n${markdownInstruction}\n\n${languageNote}`;
    const userMessage = `${instructionNote}\n\n${wallDescription}`;

    const response = await anthropic.messages.create({
      model: "claude-opus-4-6",
      max_tokens: 3000,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
    });

    return res.json({ result: response.content[0].text });
  } catch (error) {
    console.error('Error in /api/analyze-wall:', error);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

// ─── Static serving (production) ─────────────────────────────────────────────

const distPath = path.join(__dirname, '..', 'dist');

if (fs.existsSync(distPath)) {
  app.use(express.static(distPath, { maxAge: '1d' }));

  // SPA fallback
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path === '/health') return next();
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Server listening on ${port}`));
