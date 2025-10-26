import { createClient } from '@supabase/supabase-js';
import React, { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl || '', supabaseAnonKey || '');

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

export type TicketError = {
  error_message: string;
  created_at: string;
};

export default function TicketItem({ ticket }: TicketItemProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [isLoadingRecordings, setIsLoadingRecordings] = useState(false);

  const [errors, setErrors] = useState<TicketError[]>([]); 
  const [isLoadingErrors, setIsLoadingErrors] = useState(false); 
  const [isRetrying, setIsRetrying] = useState(false); 
  const [isClearingErrors, setIsClearingErrors] = useState(false);

  const statusStyles = {
    pending: { color: '#007AFF', name: 'Pending' },
    processing: { color: '#007AFF', name: 'Processing' },
    done: { color: '#28a745', name: 'Done' },
    failed: { color: '#dc3545', name: 'Failed' },
  };
  const currentStatus = statusStyles[ticket.status] || { color: 'gray', name: 'Unknown' };

  const toggleExpand = async () => {
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

      if (ticket.status === 'failed' && errors.length === 0) {
        setIsLoadingErrors(true);
        const { data: errorData, error: fetchError } = await supabase
          .from('ticket_errors')
          .select('error_message, created_at')
          .eq('ticket_id', ticket.id)
          .order('created_at', { ascending: false }); 
          
        if (fetchError) {
          console.error('Error fetching ticket errors:', fetchError);
          setErrors([{ error_message: 'Could not load error details.', created_at: new Date().toISOString() }]);
        } else if (errorData) {
          setErrors(errorData as TicketError[]); 
        }
        setIsLoadingErrors(false);
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
    return null;
  };

  const handleRetry = async () => {
    setIsRetrying(true);
    setErrors([]); 
    
    const { error: invokeError } = await supabase.functions.invoke(
      'process-ticket', 
      { body: { record: ticket } }
    );

    if (invokeError) {
      alert(`Retry failed to start: ${invokeError.message}`);
      setIsRetrying(false);
    }
  };

  React.useEffect(() => {
    if (isRetrying) {
      if (ticket.status !== 'processing') {
        setIsRetrying(false);
      }
    }
  }, [ticket]);
  
  const handleClearErrors = async () => {
    if (isClearingErrors) return;

    setIsClearingErrors(true);

    const { error } = await supabase
      .from('ticket_errors')
      .delete()
      .eq('ticket_id', ticket.id);

    if (error) {
      console.error('Error clearing logs:', error);
      alert('Failed to clear error logs. Please try again.');
    } else {
      setErrors([]);
    }

    setIsClearingErrors(false);
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
          
          {isLoadingErrors ? (
            <ActivityIndicator style={{ marginBottom: 15 }} />
          ) : (
            errors.map((error, index) => (
              <View style={styles.errorContainer} key={index}>
                <View style={styles.errorHeader}>
                  <Text style={styles.errorTitle}>
                    {index === 0 ? 'Latest Error' : 'Previous Error'}
                  </Text>
                  <Text style={styles.errorTimestamp}>
                    {new Date(error.created_at).toLocaleString('en-IN')}
                  </Text>
                </View>
                <Text style={styles.errorMessage}>{error.error_message}</Text>
              </View>
            ))
          )}

          {ticket.status === 'failed' && (
            <TouchableOpacity 
              style={[styles.retryButton, isRetrying && styles.disabledButton]} 
              onPress={handleRetry}
              disabled={isRetrying}
            >
              <Text style={styles.retryButtonText}>
                {isRetrying ? 'Retrying...' : 'Retry Processing'}
              </Text>
            </TouchableOpacity>
          )}

          <Text style={styles.dropdownTitle}>{ticket.status === 'failed' ? 'Recordings in Failed Attempt:' : 'Associated Recordings:'}</Text>
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
  errorContainer: {
    backgroundColor: '#fff0f0',
    borderColor: '#dc3545',
    borderWidth: 1,
    padding: 10,
    borderRadius: 6,
    marginBottom: 15,
  },
  errorTitle: {
    color: '#dc3545',
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 5,
  },
  errorMessage: {
    color: '#333',
    fontSize: 13,
    fontFamily: 'monospace',
  },
  errorHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 5,
  },
  errorTimestamp: {
    fontSize: 11,
    color: '#666',
    fontFamily: 'monospace',
  },
  retryButton: {
    backgroundColor: '#007AFF',
    paddingVertical: 10,
    borderRadius: 6,
    alignItems: 'center',
    marginTop: 15,
    marginBottom: 15, 
  },
  retryButtonText: {
    color: '#ffffff',
    fontWeight: '600',
  },
  disabledButton: {
    backgroundColor: '#cce5ff', 
  },
  clearButton: {
    marginTop: 5,
    marginBottom: 10,
    paddingVertical: 8,
    alignItems: 'center',
  },
  clearButtonText: {
    color: '#dc3545',
    fontSize: 13,
    fontWeight: '500',
  },
});