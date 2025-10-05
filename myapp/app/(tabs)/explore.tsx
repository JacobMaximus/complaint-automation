// import React, { useState } from 'react';
// import { Button, Platform, StyleSheet, Text, View } from 'react-native';

// // Import the library for picking documents
// import * as DocumentPicker from 'expo-document-picker';

// export default function App() {
//   // State to display information on the screen
//   const [fileInfoMessage, setFileInfoMessage] = useState<string>('Pick a file to see its info.');

//   /**
//    * Handles the file picking and information retrieval process.
//    */
//   const pickAndAnalyzeFile = async () => {
//     try {
//       // 1. Open the document picker
//       // request the lastModified time directly from the picker
//       const result = await DocumentPicker.getDocumentAsync({
//         copyToCacheDirectory: true, // This is the default
//       });

//       // 2. Check if the user cancelled the picker
//       if (result.canceled) {
//         setFileInfoMessage('File picking was cancelled.');
//         console.log('File picking was cancelled.');
//         return;
//       }
      
//       // --- PLATFORM-SPECIFIC LOGIC ---

//       if (Platform.OS === 'web') {
//         // WEB PLATFORM LOGIC
//         const file = result.output?.[0];
        
//         if (file) {
//           const fileName = file.name;
//           // Web already provides milliseconds.
//           const modTime = file.lastModified;
//           const modDate = new Date(modTime);
//           const message = `File: ${fileName}\nLast Modified: ${modDate.toLocaleString()}`;
//           console.log('--- File Info (Web) ---');
//           console.log(`File Name: ${fileName}, Timestamp: ${modTime}`);
//           setFileInfoMessage(message);
//         } else {
//            setFileInfoMessage('Could not get the file on web.');
//         }

//       } else {
//         // NATIVE PLATFORM LOGIC (iOS / Android)
//         const fileAsset = result.assets?.[0];

//         if (!fileAsset) {
//           setFileInfoMessage('Could not get the file asset.');
//           return;
//         }

//         const { name: fileName, lastModified } = fileAsset;

//         // The 'lastModified' property from DocumentPicker gives us the original file's timestamp
//         if (lastModified) {
//           // This value is already in MILLISECONDS, so we can use it directly.
//           const modDate = new Date(lastModified);
//           const message = `File: ${fileName}\nLast Modified: ${modDate.toLocaleString()}`;
          
//           console.log('--- File Info (Native from DocumentPicker) ---');
//           console.log(`Original Timestamp (ms): ${lastModified}`);
//           setFileInfoMessage(message);

//         } else {
//           // Fallback message if the picker couldn't retrieve the original timestamp
//           const errorMessage = `Modification time not available for '${fileName}'.`;
//           console.log(errorMessage);
//           setFileInfoMessage(errorMessage);
//         }
//       }

//     } catch (error) {
//       console.error('An error occurred:', error);
//       setFileInfoMessage(`An error occurred: [${error}]`);
//     }
//   };

//   return (
//     <View style={styles.container}>
//       <Text style={styles.title}>File Modification Time Checker</Text>
//       <Button title="Pick a File" onPress={pickAndAnalyzeFile} />
//       <Text style={styles.infoText}>{fileInfoMessage}</Text>
//     </View>
//   );
// }

// const styles = StyleSheet.create({
//   container: {
//     flex: 1,
//     backgroundColor: '#f0f0f0',
//     alignItems: 'center',
//     justifyContent: 'center',
//     padding: 20,
//   },
//   title: {
//     fontSize: 22,
//     fontWeight: 'bold',
//     marginBottom: 20,
//     textAlign: 'center',
//   },
//   infoText: {
//     marginTop: 20,
//     fontSize: 16,
//     textAlign: 'center',
//     color: '#333',
//     paddingHorizontal: 10,
//   },
// });

import { createClient } from '@supabase/supabase-js';
import * as DocumentPicker from 'expo-document-picker';
import React, { useState } from 'react';
import { ActivityIndicator, Alert, Button, Platform, StyleSheet, Text, View } from 'react-native';
import 'react-native-url-polyfill/auto'; // Good practice to keep for Supabase

// Load credentials from environment variables ---
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

// Check if the variables are loaded correctly
if (!supabaseUrl || !supabaseAnonKey) {
  // Use an Alert for better visibility on mobile
  Alert.alert(
    'Configuration Error',
    'Supabase URL and Anon Key must be provided in your .env file.'
  );
}

// Initialize the Supabase client, providing empty strings as a fallback
const supabase = createClient(supabaseUrl || '', supabaseAnonKey || '');


export default function App() {
  const [fileInfoMessage, setFileInfoMessage] = useState<string>('Pick a file to see its info.');
  const [isLoading, setIsLoading] = useState<boolean>(false);

  // Appends the given file name to Google Sheets via a Supabase Edge Function.
  const appendFileNameToSheet = async (fileName: string) => {
    setIsLoading(true);
    setFileInfoMessage(`Adding '${fileName}' to Google Sheets...`);

    try {
      // Invoke the Edge Function
      const { data, error } = await supabase.functions.invoke('append-to-sheet', {
        body: { fileName: fileName },
      });

      if (error) {
        throw error;
      }

      console.log('Function response:', data);
      setFileInfoMessage(`Successfully added '${fileName}' to the sheet! 🎉`);

    } catch (error: any) {
      console.error('Error invoking function:', error);
      setFileInfoMessage(`Error: Could not add file to sheet. ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  // Handles the file picking process and then calls the function to update the sheet.
  const pickAndAnalyzeFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        copyToCacheDirectory: true,
      });

      if (result.canceled) {
        setFileInfoMessage('File picking was cancelled.');
        return;
      }
      
      let fileName: string | undefined;

      if (Platform.OS === 'web') {
        fileName = result.output?.[0]?.name;
      } else {
        fileName = result.assets?.[0]?.name;
      }

      if (fileName) {
        await appendFileNameToSheet(fileName);
      } else {
        setFileInfoMessage('Could not get the file name.');
      }

    } catch (error: any) {
      console.error('An error occurred during file picking:', error);
      setFileInfoMessage(`An error occurred: [${error.message}]`);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>File to Google Sheet Uploader</Text>
      <Button title="Pick and Upload File Name" onPress={pickAndAnalyzeFile} disabled={isLoading} />
      {isLoading && <ActivityIndicator size="large" color="#0000ff" style={{ marginTop: 20 }} />}
      <Text style={styles.infoText}>{fileInfoMessage}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f0f0f0',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 20,
    textAlign: 'center',
  },
  infoText: {
    marginTop: 20,
    fontSize: 16,
    textAlign: 'center',
    color: '#333',
    paddingHorizontal: 10,
  } ,
});