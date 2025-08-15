import { useEffect } from 'react';
import { X} from 'lucide-react';
import { useLeaderboard } from '../hooks/useLeaderboard';

interface LeaderboardDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function LeaderboardDialog({ isOpen, onClose }: LeaderboardDialogProps) {
  const { leaderboard, isLoading, fetchLeaderboard } = useLeaderboard();

  useEffect(() => {
    if (isOpen) {
      fetchLeaderboard();
    }
  }, [isOpen, fetchLeaderboard]);

  if (!isOpen) return null;

  

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };



  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 rounded-lg max-w-4xl w-full max-h-[80vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-2 border-b border-gray-700">
          <div className="flex items-center space-x-3">
            
            <h2 className="text-2xl font-bold text-white">Leaderboard</h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-800 rounded-lg transition-colors duration-200"
          >
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        {/* Content */}
        <div className="p-2">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin w-8 h-8 border-4 border-purple-600 border-t-transparent rounded-full"></div>
              <span className="ml-3 text-white">Loading...</span>
            </div>
          ) : leaderboard.length === 0 ? (
            <div className="text-center py-12">
              
              <p className="text-gray-400 text-lg">No score</p>
            
            </div>
          ) : (
            <div className="overflow-y-auto max-h-[60vh]">
              {/* Header du tableau */}
              <div className="grid grid-cols-12 gap-4 p-3 border-b border-gray-700 text-sm font-semibold text-gray-400">
                <div className="col-span-1">Rank</div>
                <div className="col-span-3">Joueur</div>
                <div className="col-span-2">Score</div>
                <div className="col-span-2">Vagues</div>
                <div className="col-span-2">Kills</div>
                <div className="col-span-2">Date</div>
              </div>

              {/* Entries */}
              {leaderboard.map((entry, index) => {
                const rank = index + 1;
                const isTopThree = rank <= 3;
                
                return (
                  <div
                    key={entry.id}
                    className={`grid grid-cols-12 gap-4 p-3 border-b border-gray-800 hover:bg-gray-800 transition-colors duration-200 ${
                      isTopThree ? 'bg-gradient-to-r from-purple-900/20 to-transparent' : ''
                    }`}
                  >
                    <div className="col-span-1 flex text-white items-center">
                      {rank}
                    </div>
                    
                    <div className="col-span-3 flex flex-col">
                      <span className={`font-semibold text-white`}>
                        {entry.username}
                      </span>
                      
                    </div>
                    
                    <div className="col-span-2 flex items-center">
                      <span className={`font-bold text-white`}>
                        {entry.score.toLocaleString()}
                      </span>
                    </div>
                    
                    <div className="col-span-2 flex items-center">
                      <span className="text-gray-300">{entry.waves_completed}</span>
                    </div>
                    
                    <div className="col-span-2 flex items-center">
                      <span className="text-gray-300">{entry.enemies_killed}</span>
                    </div>
                    
                    <div className="col-span-2 flex items-center">
                      <span className="text-gray-400 text-sm">
                        {formatDate(entry.created_at)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-center p-4 border-t border-gray-700">
          <button
            onClick={onClose}
            className="px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors duration-200"
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
}