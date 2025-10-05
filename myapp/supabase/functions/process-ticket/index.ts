// supabase/functions/process-ticket/index.ts

import { encodeBase64 } from "https://deno.land/std/encoding/base64.ts";
import { serve } from 'https://deno.land/std/http/server.ts';
import { GoogleGenerativeAI } from 'https://esm.sh/@google/generative-ai';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const genAI = new GoogleGenerativeAI(Deno.env.get('GEMINI_API_KEY')!)
const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' })

// Define the JSON Response Schema for the final analysis step
const analysisSchema = {
  type: "object",
  properties: {
    Branch: {
      type: "string",
      enum: ['RS Puram', 'Koundampalayam', 'Sivanandha Colony', 'Peelamedu', 'Ramanathapuram', 'Central Kitchen', 'General'],
    },
    Name: { type: "string" },
    Category: {
      type: "array",
      items: {
        type: "string",
        enum: ['Food Quality', 'Taste', 'Hygiene', 'Staff Behavior', 'Serving Delay', 'Object In Food', 'Missing Food Item', 'Not Cooked Well', 'Policy Change', 'Order', 'Enquiry', 'Takeaway Delay', 'Wrong Item', 'Other'],
      }
    },
    Category_Other: { type: "string", description: "If Category includes 'Other', provide a brief 3-word description here. Otherwise, null." },
    Issue_Details: { type: "string" },
    Status: {
      type: "string",
      enum: ['Open', 'Closed', 'Closed - No Contact', 'Other'],
    },
    Status_Other: { type: "string", description: "If Status is 'Other', provide a brief 3-word description here. Otherwise, null." },
    Action_Taken: { type: "string" },
    Customer_Care_Notes: { type: "string" },
    Resolution_Feedback_From_Customer: { type: "string" },
    Order_Type: {
      type: "string",
      enum: ['Dine-in', 'Swiggy', 'Zomato', 'Takeaway', 'Other'],
    },
    Order_Type_Other: { type: "string", description: "If Order_Type is 'Other', provide a brief 3-word description here. Otherwise, null." },
    Ticket_Type: {
      type: "string",
      enum: ['Complaint', 'Feedback', 'Suggestion', 'Order', 'Enquiry', 'Other'],
    },
    Ticket_Type_Other: { type: "string", description: "If Ticket_Type is 'Other', provide a brief 3-word description here. Otherwise, null." },
    Table_No: { type: "string" },
    Token_No: { type: "string" },
    Bill_No: { type: "string" },
    Waiter_Name: { type: "string" },
    Captain_Name: { type: "string" },
    Staff_Responsible: { type: "string" },
    AI_Summary: { type: "string" },
  }
};

serve(async (req) => {
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const { record: ticket } = await req.json()

  try {
    await supabase.from('tickets').update({ status: 'processing' }).eq('id', ticket.id)

    const { data: recordings, error: fetchError } = await supabase
      .from('recordings')
      .select('*')
      .eq('ticket_id', ticket.id)
      .order('recording_time', { ascending: true })

    if (fetchError) throw fetchError;
    if (!recordings || recordings.length === 0) throw new Error(`No recordings found for ticket ${ticket.id}`);

    // --- PHASE 1: Transcribe all files in parallel ---
    const transcriptionPromises = recordings.map(async (recording) => {
      const filePath = `${ticket.storage_path}/${recording.file_name}`
      const { data: audioBlob } = await supabase.storage.from('call-recordings').download(filePath)
      
      const audioBytes = await audioBlob.arrayBuffer();
      const base64Audio = encodeBase64(new Uint8Array(audioBytes));
      const audioPart = { inlineData: { data: base64Audio, mimeType: 'audio/opus' } };
      
      const transcriptionPrompt = "You are an expert audio transcriber. The following audio file contains a conversation between two people in a mix of Tamil and English (Tanglish). Your task is to transcribe it into clean, plain English text. Crucially, identify each distinct speaker and label their dialogue (e.g., 'Person 1:', 'Person 2:'). Provide only the final, labeled transcription."
      
      const result = await model.generateContent([transcriptionPrompt, audioPart])
      const transcriptionText = result.response.text()

      await supabase.from('recordings').update({ transcription: transcriptionText }).eq('id', recording.id)
      return { role: recording.role, transcription: transcriptionText };
    });

    const transcribedRecordings = await Promise.all(transcriptionPromises);

    // --- PHASE 2: Consolidate transcriptions and update the ticket ---
    const combinedTranscript = transcribedRecordings
      .map((rec, index) => `Call ${index + 1}: Role: ${rec.role}\nTranscription:\n${rec.transcription}\n\n`)
      .join('')
      .trim();

    await supabase.from('tickets').update({ 
      transcription: combinedTranscript
    }).eq('id', ticket.id)

    // --- PHASE 3: Analyze the combined transcript to get structured JSON ---
    const analysisPrompt = `
      You are an expert AI assistant for a restaurant's customer support analysis.
      Analyze the following transcript of a customer incident. Based ONLY on this text, extract the required information.
      If a value is not mentioned, return null for that field.
      For the 'Branch' field, if no specific branch is mentioned, default to 'General'.
      For 'Customer_Care_Notes' and 'AI_Summary', generate the content based on your analysis.

      **General Rules:**
      1.  Analyze the content of the transcript ONLY. Do not invent information. DO NOT HALLUCINATE
      2.  If information for a field is not mentioned in the transcript, its value MUST be \`null\`.
      3.  The final output MUST be a single, valid JSON object and nothing else. Do not include any text or explanations outside of the JSON structure.

      Transcript:
      """
      ${combinedTranscript}
      """
    `;

    const analysisResult = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: analysisPrompt }] }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: analysisSchema,
      },
    });

    const analysisJson = JSON.parse(analysisResult.response.text());

    // --- FINAL STEP: Update the ticket with the JSON and set status to 'done' ---
    await supabase.from('tickets').update({ 
      columns_field: analysisJson,
      status: 'done' 
    }).eq('id', ticket.id)

    return new Response(JSON.stringify({ message: `Successfully processed ticket ${ticket.id}` }), { status: 200 })

  } catch (error) {
    console.error(`Failed to process ticket ${ticket.id}:`, error)
    await supabase.from('tickets').update({ status: 'failed' }).eq('id', ticket.id)
    return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  }
})