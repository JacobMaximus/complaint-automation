import { createClient } from '@supabase/supabase-js';
import { Audio } from 'expo-av';
import * as DocumentPicker from 'expo-document-picker';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaView } from 'react-native-safe-area-context';
import 'react-native-url-polyfill/auto';


const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  Alert.alert(
    'Configuration Error',
    'Supabase URL and Anon Key must be provided in a .env file.'
  )
}
const supabase = createClient(supabaseUrl || '', supabaseAnonKey || '')


type FileRole = 'Customer' | 'Manager' | 'Other';
type AppState = 'home' | 'ticket'


type ExtendedAsset = DocumentPicker.DocumentPickerAsset & {
  lastModified?: number;
};

type AppFile = {
  asset: ExtendedAsset
  role: FileRole
}

export default function App() {
  const [appState, setAppState] = useState<AppState>('home')
  const [selectedFiles, setSelectedFiles] = useState<AppFile[]>([])
  const [isProcessing, setIsProcessing] = useState(false)
  const [processingStatus, setProcessingStatus] = useState('')
  // The incidentDate state is no longer needed

  const [sound, setSound] = useState<Audio.Sound | null>(null)
  const [currentlyPlayingUri, setCurrentlyPlayingUri] = useState<string | null>(null)

  async function handlePlayback(item: AppFile) {
    if (sound) {
      await sound.unloadAsync()
      setSound(null)
      if (currentlyPlayingUri === item.asset.uri) {
        setCurrentlyPlayingUri(null)
        return
      }
    }

    try {
      setCurrentlyPlayingUri(item.asset.uri)
      const { sound: newSound } = await Audio.Sound.createAsync(
        { uri: item.asset.uri },
        { shouldPlay: true }
      )
      newSound.setOnPlaybackStatusUpdate((status: any) => { 
        if (status.isLoaded && status.didJustFinish) {
          setCurrentlyPlayingUri(null)
          newSound.unloadAsync()
          setSound(null)
        }
      })
      setSound(newSound)
    } catch (error) {
      console.error('Failed to play sound', error)
      setCurrentlyPlayingUri(null)
    }
  }
  
  useEffect(() => {
    return sound ? () => { sound.unloadAsync(); } : undefined;
  }, [sound]);

  const pickDocuments = async (isInitial: boolean = false) => {
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: 'audio/*', multiple: true })
      if (!result.canceled) {
        const newFiles: AppFile[] = result.assets.map((asset) => ({
          asset: asset as ExtendedAsset,
          role: 'Customer'
        }))
        setSelectedFiles((currentFiles) => {
          const allFiles = [...currentFiles, ...newFiles]
          const uniqueFiles = Array.from(new Map(allFiles.map((file) => [file.asset.uri, file])).values())

          // **AUTOMATIC SORTING LOGIC**
          uniqueFiles.sort((a, b) => 
            (a.asset.lastModified || 0) - (b.asset.lastModified || 0)
          );

          console.log('--- Sorted File Timestamps ---');
          uniqueFiles.forEach((file) => {
            if (typeof file.asset.lastModified === 'number') {
              const modDate = new Date(file.asset.lastModified);
              console.log(`File: ${file.asset.name}, Last Modified: ${modDate.toLocaleString("en-IN")}`);
            } else {
              console.log(`File: ${file.asset.name}, Last Modified: N/A`);
            }
          });
          console.log('-----------------------------');

          return uniqueFiles
        })
        if (isInitial) {
          setAppState('ticket')
        }
      }
    } catch (error) {
      console.error('Error picking documents:', error)
    }
  }

  const handleNewTicket = () => pickDocuments(true)

  const handleRoleChange = (fileUri: string, newRole: FileRole) => {
    setSelectedFiles((currentFiles) =>
      currentFiles.map((file) =>
        file.asset.uri === fileUri ? { ...file, role: newRole } : file
      )
    )
  }
  const handleRemoveFile = (fileUri: string) => {
    setSelectedFiles((currentFiles) =>
      currentFiles.filter((file) => file.asset.uri !== fileUri)
    )
  }
  const handleClearAll = () => {
    if (sound) sound.unloadAsync();
    setSound(null);
    setCurrentlyPlayingUri(null);
    setSelectedFiles([])
    // setIncidentDate(null) // No longer needed
    setAppState('home')
  }

  const handleProcessUpload = async () => {
    if (selectedFiles.length === 0) {
      Alert.alert('No files selected', 'Please add files to upload.')
      return
    }
    
    // **AUTOMATIC INCIDENT TIME**
    // The incident time is now derived from the first file in the sorted list.
    const firstFileTimestamp = selectedFiles[0].asset.lastModified;
    const incidentDate = typeof firstFileTimestamp === 'number'
      ? new Date(firstFileTimestamp)
      : new Date(); // Fallback to current time if the first file has no timestamp

    setIsProcessing(true);

    try {
      
      console.log('--- Starting Incident Upload ---');
      // **LOGGING THE AUTOMATIC TIME**
      console.log('Incident Start Time (from earliest file):', incidentDate.toISOString());
      console.log('Call Order:');
      selectedFiles.forEach((file, index) => {
        console.log(`${index + 1}. ${file.asset.name} (${file.role})`);
      });
      console.log('------------------------------------');

      const batchFolder = Date.now().toString();

      const uploadPromises = selectedFiles.map(async (appFile, index) => {
        setProcessingStatus(`Uploading file ${index + 1} of ${selectedFiles.length}...`);
        const { asset, role } = appFile;
        
        const formData = new FormData();
        formData.append('file', {
          uri: asset.uri,
          name: asset.name,
          type: asset.mimeType || 'application/octet-stream',
        } as any);

        const filePath = `${batchFolder}/${index + 1}_${role}_${asset.name}`;

        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('call-recordings')
          .upload(filePath, formData);

        if (uploadError) {
          throw new Error(`Failed to upload ${asset.name}: ${uploadError.message}`);
        }
        
        console.log(`Successfully uploaded ${uploadData.path}`);
        return uploadData;
      });

      await Promise.all(uploadPromises);

      Alert.alert(
        'Upload Successful',
        `Batch ${batchFolder} with ${selectedFiles.length} files has been uploaded.`
      );
      handleClearAll();

    } catch (error: any) {
      console.error('An error occurred during processing:', error);
      Alert.alert('Processing Error', error.message);
    } finally {
      setIsProcessing(false);
      setProcessingStatus('');
    }
  }

  const renderFileItem = ({ item }: { item: AppFile }) => {
    const isPlaying = currentlyPlayingUri === item.asset.uri;
    const formattedDate = typeof item.asset.lastModified === 'number'
      ? new Date(item.asset.lastModified).toLocaleString("en-IN")
      : 'Date N/A';

    return (
      <View style={styles.listItem}>
        <View style={styles.fileInfo}>
          <Text style={styles.fileName} numberOfLines={1} ellipsizeMode="middle">{item.asset.name}</Text>
          <Text style={styles.fileMetadata}>{formattedDate}</Text>
          <Text style={styles.fileMetadata}>{item.asset.size ? `${(item.asset.size / 1024 / 1024).toFixed(2)} MB` : 'Size N/A'}</Text>
          <View style={styles.actionRow}>
            
            <View style={styles.roleSelectorContainer}>
              <TouchableOpacity style={[styles.roleButton, item.role === 'Customer' && styles.roleButtonSelected]} onPress={() => handleRoleChange(item.asset.uri, 'Customer')}><Text style={[styles.roleButtonText, item.role === 'Customer' && styles.roleButtonTextSelected]}>Customer</Text></TouchableOpacity>
              <TouchableOpacity style={[styles.roleButton, item.role === 'Manager' && styles.roleButtonSelected]} onPress={() => handleRoleChange(item.asset.uri, 'Manager')}><Text style={[styles.roleButtonText, item.role === 'Manager' && styles.roleButtonTextSelected]}>Manager</Text></TouchableOpacity>
            
              <TouchableOpacity style={[styles.roleButton, item.role === 'Other' && styles.roleButtonSelected]} onPress={() => handleRoleChange(item.asset.uri, 'Other')}><Text style={[styles.roleButtonText, item.role === 'Other' && styles.roleButtonTextSelected]}>Other</Text></TouchableOpacity>
            </View>
            <TouchableOpacity style={styles.playButton} onPress={() => handlePlayback(item)}>
              <Text style={styles.playButtonText}>{isPlaying ? '■' : '▶'}</Text>
            </TouchableOpacity>
          </View>
        </View>
        <TouchableOpacity onPress={() => handleRemoveFile(item.asset.uri)} style={styles.removeButton} disabled={isProcessing}>
          <Text style={styles.removeButtonText}>X</Text>
        </TouchableOpacity>
      </View>
    );
  };

  const renderHomeView = () => (
    <View style={styles.homeContainer}>
      <Text style={styles.title}>AI Complaint Processor</Text>
      <Text style={styles.instructions}>Press the button below to start a new incident report.</Text>
      <TouchableOpacity style={styles.newTicketButton} onPress={handleNewTicket}>
        <Text style={styles.newTicketButtonText}>Create New Incident Ticket</Text>
      </TouchableOpacity>
    </View>
  );

  const renderTicketView = () => {
    // **AUTOMATIC INCIDENT TIME DISPLAY**
    const firstFileTimestamp = selectedFiles.length > 0 ? selectedFiles[0].asset.lastModified : undefined;
    const incidentTime = typeof firstFileTimestamp === 'number'
      ? new Date(firstFileTimestamp).toLocaleString("en-IN")
      : 'No files selected';

    return (
      <>
        <TouchableOpacity style={styles.mainButton} onPress={() => pickDocuments(false)}>
          <Text style={styles.mainButtonText}>Add More Recordings</Text>
        </TouchableOpacity>
        <View style={styles.listContainer}>
          <View style={styles.listHeaderContainer}>
            <Text style={styles.listHeader}>Call Recordings ({selectedFiles.length}):</Text>
            <TouchableOpacity onPress={handleClearAll} style={styles.clearButton}>
              <Text style={styles.clearButtonText}>Clear & Cancel</Text>
            </TouchableOpacity>
          </View>
          <FlatList 
            data={selectedFiles} 
            keyExtractor={(item) => item.asset.uri} 
            renderItem={renderFileItem} 
          />
        </View>
        <View style={styles.bottomControls}>
          {/* **NEW UI ELEMENT to display the time** */}
          <View style={styles.incidentTimeContainer}>
            <Text style={styles.incidentTimeLabel}>Incident Start Time (Automatic):</Text>
            <Text style={styles.incidentTimeText}>{incidentTime}</Text>
          </View>
          <TouchableOpacity style={[styles.processButton, isProcessing && styles.disabledButton]} onPress={handleProcessUpload} disabled={isProcessing}>
            {isProcessing ? (
              <><ActivityIndicator color="#ffffff" style={{ marginBottom: 8 }} /><Text style={styles.processingStatusText}>{processingStatus}</Text></>
            ) : (
              <Text style={styles.processButtonText}>Upload & Process Incident</Text>
            )}
          </TouchableOpacity>
        </View>
      </>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
        <StatusBar barStyle="dark-content" />
        {appState === 'home' ? renderHomeView() : renderTicketView()}
      </SafeAreaView>
    </GestureHandlerRootView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f4f4f8' },
  homeContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 20, },
  title: { fontSize: 28, fontWeight: 'bold', textAlign: 'center', color: '#333', marginBottom: 15, },
  instructions: { fontSize: 16, textAlign: 'center', color: '#555', marginBottom: 30, },
  newTicketButton: { backgroundColor: '#007AFF', paddingVertical: 18, paddingHorizontal: 40, borderRadius: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 4, elevation: 5, },
  newTicketButtonText: { color: '#ffffff', fontSize: 18, fontWeight: '600' },
  mainButton: { marginHorizontal: 20, backgroundColor: '#007AFF', padding: 12, borderRadius: 8, alignItems: 'center', marginBottom: 10,},
  mainButtonText: { color: '#ffffff', fontSize: 16, fontWeight: '600', },
  listContainer: { flex: 1, paddingHorizontal: 20, },
  listHeaderContainer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 15 },
  listHeader: { fontSize: 18, fontWeight: '600', color: '#333' },
  clearButton: { paddingVertical: 4, paddingHorizontal: 10, backgroundColor: '#e0e0e0', borderRadius: 15 },
  clearButtonText: { color: '#333', fontSize: 12, fontWeight: '500' },
  listItem: { flexDirection: 'row', alignItems: 'center', padding: 15, backgroundColor: '#ffffff', borderRadius: 8, marginBottom: 10, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 2, },
  fileInfo: { flex: 1, marginRight: 10, },
  fileName: { fontSize: 14, color: '#444', fontWeight: '500', marginBottom: 4, },
  fileMetadata: { fontSize: 12, color: '#888', marginBottom: 8, },
  removeButton: { padding: 8, backgroundColor: '#fce8e6', borderRadius: 20, justifyContent: 'center', alignItems: 'center', },
  removeButtonText: { color: '#ea4335', fontWeight: 'bold', fontSize: 14, },
  actionRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4, },
  playButton: { justifyContent: 'center', alignItems: 'center', paddingLeft: 15 },
  playButtonText: { fontSize: 22, color: '#007AFF' },
  roleSelectorContainer: { flexDirection: 'row', flex: 1, justifyContent: 'flex-start' },
  roleButton: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 15, borderWidth: 1, borderColor: '#007AFF', marginRight: 10, },
  roleButtonSelected: { backgroundColor: '#007AFF', },
  roleButtonText: { color: '#007AFF', fontSize: 12, fontWeight: '600', },
  roleButtonTextSelected: { color: '#FFFFFF', },
  bottomControls: { paddingHorizontal: 20, paddingBottom: 10, paddingTop: 5, borderTopWidth: 1, borderTopColor: '#eee', backgroundColor: '#f4f4f8' },
  // New styles for the automatic time display
  incidentTimeContainer: { width: '100%', backgroundColor: '#ffffff', padding: 12, borderRadius: 8, alignItems: 'center', marginBottom: 10, borderWidth: 1, borderColor: '#ddd' },
  incidentTimeLabel: { fontSize: 12, color: '#888', marginBottom: 4 },
  incidentTimeText: { color: '#007AFF', fontSize: 16, fontWeight: '500' },
  processButton: { width: '100%', backgroundColor: '#28a745', padding: 15, borderRadius: 8, alignItems: 'center', justifyContent: 'center', minHeight: 50, },
  processButtonText: { color: '#ffffff', fontSize: 16, fontWeight: 'bold', },
  disabledButton: { backgroundColor: '#a5d6a7', },
  processingStatusText: { color: '#ffffff', fontSize: 14, },
})

