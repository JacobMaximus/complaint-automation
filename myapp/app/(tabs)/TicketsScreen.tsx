import { createClient } from '@supabase/supabase-js';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import TicketItem from '../components/TicketItem'; 


const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl || '', supabaseAnonKey || '');


import { Ticket } from '../components/TicketItem';

export default function TicketsScreen() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchAndMergeTickets = async () => {
      const { data: newTickets, error } = await supabase
        .from('tickets')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error polling for tickets:', error);
        return; 
      }

      if (newTickets) {
        setTickets((currentTickets) => {
          // If this is the first fetch, just set the data and stop loading
          if (currentTickets.length === 0) {
            setIsLoading(false);
            return newTickets;
          }

          // Create a Map of the current tickets for fast lookups
          const currentTicketsMap = new Map(
            currentTickets.map((ticket) => [ticket.id, ticket])
          );

          // Build the next state array.
          const nextState = newTickets.map((newTicket) => {
            const existingTicket = currentTicketsMap.get(newTicket.id);

            // If a ticket exists and its status hasn't changed,
            // return the original object reference. React will see it's
            // the same object and skip re-rendering that row.
            if (existingTicket && existingTicket.status === newTicket.status) {
              return existingTicket;
            }

            // Otherwise, return the new, updated ticket object.
            return newTicket;
          });

          return nextState;
        });
      }
    };

    // Fetch immediately on component mount
    fetchAndMergeTickets();
    
    
    const intervalId = setInterval(fetchAndMergeTickets, 5000); 

    // Cleanup on unmount
    return () => {
      clearInterval(intervalId);
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