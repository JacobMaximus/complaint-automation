import { createClient } from '@supabase/supabase-js';
import React, { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

// --- Supabase Client ---
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl || '', supabaseAnonKey || '');

// --- TypeScript Types for our data ---
export type Recording = {
  id: string;
  file_name: string;
};

export type Ticket = {
  id: string;
  created_at: string;
  status: 'pending' | 'processing' | 'done' | 'failed';
  recordings: Recording[];
};

type TicketItemProps = {
  ticket: Ticket;
};

export default function TicketItem({ ticket }: TicketItemProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [isLoadingRecordings, setIsLoadingRecordings] = useState(false);

  const statusStyles = {
    pending: { color: '#007AFF', name: 'Pending' },
    processing: { color: '#007AFF', name: 'Processing' },
    done: { color: '#28a745', name: 'Done' },
    failed: { color: '#dc3545', name: 'Failed' },
  };
  const currentStatus = statusStyles[ticket.status] || { color: 'gray', name: 'Unknown' };

  const toggleExpand = async () => {
    // Only fetch recordings the first time it's expanded
    if (!isExpanded && recordings.length === 0) {
      setIsLoadingRecordings(true);
      const { data, error } = await supabase
        .from('recordings')
        .select('id, file_name')
        .eq('ticket_id', ticket.id);

      if (error) {
        console.error('Error fetching recordings:', error);
      } else {
        setRecordings(data as Recording[]);
      }
      setIsLoadingRecordings(false);
    }
    setIsExpanded(!isExpanded);
  };

  const renderStatusIcon = () => {
    if (ticket.status === 'pending' || ticket.status === 'processing') {
      return <ActivityIndicator size="small" color={currentStatus.color} />;
    }
    if (ticket.status === 'done') {
      return <Text style={{ color: currentStatus.color, fontSize: 20 }}>✓</Text>;
    }
    return null; // No icon for 'failed' status
  };

  return (
    <View style={styles.card}>
      <TouchableOpacity onPress={toggleExpand} style={styles.mainRow}>
        <View style={styles.ticketInfo}>
          <Text style={styles.ticketIdLabel}>Ticket ID</Text>
          <Text style={styles.ticketIdValue}>{ticket.id}</Text>
        </View>
        <View style={styles.statusInfo}>
          <Text style={[styles.statusText, { color: currentStatus.color }]}>
            {currentStatus.name}
          </Text>
          <View style={styles.iconContainer}>{renderStatusIcon()}</View>
        </View>
      </TouchableOpacity>
      {isExpanded && (
        <View style={styles.dropdown}>
          <Text style={styles.dropdownTitle}>Associated Recordings:</Text>
          {isLoadingRecordings ? (
            <ActivityIndicator />
          ) : (
            recordings.map((rec) => <Text key={rec.id} style={styles.fileName}>- {rec.file_name}</Text>)
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: '#ffffff', borderRadius: 8, marginHorizontal: 15, marginBottom: 10, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 2, elevation: 3 },
  mainRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 15 },
  ticketInfo: { flex: 1 },
  ticketIdLabel: { fontSize: 12, color: 'gray' },
  ticketIdValue: { fontSize: 14, color: '#333', fontFamily: 'monospace' },
  statusInfo: { flexDirection: 'row', alignItems: 'center' },
  statusText: { fontSize: 16, fontWeight: 'bold', marginRight: 10 },
  iconContainer: { width: 24, alignItems: 'center' },
  dropdown: { borderTopWidth: 1, borderTopColor: '#eee', padding: 15 },
  dropdownTitle: { fontSize: 14, fontWeight: '600', marginBottom: 8, color: '#555' },
  fileName: { fontSize: 14, color: '#333', marginBottom: 4, marginLeft: 10 },
});