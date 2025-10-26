# AI Complaint Processor

This project is a full-stack mobile application built with Expo and Supabase that automates the processing of customer complaint audio recordings. It leverages Google's Gemini AI to transcribe conversations, extract structured data, and store the final, categorized information within the Supabase database for analysis.

## Features

  * **Audio Upload**: Select multiple audio recordings from a mobile device.
  * **AI Transcription**: Automatically transcribes conversations with speaker diarization to distinguish between different speakers.
  * **AI Data Extraction**: Analyzes the combined transcript to extract key information (Branch, Category, Issue Details, etc.) into a structured JSON format.
  * **Automated Workflow**: Uses Supabase Storage Triggers and Edge Functions to create a fully automated, serverless backend.
  * **Structured Data Storage**: Saves the extracted JSON data directly into the Supabase database for analysis and reporting.

## Technology Stack

  * **Frontend**: React Native (Expo)
  * **Backend**: Supabase (Database, Storage, Edge Functions)
  * **AI Model**: Google Gemini

## Project Structure

```
.
├── app/              # Expo app screens
│   └── (tabs)/       # Main files for the app's pages
├── supabase/
│   └── functions/    # Supabase Edge Functions
│       ├── create-ticket-from-storage/ # Triggered on file upload to create tickets
│       ├── process-ticket/             # Main function for transcription and analysis
│       └── append-to-sheet/            # (Archived) - Former PoC for updating Google Sheets via API.
```

## Setup Guide

### 1. Prerequisites

  * Node.js (LTS version)
  * A Supabase account
  * A Google Cloud Platform account
  * Supabase CLI: `npm install -g supabase`


### 2. Install Dependencies

Install the necessary packages for the Expo application.

```bash
npm install
```


### 3. Supabase Project Setup

1.  **Create a Supabase Project**: Navigate to the Supabase Dashboard and create a new project.

2.  **Link The Project**: Link the local repository to the Supabase project via the terminal.

    ```bash
    supabase login
    supabase link --project-ref <PROJECT_ID>
    ```

    The `<PROJECT_ID>` is available in the Supabase project's URL.

3.  **Create `.env` file**: Create a `.env` file in the project root. Add the Supabase URL and Anon Key, which are located in the Supabase Dashboard under **Settings** \> **API**.

    ```env
    EXPO_PUBLIC_SUPABASE_URL="<SUPABASE_PROJECT_URL>"
    EXPO_PUBLIC_SUPABASE_ANON_KEY="<SUPABASE_ANON_KEY>"
    ```

4.  **Set up Database Schema**: Navigate to the **SQL Editor** in the Supabase dashboard and execute the entire query below to create the necessary tables and types.

    ```sql
    -- Custom ENUM type for status
    CREATE TYPE ticket_status AS ENUM ('pending', 'processing', 'done', 'failed');

    -- Main tickets table
    CREATE TABLE public.tickets (
      id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
      created_at timestamp with time zone NOT NULL DEFAULT now(),
      status ticket_status NOT NULL DEFAULT 'pending',
      incident_time timestamp with time zone,
      storage_path text NOT NULL,
      transcription text,
      columns_field jsonb
    );

    -- Columns to store more details
    ALTER TABLE public.tickets
    ADD COLUMN "Name" text,
    ADD COLUMN "Branch" text,
    ADD COLUMN "Status" text,
    ADD COLUMN "Status_Other" text,
    ADD COLUMN "Bill_No" text,
    ADD COLUMN "Category" text[],
    ADD COLUMN "Category_Other" text,
    ADD COLUMN "AI_Summary" text,
    ADD COLUMN "Order_Type" text,
    ADD COLUMN "Order_Type_Other" text,
    ADD COLUMN "Ticket_Type" text,
    ADD COLUMN "Ticket_Type_Other" text,
    ADD COLUMN "Table_No" text,
    ADD COLUMN "Token_No" text,
    ADD COLUMN "Waiter_Name" text,
    ADD COLUMN "Captain_Name" text,
    ADD COLUMN "Staff_Responsible" text,
    ADD COLUMN "Issue_Details" text,
    ADD COLUMN "Action_Taken" text,
    ADD COLUMN "Customer_Care_Notes" text,
    ADD COLUMN "Resolution_Feedback_From_Customer" text;

    -- Table for individual recordings
    CREATE TABLE public.recordings (
      id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
      created_at timestamp with time zone NOT NULL DEFAULT now(),
      ticket_id uuid NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
      file_name text NOT NULL,
      role text NOT NULL,
      recording_time timestamp with time zone NOT NULL,
      transcription text
    );

    -- Index for faster lookups
    CREATE INDEX idx_recordings_ticket_id ON public.recordings(ticket_id);
    ```

5.  **Create Storage Bucket**: Navigate to **Storage** in the Supabase dashboard and create a **new public bucket** named `call-recordings`.

