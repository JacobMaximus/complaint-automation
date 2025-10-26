import { encodeBase64 } from "https://deno.land/std/encoding/base64.ts";
import { serve } from 'https://deno.land/std/http/server.ts';
import { GoogleGenerativeAI } from 'https://esm.sh/@google/generative-ai';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const genAI = new GoogleGenerativeAI(Deno.env.get('GEMINI_API_KEY')!)
const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' })

// JSON Response Schema for the final analysis step
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
    Customer_Care_Notes: {
      type: "string",
      description: "Suggest a brief, actionable step the restaurant could take to prevent this issue in the future (e.g., 'Implement delivery tracking notifications', 'Train staff on menu changes'). This should NOT be a summary of the call. If no preventative action is relevant, this MUST be null."
    },
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
    
    const failedFile = recordings.find(rec => rec.file_name.includes('_TESTFAIL_'));    
    if (failedFile) {
      console.warn(`[TEST] Detected _TESTFAIL_ keyword in file: ${failedFile.file_name}. Forcing error.`);
      throw new Error('This is a forced test error to check the failure workflow.');
    }

    /// Transcribe all files in parallel
    // const transcriptionPromises = recordings.map(async (recording) => {
    //   const filePath = `${ticket.storage_path}/${recording.file_name}`
    //   const { data: audioBlob } = await supabase.storage.from('call-recordings').download(filePath)
      
    //   const audioBytes = await audioBlob.arrayBuffer();
    //   const base64Audio = encodeBase64(new Uint8Array(audioBytes));
    //   const audioPart = { inlineData: { data: base64Audio, mimeType: 'audio/opus' } };
      
    //   const transcriptionPrompt = "You are an expert audio transcriber. The following audio file contains a conversation between two people in a mix of Tamil and English (Tanglish). Your task is to transcribe it into clean, plain English text. Crucially, identify each distinct speaker and label their dialogue (e.g., 'Person 1:', 'Person 2:'). **The final output must be plain text only, without any markdown formatting like asterisks.** Provide only the final, labeled transcription."
      
    //   const result = await model.generateContent([transcriptionPrompt, audioPart])
    //   const transcriptionText = result.response.text()

    //   await supabase.from('recordings').update({ transcription: transcriptionText }).eq('id', recording.id)
    //   return { role: recording.role, transcription: transcriptionText, fileName: recording.file_name };
    // });

    // const transcribedRecordings = await Promise.all(transcriptionPromises);

    // Transcribe all files sequentially 
    console.log(`[PROGRESS] Starting sequential transcription for ${recordings.length} files...`);
    const transcribedRecordings = [];

    for (const recording of recordings) {
      
      // If a transcription already exists, skip the API call.
      if (recording.transcription) {
        console.log(`Skipping file ${recording.file_name}, already transcribed.`);
        transcribedRecordings.push({ 
          role: recording.role, 
          transcription: recording.transcription, 
          fileName: recording.file_name 
        });
        continue; 
      }
      
      console.log(`[PROGRESS] Transcribing new file: ${recording.file_name}`);
      const filePath = `${ticket.storage_path}/${recording.file_name}`;
      const { data: audioBlob } = await supabase.storage.from('call-recordings').download(filePath);
      
      const audioBytes = await audioBlob.arrayBuffer();
      const base64Audio = encodeBase64(new Uint8Array(audioBytes));
      const audioPart = { inlineData: { data: base64Audio, mimeType: 'audio/opus' } };
      
      const transcriptionPrompt = "You are an expert audio transcriber. The following audio file contains a conversation between two people in a mix of Tamil and English (Tanglish). Your task is to transcribe it into clean, plain English text. Crucially, identify each distinct speaker and label their dialogue (e.g., 'Person 1:', 'Person 2:'). **The final output must be plain text only, without any markdown formatting like asterisks.** Provide only the final, labeled transcription.";
      
      const result = await model.generateContent([transcriptionPrompt, audioPart]);
      const transcriptionText = result.response.text();

      await supabase.from('recordings').update({ transcription: transcriptionText }).eq('id', recording.id);
      
      transcribedRecordings.push({ 
        role: recording.role, 
        transcription: transcriptionText, 
        fileName: recording.file_name 
      });
      console.log(`[PROGRESS] Finished file: ${recording.file_name}`);
    }

    // Consolidate transcriptions and update the ticket
    const combinedTranscript = transcribedRecordings
      .map((rec, index) => {
        let roleDisplay = rec.role.charAt(0).toUpperCase() + rec.role.slice(1);
        // console.log(`[FILE DEBUG] Role: "${rec.role}", FileName: "${rec.fileName}"`);

        // Extracting name of manager if it's a manager.
        if (rec.role && rec.role.toLowerCase().trim() === 'manager' && rec.fileName) {
          const nameRegex = /^manager_(.+?)_?(0091\d+)/i;
          const match = rec.fileName.match(nameRegex);
          
          // console.log(`
          //   [MANAGER DEBUG]
          //   - Filename: ${rec.fileName}
          //   - Regex Pattern: ${nameRegex}
          //   - Match Result: ${JSON.stringify(match)}
          // `);

          if (match && match[1]) {
            // match[1] contains the captured name, e.g., FirstName_LastName
            // Replacing underscores with spaces 
            const managerName = match[1].replace(/_/g, ' ').trim();
            roleDisplay = `Manager ${managerName}`; // Result: "Manager FirstName LastName"
          }
        }

    return `Call ${index + 1}: Role: ${roleDisplay}\nTranscription:\n${rec.transcription}\n\n`;
  })
  .join('')
  .trim();
    console.log(`[DEBUG] Combined transcript is ${combinedTranscript.length} characters long.`);
    if (combinedTranscript.length === 0) {
        throw new Error("Combined transcript is empty, cannot proceed with analysis.");
    }

    await supabase.from('tickets').update({ 
      transcription: combinedTranscript
    }).eq('id', ticket.id)
    
    console.log("[PROGRESS] Transcript saved. Preparing for Gemini analysis call.");

    // Analyze the combined transcript to get structured JSON 
    const analysisPrompt = `
      You are an expert AI assistant for a restaurant's customer support analysis.
      Analyze the following transcript of a customer incident. Based ONLY on this text, extract the required information.
      If a value is not mentioned, return null for that field.
      For the 'Branch' field, if no specific branch is mentioned, default to 'General'.
      For 'Customer_Care_Notes' and 'AI_Summary', generate the content based on your analysis.

       **Specific Field Instructions:**
      - **AI_Summary:** Provide a concise, neutral summary of the entire interaction.
      - **Customer_Care_Notes:** Do NOT summarize the call. Instead, suggest one brief, actionable step the restaurant could take to prevent this specific issue from happening again. If no preventative action is logical or possible based on the transcript, the value MUST be \`null\`.

      **General Rules:**
      1.  Analyze the content of the transcript ONLY. Do not invent information. DO NOT HALLUCINATE
      2.  If information for a field is not mentioned in the transcript, its value MUST be \`null\`.
      3.  The final output MUST be a single, valid JSON object and nothing else. Do not include any text or explanations outside of the JSON structure.

      Transcript:
      """
      ${combinedTranscript}
      """
    `;

    console.log("[SENDING] Attempting to call Gemini for structured analysis...");

    const analysisResult = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: analysisPrompt }] }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: analysisSchema,
      },
    });

    const rawResponseText = analysisResult.response.text();
    console.log("[RESPONSE] Raw analysis response from Gemini:", rawResponseText);


    const analysisJson = JSON.parse(analysisResult.response.text());
    console.log("[RESPONSE PARSED]: ", analysisJson)
    // Loop through the JSON object and convert any string "null" to a real null value.
    Object.keys(analysisJson).forEach(key => {
        if (analysisJson[key] === "null") {
            analysisJson[key] = null;
        }
    });

    // Update the ticket by spreading the cleaned JSON keys into their respective columns.
    const { error } = await supabase.from('tickets').update({
      ...analysisJson,
      columns_field: analysisJson, 
      status: 'done'
    }).eq('id', ticket.id)

    if (error) {
        console.error("Error updating Supabase:", error);
        throw new Error(`Failed to update ticket in Supabase: ${error.message}`);
    }
    console.log(`[SUCCESS] Ticket ${ticket.id} processed and updated successfully.`);
    return new Response(JSON.stringify({ message: `Successfully processed ticket ${ticket.id}` }), { status: 200 })

} catch (error) {
    const errorMessage = error.message || 'An unknown error occurred';
    console.error(`Failed to process ticket ${ticket.id}:`, error)
    
    await supabase.from('tickets').update({ 
      status: 'failed'
    }).eq('id', ticket.id)

    await supabase.from('ticket_errors').insert({
        ticket_id: ticket.id,
        error_message: errorMessage
    });

  console.error(`[CRITICAL FAILURE] An error occurred while processing ticket ${ticket.id}:`, error);

   return new Response(JSON.stringify({ message: "Function executed, processing failed.", error: errorMessage }), { status: 200 })
}
})