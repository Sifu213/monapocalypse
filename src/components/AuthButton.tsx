import { usePrivy, useCrossAppAccounts } from '@privy-io/react-auth';
import { LogOut, Wallet, User } from 'lucide-react';
import { useState, useEffect, useCallback } from 'react';

interface MonadGameUser {
  id: number;
  username: string;
  walletAddress: string;
}

interface MonadGameResponse {
  hasUsername: boolean;
  user?: MonadGameUser;
}

interface AuthButtonProps {
  onUserDataChange?: (userData: { monadUsername: string | null; crossAppWallet: string | null }) => void;
}

export default function AuthButton({ onUserDataChange }: AuthButtonProps) {
  const { user, ready, authenticated, login, logout } = usePrivy();
  const { loginWithCrossAppAccount } = useCrossAppAccounts();
  const [isLoading, setIsLoading] = useState(false);
  const [monadUsername, setMonadUsername] = useState<string | null>(null);
  const [isLoadingUsername, setIsLoadingUsername] = useState(false);

  // Fonction pour extraire l'adresse wallet depuis Privy Cross App
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

  // Fonction pour récupérer le username depuis l'API Monad Games ID
  const fetchMonadUsername = useCallback(async (walletAddress: string) => {
    setIsLoadingUsername(true);
    try {
      console.log(`🔍 Recherche username pour wallet: ${walletAddress}`);
      
      const response = await fetch(`https://monad-games-id-site.vercel.app/api/check-wallet?wallet=${walletAddress}`);
      
      if (response.ok) {
        const data: MonadGameResponse = await response.json();
        
        if (data.hasUsername && data.user) {
          setMonadUsername(data.user.username);
          console.log(`✅ Username Monad trouvé: ${data.user.username} pour wallet: ${walletAddress}`);
        } else {
          setMonadUsername(data.user?.id !== undefined ? String(data.user.id) : null);
          console.log(`❌ Aucun username Monad trouvé pour wallet: ${walletAddress}`);
        }
      } else {
        console.error('Erreur lors de la récupération du username Monad:', response.status);
        setMonadUsername(null);
      }
    } catch (error) {
      console.error('Erreur API Monad Games ID:', error);
      setMonadUsername(null);
    } finally {
      setIsLoadingUsername(false);
    }
  }, []);

  // Effet pour récupérer le username quand l'utilisateur se connecte
  useEffect(() => {
    if (authenticated && user) {
      const crossAppWallet = extractWalletFromPrivy();
      
      if (crossAppWallet) {
        console.log(`🎮 Cross App wallet détecté: ${crossAppWallet}`);
        fetchMonadUsername(crossAppWallet);
      } else {
        console.log('❌ Aucun wallet Cross App trouvé');
        setMonadUsername(user.id !== undefined ? String(user.id) : null);
      }
    } else {
      setMonadUsername(null);
    }
  }, [authenticated, user, extractWalletFromPrivy, fetchMonadUsername]);

  // Effet pour notifier le parent des changements de données utilisateur
  useEffect(() => {
    const crossAppWallet = extractWalletFromPrivy();
    if (onUserDataChange) {
      onUserDataChange({
        monadUsername,
        crossAppWallet
      });
    }
  }, [monadUsername, extractWalletFromPrivy, onUserDataChange]);

  const handleCrossAppLogin = async () => {
    setIsLoading(true);
    try {
      await loginWithCrossAppAccount({ 
        appId: 'cmd8euall0037le0my79qpz42' 
      });
    } catch (error) {
      console.error('Erreur Cross App Login:', error);
      // Fallback vers login standard
      try {
        await login();
      } catch (fallbackError) {
        console.error('Erreur Login fallback:', fallbackError);
      }
    } finally {
      setIsLoading(false);
    }
  };

  

  if (!ready) {
    return (
      <div className="flex items-center justify-center p-4">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-purple-500"></div>
        <span className="ml-2 text-gray-400">Chargement...</span>
      </div>
    );
  }

  if (authenticated && user) {
    const crossAppWallet = extractWalletFromPrivy();
    
    return (
      <div className="flex flex-col w-full items-center space-y-4 p-6 bg-gray-800 rounded-lg border border-gray-700">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-purple-600 text-white rounded-full flex items-center justify-center">
            <Wallet className="w-full h-5 text-white" />
          </div>
          <div>
            <p className="text-white font-semibold">Connected !</p>
            
          </div>
        </div>

        {/* Affichage du wallet Cross App */}
        {crossAppWallet && (
          <div className="text-center px-3 py-1 w-full bg-gray-700 rounded-lg">
            <span className="text-gray-400 text-xs">Cross App Wallet</span>
            <p className="text-white text-sm font-mono">
              {crossAppWallet}
            </p>
          </div>
        )}

        {/* Affichage du username Monad Games ID */}
        {crossAppWallet && (
          <div className="flex items-center w-full space-x-2 px-3 py-2 bg-purple-900 rounded-lg border border-purple-600">
            <User className="w-4 h-4 text-purple-300" />
            {isLoadingUsername ? (
              <div className="flex items-center space-x-2">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-purple-300"></div>
                <span className="text-purple-300 text-sm">Chargement...</span>
              </div>
            ) : monadUsername ? (
              <div className="text-center">
                <span className="text-purple-300 text-xs">Monad Games ID</span>
                <p className="text-white font-bold">{monadUsername}</p>
              </div>
            ) : (
              <div className="text-center">
                <span className="text-gray-400 text-xs">Monad Games ID</span>
                <p className="text-gray-500 text-sm">Non trouvé</p>
              </div>
            )}
          </div>
        )}

        <button
          onClick={logout}
          className="flex items-center space-x-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors duration-200"
        >
          <LogOut className="w-4 h-4" />
          <span>Déconnexion</span>
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col space-y-2 p-6 bg-gray-800 rounded-lg border border-gray-700 max-w-md">
      <h2 className="text-white text-center text-large mb-6">
        Connect with your Monad id game !
      </h2>

      {/* Bouton Cross App Login */}
      <button
        onClick={handleCrossAppLogin}
        disabled={isLoading}
        className="px-6 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 font-semibold transition-all duration-200 text-xl disabled:cursor-not-allowed"
      >
        {isLoading ? 'Connexion...' : 'Connect with Monad Game ID'}
      </button>
    </div>
  );
}