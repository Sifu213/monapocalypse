import { Web3Providers } from './lib/privy'
import AuthButton from './components/AuthButton'
import ZombieGame from './components/ZombieGame'
import LeaderboardDialog from './components/LeaderboardDialog'
import { usePrivy } from '@privy-io/react-auth'
import { useState, useCallback } from 'react'

function AppContent() {
  const { authenticated } = usePrivy();
  const [showGame, setShowGame] = useState(false);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [userData, setUserData] = useState<{ monadUsername: string | null; crossAppWallet: string | null }>({
    monadUsername: null,
    crossAppWallet: null
  });

  const handleUserDataChange = useCallback((newUserData: { monadUsername: string | null; crossAppWallet: string | null }) => {
    setUserData(newUserData);
  }, []);

  if (showGame && authenticated) {
    return (
      <div className="min-h-screen bg-[#200052] p-6">
        {/* Header du jeu */}
        <div className="max-w-4xl mx-auto mb-4">
          <div className="flex justify-between items-center">
            <img
              src="/img/monapocalypse.png"
              alt="Monapocalypse Logo"
              className="h-12" />
            <div className="flex space-x-4">
              <button
                onClick={() => setShowLeaderboard(true)}
                className="px-6 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 font-semibold transition-all duration-200 text-sm"
              >
                
                <span>Leaderboard</span>
              </button>
              <button
                onClick={() => setShowGame(false)}
                className="px-6 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 font-semibold transition-all duration-200 text-sm"
              >
                ← Back to menu
              </button>
            </div>
          </div>
        </div>

        {/* Jeu */}
        <div className="flex justify-center">
          <ZombieGame userData={userData} />
        </div>

        <footer className="w-full px-4 bg-[#200052] sm:px-6 lg:px-8 py-1">
                <div className="max-w-7xl mx-auto text-center">
                    <nav className="text-gray-400 text-sm">
                        <ul className="flex items-center justify-center gap-4">
                            <li>
                                Made by <a href="https://x.com/sifu_lam" target="_blank" rel="noopener noreferrer" className="text-purple-400 hover:text-purple-300">Sifu_lam</a> for
                            </li>
                            <li>
                                <img src="/img/logomonad.png" alt="monad" className="h-3 w-auto" />
                            </li>
                        </ul>
                    </nav>
                </div>
            </footer>

        {/* Dialog Leaderboard */}
        <LeaderboardDialog 
          isOpen={showLeaderboard} 
          onClose={() => setShowLeaderboard(false)} 
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#200052]">
      {/* Header */}
      <header className="p-6">
        <div className="max-w-4xl mx-auto flex justify-center items-center">
          <div className="flex items-center space-x-3">
            <img
              src="/img/monapocalypse.png"
              alt="Monapocalypse Logo"
              className="h-12" />
          </div>
        </div>
      </header>

      {/* Contenu principal */}
      <main className="max-w-4xl mx-auto p-2">
        <div className="grid lg:grid-cols-2 gap-12 items-center min-h-[80vh]">

          {/* Côté gauche - Description */}
          <div className="space-y-4">
            <div className="space-y-2">
              <h2 className="text-4xl font-gaming font-bold text-white leading-tight">
                Survival. Action. Chain stress.
                
              </h2>
              <p className="text-xl text-gray-300 leading-relaxed">
                Face monanimals zombies waves and boss ! Stress the Monad chain while playing and climb the global leaderboard!
              </p>
            </div>

            {/* Image d'illustration */}
            <div className="flex justify-center">
              <img
                src="/img/cover.png"
                alt="Monapocalypse illustration"
                className="max-w-full h-auto rounded-lg shadow-lg"
                draggable={false}
              />
            </div>
          </div>

          {/* Côté droit - Authentification + Boutons */}
          <div className="flex flex-col items-center space-y-6">
            <AuthButton onUserDataChange={handleUserDataChange} />

            {authenticated && (
              <div className="flex flex-col space-y-4">
                <button
                  onClick={() => setShowGame(true)}
                  className="px-16 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 font-semibold transition-all duration-200 text-xl"
                >
                  Play
                </button>
                
                <button
                  onClick={() => setShowLeaderboard(true)}
                  className="px-6 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 font-semibold transition-all duration-200 text-xl"
                >
                  
                  <span>Leaderboard</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </main>

      <footer className="w-full px-4 bg-[#200052] sm:px-6 lg:px-8 py-2">
                <div className="max-w-7xl mx-auto text-center">
                    <nav className="text-gray-400 text-sm">
                        <ul className="flex items-center justify-center gap-4">
                            <li>
                                Made by <a href="https://x.com/sifu_lam" target="_blank" rel="noopener noreferrer" className="text-purple-400 hover:text-purple-300">Sifu_lam</a> for
                            </li>
                            <li>
                                <img src="/img/logomonad.png" alt="monad" className="h-3 w-auto" />
                            </li>
                        </ul>
                    </nav>
                </div>
            </footer>

      {/* Dialog Leaderboard */}
      <LeaderboardDialog 
        isOpen={showLeaderboard} 
        onClose={() => setShowLeaderboard(false)} 
      />
    </div>
  );
}

function App() {
  return (
    <Web3Providers>
      <AppContent />
    </Web3Providers>
  );
}

export default App;