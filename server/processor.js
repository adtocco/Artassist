export async function processItem({ id, supabaseAdmin, openai, lang = 'fr' }) {
  if (!id) throw new Error('id required');
  // fetch item
  const { data: item, error: fetchErr } = await supabaseAdmin
    .from('photo_analyses')
    .select('*')
    .eq('id', id)
    .single();

  if (fetchErr) throw fetchErr;
  if (!item) throw new Error('item not found');
  if (item.status !== 'pending') throw new Error('item not pending');

  // claim
  const processorId = `server-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
  const { data: claimed, error: claimErr } = await supabaseAdmin
    .from('photo_analyses')
    .update({ status: 'processing', processor: processorId, analysis_started_at: new Date().toISOString() })
    .eq('id', id)
    .eq('status', 'pending')
    .select()
    .single();

  if (claimErr || !claimed) throw new Error('failed to claim item');

  try {
    // create signed url
    const { data: signedData } = await supabaseAdmin.storage.from('photos').createSignedUrl(item.storage_path, 300);
    const urlToAnalyze = signedData?.signedUrl || item.photo_url;

    // call OpenAI - simple chat completion using earlier prompt logic
    const systemPrompt = (item.prompt_type === 'gallery')
      ? `Vous êtes un conservateur de galerie évaluant des photographies pour leur potentiel d'exposition.`
      : (item.prompt_type === 'socialMedia')
        ? `Vous êtes un·e stratège en médias sociaux analysant des photographies pour l'engagement en ligne.`
        : `Vous êtes un critique d'art expert analysant des photographies d'un point de vue artistique.`;

    const languageNote = lang && lang !== 'en' ? `Veuillez répondre en ${lang === 'fr' ? 'français' : lang}.` : 'Please respond in English.';

    const messages = [
      { role: 'system', content: `${systemPrompt}\n\n${languageNote}` },
      { role: 'user', content: `Please analyze this photo and provide a detailed critique. Image URL: ${urlToAnalyze}` }
    ];

    const response = await openai.chat.completions.create({ model: 'gpt-4o', messages, max_tokens: 1200 });
    const analysis = response.choices?.[0]?.message?.content || '';

    // update record
    const { error: updateErr } = await supabaseAdmin.from('photo_analyses').update({ status: 'done', analysis, analysis_finished_at: new Date().toISOString(), processor: processorId }).eq('id', id);
    if (updateErr) throw updateErr;

    return { id, analysis }; 
  } catch (err) {
    console.error('processing error', err);
    await supabaseAdmin.from('photo_analyses').update({ status: 'error', error_message: err.message }).eq('id', id);
    throw err;
  }
}
