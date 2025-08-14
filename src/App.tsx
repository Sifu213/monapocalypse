import { Web3Providers } from './lib/privy'
import AuthButton from './components/AuthButton'
import ZombieGame from './components/ZombieGame'
import { usePrivy } from '@privy-io/react-auth'
import { Skull, Gamepad2 } from 'lucide-react'
import { useState } from 'react'

function AppContent() {
  const { authenticated } = usePrivy();
  const [showGame, setShowGame] = useState(false);

  if (showGame && authenticated) {
    return (
      <div className="min-h-screen bg-[#200052] p-6">
        {/* Header du jeu */}
        <div className="max-w-4xl mx-auto mb-6">
          <div className="flex justify-between items-center">
            <h1 className="text-2xl font-gaming text-white font-bold  bg-clip-text text-transparent">
              MONAPOCALYPSE
            </h1>
            <button 
              onClick={() => setShowGame(false)}
              className="px-6 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 font-semibold transition-all duration-200 text-sm"
            >
              ← Retour au menu
            </button>
          </div>
        </div>

        {/* Jeu */}
        <div className="flex justify-center">
          <ZombieGame />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#200052]">
      {/* Header */}
      <header className="p-6">
        <div className="max-w-4xl mx-auto flex justify-center items-center">
          <div className="flex items-center space-x-3">
            
            <h1 className="text-3xl font-gaming text-white font-bold bg-clip-text text-transparent">
              MONAPOCALYPSE
            </h1>
            
          </div>
        </div>
      </header>

      {/* Contenu principal */}
      <main className="max-w-4xl mx-auto p-6">
        <div className="grid lg:grid-cols-2 gap-12 items-center min-h-[80vh]">
          
          {/* Côté gauche - Description */}
          <div className="space-y-8">
            <div className="space-y-4">
              <h2 className="text-4xl font-gaming font-bold text-white leading-tight">
                Survival. Action. 
                <span className="bg-gradient-to-r from-[#836EF9] to-[#4a002b] bg-clip-text text-transparent">
                  {' '}Chain stress.
                </span>
              </h2>
              <p className="text-xl text-gray-300 leading-relaxed">
                Face monanimals zombies waves and boss ! Stress the Monad chain while playing and climb the global leaderboard!
              </p>
            </div>

            {/* Image d'illustration */}
            <div className="flex justify-center">
              <img 
                src="/img/monapocalypse.png" 
                alt="Monapocalypse illustration"
                className="max-w-full h-auto rounded-lg shadow-lg"
                draggable={false}
              />
            </div>
          </div>

          {/* Côté droit - Authentification + Bouton Play */}
          <div className="flex flex-col items-center space-y-6">
            <AuthButton />
            
            {authenticated && (
              <button 
                onClick={() => setShowGame(true)}
                className="px-16 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 font-semibold transition-all duration-200 text-xl"
              >
                Play
              </button>
            )}
          </div>
        </div>
      </main>
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