6.  **Enable Database Extensions and RLS Policies**: Execute the entire query below in the SQL Editor.

      * The `http` extension is required for the triggers to call Edge Functions.
      * The RLS policies are required for the Expo app to read data from the tables.


    ```sql
    -- 1. Enable the HTTP extension to allow triggers to make web requests
    create extension if not exists http with schema extensions;

    -- 2. Enable RLS on the tables
    ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;
    ALTER TABLE public.recordings ENABLE ROW LEVEL SECURITY;

    -- 3. Create a read-only policy for the 'tickets' table
    CREATE POLICY "Allow public read-only access on tickets"
    ON public.tickets
    FOR SELECT
    TO anon, authenticated
    USING (true);

    -- 4. Create a read-only policy for the 'recordings' table
    CREATE POLICY "Allow public read-only access on recordings"
    ON public.recordings
    FOR SELECT
    TO anon, authenticated
    USING (true);
    ```


### 4. Configure Secrets

Set the required secret for the Gemini API key.

```bash
# Obtain the key from Google AI Studio
npx supabase secrets set GEMINI_API_KEY="<GEMINI_API_KEY>"
```


### 5. Set up Database Triggers

Execute the entire query below in the **SQL Editor** to create the triggers that automate the workflow. The placeholder values must be replaced.
The `<SUPABASE_PROJECT_URL>` and `<SUPABASE_SERVICE_ROLE_KEY>` are located in the Supabase Dashboard under **Settings \> API**.

```sql
-- Trigger 1: Fires on new file upload to start the process
CREATE OR REPLACE FUNCTION handle_new_object()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET SEARCH_PATH = public
AS $$
BEGIN
  PERFORM net.http_post(
    url := '<SUPABASE_PROJECT_URL>/functions/v1/create-ticket-from-storage',
    headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer <SUPABASE_SERVICE_ROLE_KEY>'
    ),
    body := jsonb_build_object('name', new.name, 'bucket_id', new.bucket_id)
  );
  RETURN new;
END;
$$;

CREATE OR REPLACE TRIGGER on_new_object
  AFTER INSERT ON storage.objects
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_object();

-- Trigger 2: Fires on new ticket creation to process it
CREATE OR REPLACE FUNCTION request_ticket_processing()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET SEARCH_PATH = public
AS $$
BEGIN
  PERFORM net.http_post(
    url := '<SUPABASE_PROJECT_URL>/functions/v1/process-ticket',
    headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer <SUPABASE_SERVICE_ROLE_KEY>'
    ),
    body := jsonb_build_object('record', new)
  );
  RETURN new;
END;
$$;

CREATE OR REPLACE TRIGGER on_ticket_created
  AFTER INSERT ON public.tickets
  FOR EACH ROW EXECUTE PROCEDURE public.request_ticket_processing();
```


### 6. Deploy Edge Functions

Deploy the Edge Functions from the `supabase/functions` directory.

```bash
npx supabase functions deploy
```


### 7. Run the Application

Start the Expo client.

```bash
npx expo start
```


### 8. Optional: Google Sheets Integration

This section details the setup for the archived `append-to-sheet` function, which serves as a proof-of-concept for logging data directly to a Google Sheet.

#### a. Google Cloud Configuration

This process requires a Google Cloud project with a configured service account to grant secure, server-to-server access to the Google Sheets API.

1.  **Enable Google Sheets API**

      * Navigate to the Google Cloud Console and select a project.
      * Go to **APIs & Services \> Library**.
      * Search for **Google Sheets API** and enable it for the project.

2.  **Create a Service Account**

      * Navigate to **APIs & Services \> Credentials**.
      * Select **Create Credentials \> Service account**.
      * Provide a name and role for the service account and create it.

3.  **Generate a JSON Key**

      * Select the newly created service account.
      * Navigate to the **Keys** tab and select **Add Key \> Create new key**.
      * Choose **JSON** as the key type. The key file will be downloaded. This file must be stored securely and not committed to version control.

#### b. Google Sheet Configuration

A new Google Sheet is required to serve as the destination for the data.

1.  **Create a Google Sheet**

      * Create a new spreadsheet in a Google account.

2.  **Obtain the Spreadsheet ID**

      * The ID is the string located in the spreadsheet's URL:
        `.../spreadsheets/d/`\<SPREADSHEET\_ID\>`/edit`

3.  **Grant Editor Permissions**

      * Open the downloaded service account JSON key file and copy the `client_email` value.
      * In the Google Sheet, click **Share**.
      * Paste the `client_email` and assign it the **Editor** role.

#### c. Supabase Secret Configuration

The function requires the spreadsheet ID and Google credentials to be set as secrets in the Supabase project.

1.  **Set the Spreadsheet ID**

    ```bash
    npx supabase secrets set SPREADSHEET_ID="<SPREADSHEET_ID>"
    ```

2.  **Set the Google Credentials**

    ```bash
    # Provide the path to the downloaded JSON key file.
    npx supabase secrets set GOOGLE_SERVICE_ACCOUNT_JSON="$(cat path/to/key.json)"
    ```

#### d. Function Deployment

Deploy the specific Edge Function to Supabase. It will automatically access the configured secrets.

```bash
npx supabase functions deploy append-to-sheet
```
