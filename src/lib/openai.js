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

const JSON_STRUCTURE_FR = `IMPORTANT: Répondez UNIQUEMENT avec un objet JSON valide (sans texte avant ou après) avec cette structure exacte:
{
  "name": "Titre Évocateur",
  "score": 85,
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
- "score": note de 0 à 100 basée sur la qualité artistique globale
- "story": exactement 2 lignes racontant une histoire imaginaire inspirée par la photo
- Chaque champ texte: 1-3 phrases concises et pertinentes
- "strengths": exactement 3 points forts
- "improvements": exactement 2 suggestions concrètes d'amélioration`;

const JSON_STRUCTURE_EN = `IMPORTANT: Respond ONLY with a valid JSON object (no text before or after) with this exact structure:
{
  "name": "Evocative Title",
  "score": 85,
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
- "score": rating from 0 to 100 based on overall artistic quality
- "story": exactly 2 lines narrating an imaginary story inspired by the photo
- Each text field: 1-3 concise and relevant sentences
- "strengths": exactly 3 strengths
- "improvements": exactly 2 concrete improvement suggestions`;

// Structure JSON spécifique pour les analyses Réseaux Sociaux / Marketing
const JSON_STRUCTURE_MARKETING_FR = `IMPORTANT: Répondez UNIQUEMENT avec un objet JSON valide (sans texte avant ou après) avec cette structure exacte pour une ANALYSE MARKETING / RÉSEAUX SOCIAUX:
{
  "name": "Titre Accrocheur",
  "score": 85,
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
- "score": note de VIRALITÉ et d'ENGAGEMENT de 0 à 100. Évaluez le potentiel viral de l'image : 0-30 = faible engagement attendu, 31-60 = engagement modéré, 61-80 = bon potentiel viral, 81-100 = très fort potentiel de viralité. Considérez l'attrait visuel immédiat, l'émotion suscitée, la partageabilité, l'originalité et l'adéquation aux tendances actuelles.
- "subject": description détaillée du sujet/objet principal de la photo (2-3 phrases)
- "marketing": analyse marketing détaillée et complète (minimum 4-5 phrases)
- "hashtags": exactement 10 hashtags pertinents et populaires, en commençant par #
- "captions": exactement 3 propositions de textes différents pour accompagner la photo
- "strengths": exactement 3 points forts marketing
- "improvements": exactement 2 suggestions pour améliorer l'impact`;

const JSON_STRUCTURE_MARKETING_EN = `IMPORTANT: Respond ONLY with a valid JSON object (no text before or after) with this exact structure for a MARKETING / SOCIAL MEDIA ANALYSIS:
{
  "name": "Catchy Title",
  "score": 85,
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
- "score": VIRALITY and ENGAGEMENT score from 0 to 100. Evaluate the viral potential of the image: 0-30 = low expected engagement, 31-60 = moderate engagement, 61-80 = good viral potential, 81-100 = very high virality potential. Consider immediate visual appeal, emotion triggered, shareability, originality, and alignment with current trends.
- "subject": detailed description of the main subject/object of the photo (2-3 sentences)
- "marketing": detailed and complete marketing analysis (minimum 4-5 sentences)
- "hashtags": exactly 10 relevant and popular hashtags, starting with #
- "captions": exactly 3 different text proposals to accompany the photo
- "strengths": exactly 3 marketing strengths
- "improvements": exactly 2 suggestions to improve impact`;

export async function analyzePhoto(imageUrl, promptType = 'artist', lang = 'fr', collectionAnalysis = null, userSettings = null) {
  try {
    // If collection analysis type is provided, use it instead of promptType
    let systemPrompt;
    let isSocialMediaAnalysis = false;
    
    if (collectionAnalysis && collectionAnalysis.type && COLLECTION_ANALYSIS_PROMPTS[collectionAnalysis.type]) {
      systemPrompt = COLLECTION_ANALYSIS_PROMPTS[collectionAnalysis.type][lang] || COLLECTION_ANALYSIS_PROMPTS[collectionAnalysis.type].en;
      isSocialMediaAnalysis = collectionAnalysis.type === 'socialMedia';
      // Add custom instructions if provided
      if (collectionAnalysis.type === 'custom' && collectionAnalysis.instructions) {
        systemPrompt += `\n\nInstructions personnalisées : ${collectionAnalysis.instructions}`;
      }
    } else {
      systemPrompt = SYSTEM_PROMPTS[promptType] || SYSTEM_PROMPTS.artist;
      isSocialMediaAnalysis = promptType === 'socialMedia';
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
    
    // Use marketing-specific JSON structure for social media analysis
    let jsonStructure;
    if (isSocialMediaAnalysis) {
      jsonStructure = lang === 'fr' ? JSON_STRUCTURE_MARKETING_FR : JSON_STRUCTURE_MARKETING_EN;
    } else {
      jsonStructure = lang === 'fr' ? JSON_STRUCTURE_FR : JSON_STRUCTURE_EN;
    }

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
              image_url: {
                url: imageUrl
              }
            }
          ]
        }
      ],
      max_tokens: 2000
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
          story: parsed.story || '',
          // Marketing-specific fields
          subject: parsed.subject || null,
          marketing: parsed.marketing || null,
          hashtags: parsed.hashtags || null,
          captions: parsed.captions || null,
          // Artistic analysis fields
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
