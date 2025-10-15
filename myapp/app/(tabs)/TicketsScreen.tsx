import { createClient } from '@supabase/supabase-js';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import TicketItem from '../components/TicketItem'; // Import the component we just made


const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl || '', supabaseAnonKey || '');


import { Ticket } from '../components/TicketItem';

export default function TicketsScreen() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Fetch initial data
    const fetchInitialTickets = async () => {
      const { data, error } = await supabase
        .from('tickets')
        .select('*')
        .order('created_at', { ascending: false }); // Newest first

      if (error) {
        console.error('Error fetching tickets:', error);
      } else if (data) {
        setTickets(data);
      }
      setIsLoading(false);
    };

    fetchInitialTickets();

    // Set up real-time subscription
    const channel = supabase
      .channel('tickets-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'tickets' },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            // Add the new ticket to the top of the list
            setTickets((currentTickets) => [payload.new as Ticket, ...currentTickets]);
          } else if (payload.eventType === 'UPDATE') {
            // Find and update the existing ticket in the list
            setTickets((currentTickets) =>
              currentTickets.map((ticket) =>
                ticket.id === payload.new.id ? { ...ticket, ...payload.new } : ticket
              )
            );
          }
        }
      )
      .subscribe();

    // Cleanup subscription on component unmount
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  if (isLoading) {
    return <ActivityIndicator size="large" style={styles.centered} />;
  }

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      <FlatList
        data={tickets}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <TicketItem ticket={item} />}
        ListEmptyComponent={<Text style={styles.emptyText}>No tickets uploaded yet.</Text>}
        contentContainerStyle={styles.listContent}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f4f4f8' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  listContent: { paddingTop: 15 },
  emptyText: { textAlign: 'center', marginTop: 50, color: 'gray' },
});