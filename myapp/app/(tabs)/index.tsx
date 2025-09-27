import * as DocumentPicker from 'expo-document-picker';
import React, { useState } from 'react';
import {
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

// This is the type for a single file asset returned by the document picker.
type FileAsset = DocumentPicker.DocumentPickerAsset;

export default function App() {
  // This 'state' variable will hold the list of files the user selects.
  const [selectedFiles, setSelectedFiles] = useState<FileAsset[]>([]);

  /**
   * This asynchronous function opens the device's document picker
   * to allow the user to select multiple audio files.
   */
  const pickDocuments = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'audio/*', // We specify that we want to see audio files.
        multiple: true,  // This allows the user to select more than one file.
      });

      if (!result.canceled) {
        // We update our state with the array of selected files.
        setSelectedFiles(result.assets);
      } else {
        console.log('User cancelled the document picker.');
      }
    } catch (error) {
      console.error('An error occurred while picking documents:', error);
    }
  };

  /**
   * This function removes a specific file from the selectedFiles state,
   * identifying it by its unique URI.
   * @param fileUri - The URI of the file to remove.
   */
  const handleRemoveFile = (fileUri: string) => {
    setSelectedFiles(currentFiles =>
      currentFiles.filter(file => file.uri !== fileUri)
    );
  };

  /**
   * A typed function for rendering each item in the FlatList.
   * This now includes a 'remove' button for each file.
   */
  const renderFileItem: ListRenderItem<FileAsset> = ({ item }) => (
    <View style={styles.listItem}>
      <View style={styles.fileInfo}>
        <Text style={styles.fileName} numberOfLines={1} ellipsizeMode="middle">
          {item.name}
        </Text>
        <Text style={styles.fileSize}>
          {item.size ? `${(item.size / 1024 / 1024).toFixed(2)} MB` : 'Size N/A'}
        </Text>
      </View>
      <TouchableOpacity 
        onPress={() => handleRemoveFile(item.uri)} 
        style={styles.removeButton}
      >
        <Text style={styles.removeButtonText}>X</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <Text style={styles.title}>AI Complaint Processor</Text>
      <Text style={styles.instructions}>
        Welcome, Mr. X. Press the button below to select today's call recordings.
      </Text>
      
      <View style={styles.buttonContainer}>
        <Button 
          title="Select Call Recordings" 
          onPress={pickDocuments} 
          color={Platform.OS === 'ios' ? '#FFFFFF' : '#007AFF'}
        />
      </View>

      {selectedFiles.length > 0 && (
        <View style={styles.listContainer}>
          <Text style={styles.listHeader}>Selected Files ({selectedFiles.length}):</Text>
          
          <FlatList
            data={selectedFiles}
            keyExtractor={(item) => item.uri}
            renderItem={renderFileItem}
          />
        </View>
      )}
    </SafeAreaView>
  );
}

// This is where all the styling for the components is defined.
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f4f4f8',
    alignItems: 'center',
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0,
    paddingHorizontal: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginVertical: 20,
    color: '#333',
  },
  instructions: {
    fontSize: 16,
    textAlign: 'center',
    color: '#555',
    marginBottom: 20,
  },
  buttonContainer: {
    width: '100%',
    backgroundColor: Platform.OS === 'ios' ? '#007AFF' : 'transparent',
    borderRadius: 8,
    overflow: 'hidden',
    marginBottom: 20,
  },
  listContainer: {
    flex: 1,
    width: '100%',
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
    marginTop: 10,
  },
  listHeader: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    paddingVertical: 15,
  },
  listItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 15,
    backgroundColor: '#ffffff',
    borderRadius: 8,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#eee',
  },
  fileInfo: {
    flex: 1,
    marginRight: 10,
  },
  fileName: {
    fontSize: 14,
    color: '#444',
    fontWeight: '500',
  },
  fileSize: {
    fontSize: 12,
    color: '#888',
    marginTop: 2,
  },
  removeButton: {
    padding: 8,
    backgroundColor: '#fce8e6',
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  removeButtonText: {
    color: '#ea4335',
    fontWeight: 'bold',
    fontSize: 14,
  },
});

