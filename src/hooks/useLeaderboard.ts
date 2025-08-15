import { useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import type { LeaderboardEntry, NewLeaderboardEntry } from '../lib/supabase';

export const useLeaderboard = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);

  // Récupérer le top 20 du leaderboard
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

  // Soumettre un nouveau score
  const submitScore = useCallback(async (entry: NewLeaderboardEntry) => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('leaderboard_monapocalypse')
        .insert([entry])
        .select()
        .single();

      if (error) {
        console.error('Erreur lors de la soumission du score:', error);
        throw error;
      }

      console.log('Score soumis avec succès:', data);
      return data;
    } catch (error) {
      console.error('Erreur lors de la soumission du score:', error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Vérifier le rang d'un score
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