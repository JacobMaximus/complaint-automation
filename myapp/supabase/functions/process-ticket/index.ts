// supabase/functions/process-ticket/index.ts

import { encodeBase64 } from "https://deno.land/std/encoding/base64.ts";
import { serve } from 'https://deno.land/std/http/server.ts';
import { GoogleGenerativeAI } from 'https://esm.sh/@google/generative-ai';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const genAI = new GoogleGenerativeAI(Deno.env.get('GEMINI_API_KEY')!)
const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' })

serve(async (req) => {
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const { record: ticket } = await req.json()

  try {
    // 1. Set ticket status to 'processing'
    await supabase.from('tickets').update({ status: 'processing' }).eq('id', ticket.id)

    // 2. NEW: Fetch ALL recordings for this ticket, ordered by time
    const { data: recordings, error: fetchError } = await supabase
      .from('recordings')
      .select('*')
      .eq('ticket_id', ticket.id)
      .order('recording_time', { ascending: true }) // Ensures chronological processing

    if (fetchError) throw new Error(`Could not fetch recordings: ${fetchError.message}`)
    if (!recordings || recordings.length === 0) throw new Error(`No recordings found for ticket ${ticket.id}`)

    // 3. NEW: Loop through each recording one by one (sequentially)
    for (const recording of recordings) {
      console.log(`Processing recording: ${recording.file_name}`);

      const filePath = `${ticket.storage_path}/${recording.file_name}`
      const { data: audioBlob, error: downloadError } = await supabase.storage.from('call-recordings').download(filePath)
      
      if (downloadError) {
        console.error(`Failed to download ${filePath}:`, downloadError.message);
        continue; // Skip to the next file if this one fails
      }

      // --- Call Gemini API for Transcription ---
      const audioBytes = await audioBlob.arrayBuffer();
      const base64Audio = encodeBase64(new Uint8Array(audioBytes));

      const audioPart = {
        inlineData: { data: base64Audio, mimeType: 'audio/opus' },
      };
      
      const prompt = "You are an expert audio transcriber. The following audio file contains a conversation between two people in a mix of Tamil and English (Tanglish). Your task is to transcribe it into clean, plain English text. Crucially, identify each distinct speaker and label their dialogue (e.g., 'Person 1:', 'Person 2:'). Provide only the final, labeled transcription."
      
      const result = await model.generateContent([prompt, audioPart])
      const transcriptionText = result.response.text()
      console.log(`Transcription received for ${recording.file_name}`)

      // Update the specific recording row with its transcription
      await supabase
        .from('recordings')
        .update({ transcription: transcriptionText })
        .eq('id', recording.id)
    }
      
    // 4. Set ticket status to 'done' after all files are processed
    await supabase.from('tickets').update({ status: 'done' }).eq('id', ticket.id)

    return new Response(JSON.stringify({ message: `Successfully transcribed ${recordings.length} files for ticket ${ticket.id}` }), { status: 200 })

  } catch (error) {
    console.error(`Failed to process ticket ${ticket.id}:`, error)
    await supabase.from('tickets').update({ status: 'failed' }).eq('id', ticket.id)
    return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  }
})