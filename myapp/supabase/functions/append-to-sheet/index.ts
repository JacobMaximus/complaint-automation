import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
// Import the Deno JWT library for creating the token
import { create, getNumericDate } from 'https://deno.land/x/djwt@v3.0.2/mod.ts';

const GOOGLE_TOKEN_URI = 'https://oauth2.googleapis.com/token';
const SPREADSHEET_SCOPE = 'https://www.googleapis.com/auth/spreadsheets';

serve(async (req) => {
  // CORS preflight request handling 
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    });
  }

  try {
    // Get Secrets and Request Body
    const serviceAccountJson = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_JSON');
    const spreadsheetId = Deno.env.get('SPREADSHEET_ID');
    if (!serviceAccountJson || !spreadsheetId) {
      throw new Error('Missing environment variables');
    }
    const credentials = JSON.parse(serviceAccountJson);
    const { fileName } = await req.json();
    if (!fileName) {
      throw new Error('fileName is required in the request body');
    }

    // Import the private key to create a CryptoKey for signing
    const privateKey = await crypto.subtle.importKey(
      'pkcs8',
      Uint8Array.from(atob(
        credentials.private_key
          .replace('-----BEGIN PRIVATE KEY-----', '')
          .replace('-----END PRIVATE KEY-----', '')
          .replace(/\s/g, '')
      ), c => c.charCodeAt(0)),
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      true,
      ['sign']
    );

    // Create a JWT Assertion
    const jwt = await create(
      { alg: 'RS256', typ: 'JWT' },
      {
        iss: credentials.client_email,
        scope: SPREADSHEET_SCOPE,
        aud: GOOGLE_TOKEN_URI,
        exp: getNumericDate(3600), // Expires in 1 hour
        iat: getNumericDate(0),
      },
      privateKey
    );

    // Exchange the JWT for a Google API Access Token
    const tokenResponse = await fetch(GOOGLE_TOKEN_URI, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: jwt,
      }),
    });

    if (!tokenResponse.ok) {
      const errorBody = await tokenResponse.text();
      throw new Error(`Failed to get access token: ${errorBody}`);
    }
    const { access_token } = await tokenResponse.json();

    // Use the Access Token to call the Google Sheets API
    const now = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
    const valuesToAppend = { values: [[now, fileName]] };

    const sheetsApiUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Sheet1!A1:append?valueInputOption=USER_ENTERED`;
    
    const sheetsResponse = await fetch(sheetsApiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(valuesToAppend),
    });

    if (!sheetsResponse.ok) {
      const errorBody = await sheetsResponse.text();
      throw new Error(`Failed to append to sheet: ${errorBody}`);
    }

    const responseData = await sheetsResponse.json();

    // Send success response
    return new Response(JSON.stringify({ success: true, data: responseData }), {
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
       },
    });

  } catch (error) {
    console.error('Error in function:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }
});