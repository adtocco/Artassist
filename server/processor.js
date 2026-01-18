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
    // Fetch the image bytes server-side, build a thumbnail and metadata so
    // we can include the actual image data (base64) in the prompt rather than
    // just passing a link which some models refuse to fetch.
    const fetchRes = await fetch(urlToAnalyze);
    if (!fetchRes.ok) throw new Error('Failed to fetch image for analysis');
    const arrayBuffer = await fetchRes.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Lazy import Jimp to process image
    const Jimp = (await import('jimp')).default;
    const img = await Jimp.read(buffer);
    const width = img.getWidth();
    const height = img.getHeight();
    const mime = img.getMIME();

    // Create a small thumbnail (256px max) and get base64 PNG
    const thumb = img.clone().cover(256, 256);
    const thumbBuffer = await thumb.getBufferAsync(Jimp.MIME_PNG);
    const thumbBase64 = thumbBuffer.toString('base64');
    const dataUri = `data:image/png;base64,${thumbBase64}`;

    // Approximate average color by resizing to 1x1
    const avg = img.clone().resize(1, 1);
    const pixel = avg.getPixelColor(0, 0); // RGBA packed int
    const rgba = Jimp.intToRGBA(pixel);
    const avgColor = `rgb(${rgba.r}, ${rgba.g}, ${rgba.b})`;

    const sizeBytes = buffer.length;

    const systemPrompt = (item.prompt_type === 'gallery')
      ? `Vous êtes un conservateur de galerie évaluant des photographies pour leur potentiel d'exposition.`
      : (item.prompt_type === 'socialMedia')
        ? `Vous êtes un·e stratège en médias sociaux analysant des photographies pour l'engagement en ligne.`
        : `Vous êtes un critique d'art expert analysant des photographies d'un point de vue artistique.`;

    const languageNote = lang && lang !== 'en' ? `Veuillez répondre en ${lang === 'fr' ? 'français' : lang}.` : 'Please respond in English.';

    const userContent = `Je fournis ci‑dessous une vignette de l'image (base64 PNG) et des métadonnées extraites côté serveur. Certains modèles ne peuvent pas accéder aux URLs externes, donc merci d'utiliser la vignette et les métadonnées pour produire une analyse artistique complète.\n\n` +
      `Image data (base64 PNG): ${dataUri}\n\n` +
      `Méta: filename=${item.file_name || 'unknown'}, width=${width}, height=${height}, mime=${mime}, size_bytes=${sizeBytes}, avg_color=${avgColor}\n\n` +
      `Veuillez fournir une critique détaillée en vous concentrant sur composition, lumière, couleur, sujet, technique et recommandations d'amélioration. ${languageNote}`;

    const messages = [
      { role: 'system', content: `${systemPrompt}\n\n${languageNote}` },
      { role: 'user', content: userContent }
    ];

    const response = await openai.chat.completions.create({ model: 'gpt-4o', messages, max_tokens: 1400 });
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
