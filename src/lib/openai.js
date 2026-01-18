import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: import.meta.env.VITE_OPENAI_API_KEY,
  dangerouslyAllowBrowser: true // Note: In production, API calls should go through a backend
});

export const SYSTEM_PROMPTS = {
  artist: `You are an expert art critic analyzing photographs from an artistic perspective. 
  Focus on: composition, lighting, color theory, emotional impact, technical execution, 
  originality, and artistic merit. Provide detailed feedback on how the work could be improved 
  from an artistic standpoint.`,
  
  gallery: `You are a gallery curator evaluating photographs for exhibition potential. 
  Focus on: marketability, gallery appeal, thematic coherence, visual impact in exhibition space, 
  collector interest, and how it fits current art market trends. Assess whether this work would 
  be suitable for gallery representation.`,
  
  socialMedia: `You are a social media strategist analyzing photographs for online engagement. 
  Focus on: visual appeal for social platforms, shareability, trending aesthetics, emotional 
  resonance with online audiences, hashtag potential, and likelihood of viral success. 
  Provide advice on optimizing for social media performance.`
};

export async function analyzePhoto(imageUrl, promptType = 'artist') {
  try {
    const systemPrompt = SYSTEM_PROMPTS[promptType] || SYSTEM_PROMPTS.artist;
    
    const response = await openai.chat.completions.create({
      model: "gpt-4o",  // Using gpt-4o (latest available) as gpt-5.2 isn't released yet
      messages: [
        {
          role: "system",
          content: systemPrompt
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Please provide a detailed artistic analysis of this photograph."
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

export async function findPhotoSeries(analyses) {
  try {
    const analysisTexts = analyses.map((a, i) => 
      `Photo ${i + 1}: ${a.analysis}`
    ).join('\n\n');

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `You are an expert art curator analyzing a collection of photographs. 
          Your task is to identify which photos work well together as a series, which are 
          the most interesting individually, and provide reasoning for your recommendations.`
        },
        {
          role: "user",
          content: `Based on these photo analyses, please identify:
1. Which photos would work well together as a series (groups of 2-5 photos)
2. Which individual photos are the most interesting or powerful
3. Recommendations for organizing or presenting this collection

Analyses:
${analysisTexts}

Please provide your response in a structured format with clear recommendations.`
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
