import { useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import type { LeaderboardEntry, NewLeaderboardEntry } from '../lib/supabase';

// Configuration Vite
const VITE_SUPABASE_API_URL = import.meta.env.VITE_SUPABASE_API_URL || 
  (import.meta.env.DEV ? 'http://localhost:3001/api/leaderboard' : '/api/leaderboard');

export const useLeaderboard = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);

  // Récupérer le top 20 du leaderboard (lecture publique toujours autorisée)
  const fetchLeaderboard = useCallback(async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('leaderboard_monapocalypse')
        .select('*')
        .order('score', { ascending: false })
        .limit(20);

      if (error) {
        console.error('Erreur lors de la récupération du leaderboard:', error);
        return [];
      }

      setLeaderboard(data || []);
      return data || [];
    } catch (error) {
      console.error('Erreur lors de la récupération du leaderboard:', error);
      return [];
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Soumettre un nouveau score via l'API
  const submitScore = useCallback(async (entry: NewLeaderboardEntry) => {
    setIsLoading(true);
    try {
      const response = await fetch(VITE_SUPABASE_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(entry),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        console.error('Erreur API:', result.error);
        throw new Error(result.error || 'Erreur lors de la soumission du score');
      }

      return result.data;
    } catch (error) {
      console.error('Erreur lors de la soumission du score:', error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Vérifier le rang d'un score (lecture publique)
  const getScoreRank = useCallback(async (score: number) => {
    try {
      const { count, error } = await supabase
        .from('leaderboard_monapocalypse')
        .select('*', { count: 'exact', head: true })
        .gt('score', score);

      if (error) {
        console.error('Erreur lors du calcul du rang:', error);
        return null;
      }

      return (count || 0) + 1;
    } catch (error) {
      console.error('Erreur lors du calcul du rang:', error);
      return null;
    }
  }, []);

  return {
    leaderboard,
    isLoading,
    fetchLeaderboard,
    submitScore,
    getScoreRank
  };
};