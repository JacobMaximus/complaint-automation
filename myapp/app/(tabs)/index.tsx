import * as DocumentPicker from 'expo-document-picker';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Button,
  FlatList,
  ListRenderItem,
  Platform,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
// **STEP 1: Import Supabase and the polyfill**
import { createClient } from '@supabase/supabase-js';
import 'react-native-url-polyfill/auto';

// **STEP 2: Add your Supabase Project URL and anon key**
// Replace these with your actual Supabase project details!
const supabaseUrl = '******'; 
const supabaseAnonKey = '******';

// Create a single Supabase client for your app
const supabase = createClient(supabaseUrl, supabaseAnonKey);


type FileAsset = DocumentPicker.DocumentPickerAsset;

export default function App() {
  const [selectedFiles, setSelectedFiles] = useState<FileAsset[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);

  const pickDocuments = async () => {
    // ... (This function remains unchanged)
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: 'audio/*', multiple: true });
      if (!result.canceled) {
        setSelectedFiles(currentFiles => {
          const allFiles = [...currentFiles, ...result.assets];
          const uniqueFiles = Array.from(new Map(allFiles.map(file => [file.uri, file])).values());
          return uniqueFiles;
        });
      }
    } catch (error) {
      console.error('Error picking documents:', error);
    }
  };

  const handleRemoveFile = (fileUri: string) => {
    // ... (This function remains unchanged)
    setSelectedFiles(currentFiles => currentFiles.filter(file => file.uri !== fileUri));
  };

  const handleClearAll = () => {
    // ... (This function remains unchanged)
    setSelectedFiles([]);
  };

  /**
   * **STEP 3: REAL UPLOAD FUNCTION**
   * This function now uploads the selected files to Supabase Storage.
   */
  const handleProcessUpload = async () => {
    if (selectedFiles.length === 0) return;
    setIsProcessing(true);

    // We use Promise.all to handle all uploads concurrently
    const uploadPromises = selectedFiles.map(async (file) => {
      // Supabase requires a special format (FormData) for file uploads from mobile
      const formData = new FormData();
      // 'uri' on mobile is the full file path. We need to prepare it for upload.
      const fileToUpload = {
        uri: file.uri,
        name: file.name,
        type: file.mimeType || 'application/octet-stream', // Provide a fallback MIME type
      } as any;

      formData.append('file', fileToUpload);

      // Upload the file to the 'call-recordings' bucket.
      // The file will be named with a timestamp to avoid overwrites.
      const fileName = `${Date.now()}_${file.name}`;
      const { data, error } = await supabase.storage
        .from('call-recordings')
        .upload(fileName, formData);

      if (error) {
        console.error('Error uploading file:', file.name, error);
        return { success: false, name: file.name };
      }
      
      console.log('Successfully uploaded:', data.path);
      return { success: true, name: file.name };
    });

    const results = await Promise.all(uploadPromises);
    const failedUploads = results.filter(r => !r.success);

    if (failedUploads.length > 0) {
      Alert.alert(
        'Upload Complete with Errors',
        `Failed to upload: ${failedUploads.map(f => f.name).join(', ')}`
      );
    } else {
      Alert.alert(
        'Upload Successful',
        `All ${selectedFiles.length} files have been uploaded.`
      );
      // Clear files after successful upload
      setSelectedFiles([]);
    }

    setIsProcessing(false);
  };

  const renderFileItem: ListRenderItem<FileAsset> = ({ item }) => (
    // ... (This component remains unchanged)
    <View style={styles.listItem}>
      <View style={styles.fileInfo}>
        <Text style={styles.fileName} numberOfLines={1} ellipsizeMode="middle">
          {item.name}
        </Text>
        <Text style={styles.fileSize}>
          {item.size ? `${(item.size / 1024 / 1024).toFixed(2)} MB` : 'Size N/A'}
        </Text>
      </View>
      <TouchableOpacity onPress={() => handleRemoveFile(item.uri)} style={styles.removeButton} disabled={isProcessing}>
        <Text style={styles.removeButtonText}>X</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    // ... (The main view remains mostly unchanged)
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <Text style={styles.title}>AI Complaint Processor</Text>
      <Text style={styles.instructions}>
        Welcome, Mr. X. Select today's call recordings to begin.
      </Text>
      <View style={styles.buttonContainer}>
        <Button title="Add Call Recordings" onPress={pickDocuments} color={Platform.OS === 'ios' ? '#FFFFFF' : '#007AFF'} />
      </View>
      {selectedFiles.length > 0 && (
        <View style={styles.listContainer}>
          <View style={styles.listHeaderContainer}>
            <Text style={styles.listHeader}>Selected Files ({selectedFiles.length}):</Text>
            <TouchableOpacity onPress={handleClearAll} style={styles.clearButton} disabled={isProcessing}>
              <Text style={styles.clearButtonText}>Clear All</Text>
            </TouchableOpacity>
          </View>
          <FlatList data={selectedFiles} keyExtractor={(item) => item.uri} renderItem={renderFileItem} style={{ flex: 1 }} />
        </View>
      )}
      {selectedFiles.length > 0 && (
        <TouchableOpacity style={[styles.processButton, isProcessing && styles.disabledButton]} onPress={handleProcessUpload} disabled={isProcessing}>
          {isProcessing ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.processButtonText}>Upload & Process Files</Text>}
        </TouchableOpacity>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  // ... (All styles remain unchanged)
  container: { flex: 1, backgroundColor: '#f4f4f8', alignItems: 'center', paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0, paddingHorizontal: 20 },
  title: { fontSize: 24, fontWeight: 'bold', marginVertical: 20, color: '#333' },
  instructions: { fontSize: 16, textAlign: 'center', color: '#555', marginBottom: 20 },
  buttonContainer: { width: '100%', backgroundColor: Platform.OS === 'ios' ? '#007AFF' : 'transparent', borderRadius: 8, overflow: 'hidden', marginBottom: 10 },
  listContainer: { flex: 1, width: '100%', borderTopWidth: 1, borderTopColor: '#e0e0e0', marginTop: 10 },
  listHeaderContainer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 15 },
  listHeader: { fontSize: 18, fontWeight: '600', color: '#333' },
  clearButton: { paddingVertical: 4, paddingHorizontal: 10, backgroundColor: '#e0e0e0', borderRadius: 15 },
  clearButtonText: { color: '#333', fontSize: 12, fontWeight: '500' },
  listItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 15, backgroundColor: '#ffffff', borderRadius: 8, marginBottom: 10, borderWidth: 1, borderColor: '#eee' },
  fileInfo: { flex: 1, marginRight: 10 },
  fileName: { fontSize: 14, color: '#444', fontWeight: '500' },
  fileSize: { fontSize: 12, color: '#888', marginTop: 2 },
  removeButton: { padding: 8, backgroundColor: '#fce8e6', borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  removeButtonText: { color: '#ea4335', fontWeight: 'bold', fontSize: 14 },
  processButton: { width: '100%', backgroundColor: '#28a745', padding: 15, borderRadius: 8, alignItems: 'center', justifyContent: 'center', marginVertical: 10 },
  processButtonText: { color: '#ffffff', fontSize: 16, fontWeight: 'bold' },
  disabledButton: { backgroundColor: '#a5d6a7' },
});

