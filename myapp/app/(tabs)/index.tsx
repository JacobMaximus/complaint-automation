import * as DocumentPicker from "expo-document-picker";

import React, { useState } from "react";
import { Button, FlatList, StyleSheet, Text, TouchableOpacity, View } from "react-native";

export default function FilePickerScreen() {
  const [files, setFiles] = useState<any[]>([]);

  const pickFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: "*/*", // can restrict later to audio/* if needed
        multiple: true, // allow picking multiple files
      });

      if (result.type === "success") {
        // DocumentPicker returns single object in older versions, so wrap in array
        const newFiles = Array.isArray(result) ? result : [result];
        setFiles((prev) => [...prev, ...newFiles]);
      }
    } catch (err) {
      console.error("Error picking file:", err);
    }
  };

  const removeFile = (uri: string) => {
    setFiles((prev) => prev.filter((file) => file.uri !== uri));
  };

  return (
    <View style={styles.container}>
      <Button title="Pick Files" onPress={pickFile} />

      {files.length > 0 && (
        <View style={{ marginTop: 20, width: "90%" }}>
          <Text style={styles.heading}>Selected Files:</Text>
          <FlatList
            data={files}
            keyExtractor={(item) => item.uri}
            renderItem={({ item }) => (
              <View style={styles.fileRow}>
                <Text style={styles.fileName}>{item.name}</Text>
                <TouchableOpacity onPress={() => removeFile(item.uri)}>
                  <Text style={styles.delete}>Delete</Text>
                </TouchableOpacity>
              </View>
            )}
          />
        </View>
      )}

      {/* Placeholder: Upload files to Firebase or backend here */}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "center", paddingTop: 50 },
  heading: { fontSize: 18, fontWeight: "bold", marginBottom: 10 },
  fileRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 5 },
  fileName: { flexShrink: 1 },
  delete: { color: "red", marginLeft: 10 },
});
