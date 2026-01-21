import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: import.meta.env.VITE_OPENAI_API_KEY,
  dangerouslyAllowBrowser: true // Note: In production, API calls should go through a backend
});

export const SYSTEM_PROMPTS = {
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

// Collection-based analysis types (analysis_type from collections table)
export const COLLECTION_ANALYSIS_PROMPTS = {
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
  }
};

const JSON_STRUCTURE_FR = `IMPORTANT: Répondez UNIQUEMENT avec un objet JSON valide (sans texte avant ou après) avec cette structure exacte:
{
  "name": "Titre Évocateur",
  "score": 85,
  "summary": "Une phrase résumant l'impression générale de l'image.",
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
- "score": note de 0 à 100 basée sur la qualité artistique globale
- Chaque champ texte: 1-3 phrases concises et pertinentes
- "strengths": exactement 3 points forts
- "improvements": exactement 2 suggestions concrètes d'amélioration`;

const JSON_STRUCTURE_EN = `IMPORTANT: Respond ONLY with a valid JSON object (no text before or after) with this exact structure:
{
  "name": "Evocative Title",
  "score": 85,
  "summary": "One sentence summarizing the overall impression of the image.",
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
- "score": rating from 0 to 100 based on overall artistic quality
- Each text field: 1-3 concise and relevant sentences
- "strengths": exactly 3 strengths
- "improvements": exactly 2 concrete improvement suggestions`;

export async function analyzePhoto(imageUrl, promptType = 'artist', lang = 'fr', collectionAnalysis = null, userSettings = null) {
  try {
    // If collection analysis type is provided, use it instead of promptType
    let systemPrompt;
    if (collectionAnalysis && collectionAnalysis.type && COLLECTION_ANALYSIS_PROMPTS[collectionAnalysis.type]) {
      systemPrompt = COLLECTION_ANALYSIS_PROMPTS[collectionAnalysis.type][lang] || COLLECTION_ANALYSIS_PROMPTS[collectionAnalysis.type].en;
      // Add custom instructions if provided
      if (collectionAnalysis.type === 'custom' && collectionAnalysis.instructions) {
        systemPrompt += `\n\nInstructions personnalisées : ${collectionAnalysis.instructions}`;
      }
    } else {
      systemPrompt = SYSTEM_PROMPTS[promptType] || SYSTEM_PROMPTS.artist;
    }
    
    // Apply user settings customizations
    if (userSettings) {
      // Detail level
      if (userSettings.analysis_detail_level === 'concise') {
        systemPrompt += `\n\nSTYLE : Soyez concis et direct. Limitez chaque section à 1-2 phrases maximum.`;
      } else if (userSettings.analysis_detail_level === 'detailed') {
        systemPrompt += `\n\nSTYLE : Fournissez une analyse approfondie et détaillée. Développez chaque aspect avec précision.`;
      }
      
      // Tone
      if (userSettings.analysis_tone === 'friendly') {
        systemPrompt += `\n\nTON : Adoptez un ton amical, encourageant et accessible. Utilisez un langage chaleureux.`;
      } else if (userSettings.analysis_tone === 'technical') {
        systemPrompt += `\n\nTON : Utilisez des termes techniques précis. Soyez spécifique sur les aspects techniques (ISO, ouverture, etc.).`;
      }
      
      // Focus areas
      if (userSettings.focus_areas && userSettings.focus_areas.length > 0) {
        const focusAreasText = userSettings.focus_areas.join(', ');
        systemPrompt += `\n\nPRIORITÉS : Accordez une attention particulière à ces aspects : ${focusAreasText}. Développez-les davantage que les autres aspects.`;
      }
    }
    
    const languageNote = lang && lang !== 'en' ? `Répondez en français.` : 'Respond in English.';
    const jsonStructure = lang === 'fr' ? JSON_STRUCTURE_FR : JSON_STRUCTURE_EN;

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
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
              text: lang === 'fr' 
                ? 'Analysez cette photographie d\'un point de vue artistique et technique. Si la photo contient des personnes, analysez la composition, la posture, l\'expression et l\'émotion sans chercher à identifier qui elles sont.' 
                : 'Analyze this photograph from an artistic and technical perspective. If the photo contains people, analyze the composition, posture, expression, and emotion without attempting to identify who they are.'
            },
            {
              type: "image_url",
              image_url: {
                url: imageUrl
              }
            }
          ]
        }
      ],
      max_tokens: 1500
    });

    const content = response.choices[0]?.message?.content;
    console.log('OpenAI raw response:', content);
    
    if (!content) {
      throw new Error('Empty response from OpenAI');
    }
    
    // Parse JSON response
    try {
      let jsonStr = content.trim();
      
      // Extract JSON from markdown code blocks or from text with extra content
      if (jsonStr.includes('```json')) {
        const jsonMatch = jsonStr.match(/```json\s*([\s\S]*?)\s*```/);
        if (jsonMatch) {
          jsonStr = jsonMatch[1].trim();
        }
      } else if (jsonStr.includes('```')) {
        const jsonMatch = jsonStr.match(/```\s*([\s\S]*?)\s*```/);
        if (jsonMatch) {
          jsonStr = jsonMatch[1].trim();
        }
      } else {
        // Try to extract JSON object from text (find first { to last })
        const firstBrace = jsonStr.indexOf('{');
        const lastBrace = jsonStr.lastIndexOf('}');
        if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
          jsonStr = jsonStr.substring(firstBrace, lastBrace + 1);
        }
      }
      
      jsonStr = jsonStr.trim();
      console.log('Extracted JSON string:', jsonStr);
      
      const parsed = JSON.parse(jsonStr);
      
      // Return structured analysis
      return {
        name: parsed.name || (lang === 'fr' ? 'Sans titre' : 'Untitled'),
        analysis: JSON.stringify({
          score: parsed.score || 0,
          summary: parsed.summary || '',
          composition: parsed.composition || '',
          lighting: parsed.lighting || '',
          colors: parsed.colors || '',
          emotion: parsed.emotion || '',
          technique: parsed.technique || '',
          strengths: parsed.strengths || [],
          improvements: parsed.improvements || []
        })
      };
    } catch (parseError) {
      console.warn('Failed to parse JSON response, using raw content:', parseError);
      return {
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
      };
    }
  } catch (error) {
    console.error('Error analyzing photo:', error);
    throw error;
  }
}

