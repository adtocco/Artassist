import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: import.meta.env.VITE_OPENAI_API_KEY,
  dangerouslyAllowBrowser: true // Note: In production, API calls should go through a backend
});

export const SYSTEM_PROMPTS = {
  artist: `Vous êtes un critique d'art expert analysant des photographies d'un point de vue artistique.
  Concentrez-vous sur : la composition, l'éclairage, la théorie des couleurs, l'impact émotionnel,
  l'exécution technique, l'originalité et le mérite artistique. Fournissez des retours détaillés
  et concrets expliquant comment l'oeuvre pourrait être améliorée d'un point de vue artistique.`,

  gallery: `Vous êtes un conservateur de galerie évaluant des photographies pour leur potentiel d'exposition.
  Concentrez-vous sur : commercialisabilité, attrait en galerie, cohérence thématique, impact visuel
  dans l'espace d'exposition, intérêt des collectionneurs et adéquation avec les tendances du marché.
  Évaluez si l'oeuvre serait adaptée à une représentation en galerie et donnez des recommandations.`,

  socialMedia: `Vous êtes un·e stratège en médias sociaux analysant des photographies pour l'engagement en ligne.
  Concentrez-vous sur : l'attrait visuel pour les plateformes, partageabilité, esthétiques tendance,
  résonance émotionnelle pour le public en ligne, potentiel de hashtags et probabilité de viralité.
  Fournissez des conseils pour optimiser la photographie pour les performances sur les réseaux sociaux.`
};

export async function analyzePhoto(imageUrl, promptType = 'artist', lang = 'fr') {
  try {
    const systemPrompt = SYSTEM_PROMPTS[promptType] || SYSTEM_PROMPTS.artist;
    const languageNote = lang && lang !== 'en' ? `Veuillez répondre en ${lang === 'fr' ? 'français' : lang}.` : 'Please respond in English.';

    const response = await openai.chat.completions.create({
      model: "gpt-4o",  // Using gpt-4o (latest available) as gpt-5.2 isn't released yet
      messages: [
        {
          role: "system",
          content: `${systemPrompt}\n\n${languageNote}`
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: lang === 'fr' ? 'Veuillez fournir une analyse artistique détaillée de cette photographie.' : 'Please provide a detailed artistic analysis of this photograph.'
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
      max_tokens: 1000
    });

    return response.choices[0].message.content;
  } catch (error) {
    console.error('Error analyzing photo:', error);
    throw error;
  }
}

export async function findPhotoSeries(analyses, lang = 'fr') {
  try {
    const analysisTexts = analyses.map((a, i) => 
      `Photo ${i + 1}: ${a.analysis}`
    ).join('\n\n');

    const languageNote = lang && lang !== 'en' ? `Veuillez répondre en ${lang === 'fr' ? 'français' : lang}.` : 'Please respond in English.';

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `Vous êtes un conservateur d'art expert analysant une collection de photographies.\nVotre tâche est d'identifier quelles photos fonctionnent bien ensemble en série, lesquelles sont les plus intéressantes individuellement, et de fournir des raisons claires pour vos recommandations.\n\n${languageNote}`
        },
        {
          role: "user",
          content: `Sur la base des analyses ci-dessous, merci d'identifier :\n1. Quelles photos fonctionneraient bien ensemble en série (groupes de 2 à 5 photos)\n2. Quelles photos individuelles sont les plus intéressantes ou puissantes\n3. Recommandations pour organiser ou présenter cette collection\n\nAnalyses:\n${analysisTexts}\n\nVeuillez fournir une sortie structurée avec des recommandations claires.`
        }
      ],
      max_tokens: 1500
    });

    return response.choices[0].message.content;
  } catch (error) {
    console.error('Error finding photo series:', error);
    throw error;
  }
}
