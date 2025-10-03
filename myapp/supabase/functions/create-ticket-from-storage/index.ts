// supabase/functions/create-ticket-from-storage/index.ts

import { serve } from 'https://deno.land/std/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async (req) => {
  try {
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const file = await req.json()
    
    if (file && file.name.endsWith('incident_details.json')) {
      const storagePath = file.name.substring(0, file.name.lastIndexOf('/'))

      const { data: jsonData, error: downloadError } = await supabase.storage.from('call-recordings').download(file.name)
      if (downloadError) throw downloadError
      
      const incidentDetails = JSON.parse(await jsonData.text())
      const incidentTime = new Date(incidentDetails.incidentTime * 1000).toISOString()

      // 1. Create the main ticket entry
      const { data: ticketData, error: ticketError } = await supabase
        .from('tickets')
        .insert({
          storage_path: storagePath,
          incident_time: incidentTime,
          status: 'pending'
        })
        .select('id')
        .single() // Important: .single() returns the created object

      if (ticketError) throw ticketError
      const ticketId = ticketData.id

      // 2. NEW: Create a recording entry for each file in the JSON
      if (incidentDetails.files && incidentDetails.files.length > 0) {
        const recordingsToInsert = incidentDetails.files.map((file: any) => ({
          ticket_id: ticketId,
          file_name: file.fileName,
          role: file.role,
          recording_time: new Date(file.dateUNIX * 1000).toISOString(),
          transcription: null // Starts as null
        }))

        const { error: recordingsError } = await supabase.from('recordings').insert(recordingsToInsert)
        if (recordingsError) throw recordingsError
      }

      return new Response(JSON.stringify({ message: `Ticket ${ticketId} and recordings created` }), { status: 200 })
    }
    
    return new Response(JSON.stringify({ message: 'Not an incident details file, skipping.' }), { status: 200 })
  } catch (error) {
    console.error('Error in create-ticket-from-storage:', error)
    return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  }
})