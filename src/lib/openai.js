import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: import.meta.env.VITE_OPENAI_API_KEY,
  dangerouslyAllowBrowser: true // Note: In production, API calls should go through a backend
});

export const SYSTEM_PROMPTS = {
  artist: `Vous êtes un critique d'art expert analysant des photographies d'un point de vue artistique.
Concentrez-vous sur : la composition, l'éclairage, la théorie des couleurs, l'impact émotionnel,
l'exécution technique, l'originalité et le mérite artistique.`,

  gallery: `Vous êtes un conservateur de galerie évaluant des photographies pour leur potentiel d'exposition.
Concentrez-vous sur : commercialisabilité, attrait en galerie, cohérence thématique, impact visuel
dans l'espace d'exposition, intérêt des collectionneurs et adéquation avec les tendances du marché.`,

  socialMedia: `Vous êtes un·e stratège en médias sociaux analysant des photographies pour l'engagement en ligne.
Concentrez-vous sur : l'attrait visuel pour les plateformes, partageabilité, esthétiques tendance,
résonance émotionnelle pour le public en ligne, potentiel de hashtags et probabilité de viralité.`
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

export async function analyzePhoto(imageUrl, promptType = 'artist', lang = 'fr') {
  try {
    const systemPrompt = SYSTEM_PROMPTS[promptType] || SYSTEM_PROMPTS.artist;
    const languageNote = lang && lang !== 'en' ? `Répondez en français.` : 'Respond in English.';
    const jsonStructure = lang === 'fr' ? JSON_STRUCTURE_FR : JSON_STRUCTURE_EN;

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
              text: lang === 'fr' ? 'Analysez cette photographie.' : 'Analyze this photograph.'
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

    const content = response.choices[0].message.content;
    
    // Parse JSON response
    try {
      let jsonStr = content.trim();
      if (jsonStr.startsWith('```json')) {
        jsonStr = jsonStr.slice(7);
      } else if (jsonStr.startsWith('```')) {
        jsonStr = jsonStr.slice(3);
      }
      if (jsonStr.endsWith('```')) {
        jsonStr = jsonStr.slice(0, -3);
      }
      jsonStr = jsonStr.trim();
      
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
      model: "gpt-5.2",
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
