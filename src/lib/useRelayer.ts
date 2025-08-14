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

type useRelayerReturn = {
  click: (playerAddress?: string) => Promise<void>;
  submitScoreMonad: (score: number, transactions: number, playerAddress?: string) => Promise<void>;
  
  isLoading: boolean;
  error: string | null;
  txHashes: string[];
  userAddress: string | undefined;
  isUserConnected: boolean;
};

export function useRelayer(): useRelayerReturn {
  const { user, authenticated } = usePrivy();
  
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [txHashes, setTxHashes] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const userAddress = user?.wallet?.address;
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
      
      return { success: true, txHash: data.txHash };
    } catch (error) {
      console.error(`${action} error:`, error);
      return { success: false, error: (error as Error).message };
    }
  }, []);

  // Transaction click (pour chaque zombie tué)
  const click = useCallback(async (playerAddress?: string) => {
    const targetAddress = playerAddress || userAddress;
    if (!targetAddress) {
      console.warn('No player address available for click transaction');
      return;
    }

    try {
      const result = await makeRelayerCall('click', targetAddress);
      if (result.success && result.txHash) {
        setTxHashes(prev => [...prev, result.txHash!]);
      }
    } catch (error) {
      console.log('Click transaction failed (non-blocking):', error);
    }
  }, [userAddress, makeRelayerCall]);

  // Soumission de score au contrat Monad
  const submitScoreMonad = useCallback(async (
    score: number, 
    transactions: number, 
    playerAddress?: string
  ) => {
    const targetAddress = playerAddress || userAddress;
    if (!targetAddress) return;
    
    setIsLoading(true);
    setError(null);
    try {
      const result = await makeRelayerCall('submitScoreMonad', targetAddress, { 
        score, 
        transactions 
      });
      if (result.success && result.txHash) {
        setTxHashes(prev => [...prev, result.txHash!]);
      } else {
        setError(result.error || 'Submit score to Monad failed');
      }
    } catch (e) {
      setError((e as Error).message);
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