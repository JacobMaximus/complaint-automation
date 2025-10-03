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

    // 2. Fetch ALL recordings for this ticket
    const { data: recordings, error: fetchError } = await supabase
      .from('recordings')
      .select('*')
      .eq('ticket_id', ticket.id)
      .order('recording_time', { ascending: true })

    if (fetchError) throw fetchError
    if (!recordings || recordings.length === 0) throw new Error(`No recordings found for ticket ${ticket.id}`)

    // --- PHASE 1: Transcribe all files in parallel ---
    const transcriptionPromises = recordings.map(async (recording) => {
      console.log(`Starting transcription for: ${recording.file_name}`);
      const filePath = `${ticket.storage_path}/${recording.file_name}`
      const { data: audioBlob } = await supabase.storage.from('call-recordings').download(filePath)
      
      const audioBytes = await audioBlob.arrayBuffer();
      const base64Audio = encodeBase64(new Uint8Array(audioBytes));
      const audioPart = { inlineData: { data: base64Audio, mimeType: 'audio/opus' } };
      
      const prompt = "You are an expert audio transcriber. The following audio file contains a conversation between two people in a mix of Tamil and English (Tanglish). Your task is to transcribe it into clean, plain English text. Identify each distinct speaker and label their dialogue (e.g., 'Person 1:', 'Person 2:'). The output must be plain text only, without any markdown formatting like bolding or asterisks."
      const result = await model.generateContent([prompt, audioPart])
      const transcriptionText = result.response.text()

      // Update the individual recording row
      await supabase.from('recordings').update({ transcription: transcriptionText }).eq('id', recording.id)
      
      console.log(`Finished transcription for: ${recording.file_name}`);
      // Return the details needed for the final report
      return { role: recording.role, transcription: transcriptionText };
    });

    const transcribedRecordings = await Promise.all(transcriptionPromises);

    // --- PHASE 2: Consolidate transcriptions into one report ---
    const combinedTranscript = transcribedRecordings
      .map((rec, index) => {
        return `Call ${index + 1}: Role: ${rec.role}\nTranscription:\n${rec.transcription}\n\n`;
      })
      .join('') // Join all the strings into one block of text
      .trim(); // Remove any trailing whitespace

    // --- FINAL STEP: Update the main ticket with the combined report ---
    await supabase.from('tickets').update({ 
      transcription: combinedTranscript,
      status: 'done' 
    }).eq('id', ticket.id)

    return new Response(JSON.stringify({ message: `Successfully processed ticket ${ticket.id}` }), { status: 200 })

  } catch (error) {
    console.error(`Failed to process ticket ${ticket.id}:`, error)
    await supabase.from('tickets').update({ status: 'failed' }).eq('id', ticket.id)
    return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  }
})