export async function findPhotoSeries(analyses, lang = 'fr', instructions = '') {
  try {
    const analysisTexts = analyses.map((a) => {
      const name = a.photo_name || 'Sans titre';
      const url = a.photo_url || '';
      return `"${name}" (URL: ${url}): ${a.analysis}`;
    }).join('\n\n');

    const photoNames = analyses.map(a => a.photo_name || 'Sans titre').join(', ');

    const languageNote = lang && lang !== 'en' ? `Veuillez répondre en ${lang === 'fr' ? 'français' : lang}.` : 'Please respond in English.';

    const instructionNote = instructions && instructions.trim()
      ? (lang === 'fr'
          ? `Consignes supplémentaires pour l'analyse de la série : ${instructions}`
          : `Additional instructions for the series analysis: ${instructions}`)
      : '';

    const namingInstruction = lang === 'fr'
      ? `IMPORTANT: Utilisez TOUJOURS les noms des photos (${photoNames}) pour les identifier dans vos recommandations, jamais "Photo 1", "Photo 2", etc.`
      : `IMPORTANT: ALWAYS use the photo names (${photoNames}) to identify them in your recommendations, never "Photo 1", "Photo 2", etc.`;

    const markdownInstruction = lang === 'fr'
      ? `FORMAT DE RÉPONSE: Utilisez le format Markdown. Pour chaque série proposée, incluez un aperçu visuel des photos avec la syntaxe Markdown: ![nom](url). Affichez les miniatures des photos côte à côte pour chaque série recommandée.`
      : `RESPONSE FORMAT: Use Markdown format. For each proposed series, include a visual preview of the photos using Markdown syntax: ![name](url). Display photo thumbnails side by side for each recommended series.`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `Vous êtes un conservateur d'art expert analysant une collection de photographies.\nVotre tâche est d'identifier quelles photos fonctionnent bien ensemble en série, lesquelles sont les plus intéressantes individuellement, et de fournir des raisons claires pour vos recommandations.\n\n${namingInstruction}\n\n${markdownInstruction}\n\n${languageNote}`
        },
        {
          role: "user",
          content: `${instructionNote}\n\nSur la base des analyses ci-dessous, merci d'identifier :\n1. Quelles photos fonctionneraient bien ensemble en série (groupes de 2 à 5 photos) - INCLURE les aperçus des photos en Markdown pour chaque série\n2. Quelles photos individuelles sont les plus intéressantes ou puissantes - INCLURE l'aperçu\n3. Recommandations pour organiser ou présenter cette collection\n\nAnalyses:\n${analysisTexts}\n\nVeuillez fournir une sortie structurée avec des recommandations claires. Référencez chaque photo par son nom et incluez les images en Markdown.`
        }
      ],
      max_tokens: 2000
    });

    return response.choices[0].message.content;
  } catch (error) {
    console.error('Error finding photo series:', error);
    throw error;
  }
}
