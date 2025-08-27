import { useCallback, useState } from "react";
import { usePrivy } from '@privy-io/react-auth';

// Configuration Vite
const RELAYER_API_URL = import.meta.env.VITE_RELAYER_API_URL || 
  (import.meta.env.DEV ? 'http://localhost:3001/api/relay' : '/api/relay');

interface RelayerResponse {
  success: boolean;
  txHash?: string;
  error?: string;
}

// Nouvelle interface pour la soumission de score complète
interface ScoreSubmission {
  score: number;
  waves_completed: number;
  enemies_killed: number;
  total_transactions: number;
}

type useRelayerReturn = {
  click: (playerAddress?: string) => Promise<void>;
  submitScoreMonad: (submission: ScoreSubmission, playerAddress?: string) => Promise<void>;
  
  isLoading: boolean;
  error: string | null;
  txHashes: string[];
  userAddress: string | null;
  isUserConnected: boolean;
};

export function useRelayer(): useRelayerReturn {
  const { user, authenticated } = usePrivy();
  
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [txHashes, setTxHashes] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Fonction pour extraire l'adresse wallet depuis Privy Cross App (même logique que AuthButton.tsx)
  const extractWalletFromPrivy = useCallback(() => {
    if (!user) return null;
    
    const userData = user as any;
    
    // Vérifier les linkedAccounts pour cross_app
    if (userData.linkedAccounts && userData.linkedAccounts.length > 0) {
      const crossAppAccount = userData.linkedAccounts.find((account: any) => account.type === "cross_app");
      if (crossAppAccount && crossAppAccount.embeddedWallets && crossAppAccount.embeddedWallets.length > 0) {
        const crossAppEmbeddedWallet = crossAppAccount.embeddedWallets[0];
        if (crossAppEmbeddedWallet.address) {
          return crossAppEmbeddedWallet.address;
        }
      }
    }

    return null;
  }, [user]);

  // Utiliser l'adresse Cross App au lieu de l'adresse wallet principale
  const userAddress = extractWalletFromPrivy();
  const isUserConnected = authenticated && !!userAddress;

  // Fonction générique pour les appels API
  const makeRelayerCall = useCallback(async (
    action: string, 
    playerAddress: string, 
    additionalParams: Record<string, any> = {}
  ): Promise<RelayerResponse> => {
    try {
      
      
      const response = await fetch(RELAYER_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          playerAddress,
          action,
          ...additionalParams,
        }),
      });
      
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Transaction failed');
      }
      
      console.log(`✅ ${action} successful: ${data.txHash}`);
      return { success: true, txHash: data.txHash };
    } catch (error) {
      console.error(`❌ ${action} error:`, error);
      return { success: false, error: (error as Error).message };
    }
  }, []);

  // Transaction click (pour chaque vague gagnée)
  const click = useCallback(async (playerAddress?: string) => {
    const targetAddress = playerAddress || userAddress;
    if (!targetAddress) {
      console.warn('⚠️ No Cross App wallet address available for click transaction');
      return;
    }

    try {
      const result = await makeRelayerCall('click', targetAddress);
      if (result.success && result.txHash) {
        setTxHashes(prev => [...prev, result.txHash!]);
      }
    } catch (error) {
      console.log('❌ Click transaction failed (non-blocking):', error);
    }
  }, [userAddress, makeRelayerCall]);

  // Soumission de score au contrat Monad avec validation complète
  const submitScoreMonad = useCallback(async (
    submission: ScoreSubmission, 
    playerAddress?: string
  ) => {
    const targetAddress = playerAddress || userAddress;
    if (!targetAddress) {
      console.warn('⚠️ No Cross App wallet address available for score submission');
      return;
    }
    
    setIsLoading(true);
    setError(null);
    
    try {
      
      
      const result = await makeRelayerCall('submitScoreMonad', targetAddress, {
        // Garder la compatibilité avec l'ancien format pour le contrat
        score: submission.score, 
        transactions: submission.total_transactions,
        // Ajouter les nouvelles données pour la validation
        waves_completed: submission.waves_completed,
        enemies_killed: submission.enemies_killed
      });
      
      if (result.success && result.txHash) {
        setTxHashes(prev => [...prev, result.txHash!]);
       
      } else {
        setError(result.error || 'Submit score to Monad failed');
      }
    } catch (e) {
      const errorMessage = (e as Error).message;
      console.error('❌ Erreur soumission score Monad:', errorMessage);
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  }, [userAddress, makeRelayerCall]);

  return {
    click,
    submitScoreMonad,
    isLoading,
    error,
    txHashes,
    userAddress,
    isUserConnected,
  };
}