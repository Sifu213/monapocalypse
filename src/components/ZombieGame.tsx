import { useState, useEffect, useRef, useCallback } from 'react';
import { Heart } from 'lucide-react';
import { useRelayer } from '../lib/useRelayer';
import { useLeaderboard } from '../hooks/useLeaderboard';

interface Player {
  x: number;
  y: number;
  health: number;
  maxHealth: number;
}

interface Zombie {
  id: number;
  x: number;
  y: number;
  health: number;
  maxHealth: number;
  speed: number;
  isBoss?: boolean;
  isChog?: boolean;
  rotation?: number;
  scaleX?: number;
}

interface Bullet {
  id: number;
  x: number;
  y: number;
  angle: number;
  speed: number;
}

interface WeaponDrop {
  id: number;
  x: number;
  y: number;
  type: 'shotgun';
}

interface WeaponBonus {
  type: 'shotgun' | null;
  timeLeft: number;
}

interface ZombieGameProps {
  userData: { monadUsername: string | null; crossAppWallet: string | null };
}

const GAME_WIDTH = 1200;
const GAME_HEIGHT = 600;
const PLAYER_SIZE = 30;
const ZOMBIE_SIZE = 25;
const BOSS_SIZE = 50;
const BULLET_SIZE = 6;

// 🎯 CONFIGURATION DE DIFFICULTÉ - Modifiez ces valeurs facilement !
const DIFFICULTY_CONFIG = {
  // Zombies normaux
  ZOMBIE_BASE_HEALTH: 250,        // Vie de base des zombies
  ZOMBIE_HEALTH_PER_WAVE: 50,    // Vie supplémentaire par vague
  ZOMBIE_BASE_SPEED: 0.8,        // Vitesse de base des zombies
  ZOMBIE_SPEED_PER_WAVE: 0.1,    // Vitesse supplémentaire par vague
  ZOMBIE_DAMAGE: 1,              // Dégâts des zombies sur le joueur

  CHOG_BASE_HEALTH: 150,        // NOUVEAU - Vie de base des chogs
  CHOG_HEALTH_PER_WAVE: 30,     // NOUVEAU - Vie supplémentaire par vague
  CHOG_BASE_SPEED: 1.2,         // NOUVEAU - Vitesse de base des chogs (plus rapides)
  CHOG_SPEED_PER_WAVE: 0.15,    // NOUVEAU - Vitesse supplémentaire par vague
  CHOG_DAMAGE: 2,               // NOUVEAU - Dégâts des chogs sur le joueur
  CHOG_START_WAVE: 1,           // NOUVEAU - Vague à partir de laquelle les chogs apparaissent

  // Boss
  BOSS_BASE_HEALTH: 2000,         // Vie de base des boss
  BOSS_HEALTH_PER_WAVE: 500,      // Vie supplémentaire par vague
  BOSS_BASE_SPEED: 0.5,          // Vitesse de base des boss
  BOSS_SPEED_PER_WAVE: 0.1,     // Vitesse supplémentaire par vague
  BOSS_DAMAGE: 3,                // Dégâts des boss sur le joueur
  BOSS_WAVE_INTERVAL: 5,         // Boss toutes les X vagues

  // Spawn
  ZOMBIES_BASE_COUNT: 5,         // Nombre de base de zombies par vague
  ZOMBIES_COUNT_PER_WAVE: 3,     // Zombies supplémentaires par vague
  CHOGS_BASE_COUNT: 2,          // NOUVEAU - Nombre de base de chogs par vague
  CHOGS_COUNT_PER_WAVE: 1,

  // Combat
  BULLET_DAMAGE_ZOMBIE: 25,      // Dégâts des balles sur zombies
  BULLET_DAMAGE_CHOG: 20,      // NOUVEAU - Dégâts des balles sur chogs
  BULLET_DAMAGE_BOSS: 15,        // Dégâts des balles sur boss
};

// Constantes pour les taux de drop d'armes
const WEAPON_DROP_RATE_ZOMBIE = 0.15; // 15% de chance pour les zombies normaux
const WEAPON_DROP_RATE_BOSS = 0.5; // 50% de chance pour les boss

export default function ZombieGame({ userData }: ZombieGameProps) {
  const gameRef = useRef<HTMLDivElement>(null);
  const animationRef = useRef<number>(0);
  const keysRef = useRef<{ [key: string]: boolean }>({});
  const waveTransitionRef = useRef<boolean>(false);
  const mousePositionRef = useRef<{ x: number, y: number }>({ x: 0, y: 0 });

  const [gameState, setGameState] = useState<'menu' | 'playing' | 'gameOver' | 'waveTransition'>('menu');
  const [player, setPlayer] = useState<Player>({
    x: GAME_WIDTH / 2,
    y: GAME_HEIGHT / 2,
    health: 100,
    maxHealth: 100
  });

  const [zombies, setZombies] = useState<Zombie[]>([]);
  const [bullets, setBullets] = useState<Bullet[]>([]);
  const [weaponDrops, setWeaponDrops] = useState<WeaponDrop[]>([]);
  const [weaponBonus, setWeaponBonus] = useState<WeaponBonus>({ type: null, timeLeft: 0 });
  const [wave, setWave] = useState(1);
  const [score, setScore] = useState(0);
  const [zombiesKilled, setZombiesKilled] = useState(0);
  const [totalTransactions, setTotalTransactions] = useState(0);
  const [playerRotation, setPlayerRotation] = useState(0);
  const [musicEnabled, setMusicEnabled] = useState(true);
  const musicRef = useRef<HTMLAudioElement | null>(null);

  // Récupération des fonctions du relayer via le hook
  const {
    click,
    submitScoreMonad,
    isLoading: isSubmittingScore,
    userAddress: playerAddress,
    isUserConnected: authenticated
  } = useRelayer();


  const { submitScore, isLoading: isSubmittingToLeaderboard } = useLeaderboard();
  const [submitMessage, setSubmitMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const submitToLeaderboard = useCallback(async () => {
    if (!userData.monadUsername || !userData.crossAppWallet || !authenticated || isSubmittingToLeaderboard) return;

    try {
      setSubmitMessage(null);

      // Utiliser les données correctes depuis userData
      const username = userData.monadUsername;
      const walletAddress = userData.crossAppWallet;

      await submitScore({
        username,
        wallet_address: walletAddress,
        waves_completed: wave - 1, // wave - 1 car la dernière vague n'a pas été terminée
        enemies_killed: zombiesKilled,
        score: score
      });

      setSubmitMessage({ type: 'success', text: 'Score soumis avec succès au leaderboard !' });
    } catch (error) {
      console.error('Erreur lors de la soumission du score:', error);
      setSubmitMessage({ type: 'error', text: 'Erreur lors de la soumission du score.' });
    }
  }, [userData.monadUsername, userData.crossAppWallet, authenticated, score, wave, zombiesKilled, submitScore, isSubmittingToLeaderboard]);

  // Fonction pour soumettre le score à Monad
  const submitGameScore = useCallback(async () => {
    if (!playerAddress || !authenticated || isSubmittingScore) return;

    await submitScoreMonad(score, totalTransactions);
  }, [playerAddress, authenticated, score, totalTransactions, isSubmittingScore, submitScoreMonad]);

  // Gestion des touches
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      keysRef.current[e.code] = true;
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      keysRef.current[e.code] = false;
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  // Gestion du mouvement de la souris pour la rotation du joueur
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (gameState !== 'playing') return;

    const rect = gameRef.current?.getBoundingClientRect();
    if (!rect) return;

    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    mousePositionRef.current = { x: mouseX, y: mouseY };

    const angle = Math.atan2(mouseY - player.y, mouseX - player.x);
    const degrees = (angle * 180 / Math.PI) + 90;

    setPlayerRotation(degrees);
  }, [gameState, player.x, player.y]);

  // Gestion de la musique d'ambiance
  const initMusic = useCallback(() => {
    if (!musicRef.current) {
      try {
        const audio = new Audio('/sounds/music.mp3');
        audio.loop = true;
        audio.volume = 0.2;
        musicRef.current = audio;
      } catch (error) {
        console.log('Music creation failed:', error);
      }
    }
  }, []);

  const playMusic = useCallback(() => {
    if (musicRef.current && musicEnabled) {
      musicRef.current.play().catch(e => {
        console.log('Music play failed:', e);
      });
    }
  }, [musicEnabled]);

  const pauseMusic = useCallback(() => {
    if (musicRef.current) {
      musicRef.current.pause();
    }
  }, []);

  const toggleMusic = useCallback(() => {
    setMusicEnabled(prev => {
      const newValue = !prev;
      if (newValue && (gameState === 'playing' || gameState === 'waveTransition')) {
        playMusic();
      } else {
        pauseMusic();
      }
      return newValue;
    });
  }, [gameState, playMusic, pauseMusic]);

  // Initialiser la musique au premier rendu
  useEffect(() => {
    initMusic();
    return () => {
      if (musicRef.current) {
        musicRef.current.pause();
        musicRef.current = null;
      }
    };
  }, [initMusic]);

  // Gestion de la musique selon l'état du jeu
  useEffect(() => {
    if ((gameState === 'playing' || gameState === 'waveTransition') && musicEnabled) {
      playMusic();
    } else if (gameState === 'menu' || gameState === 'gameOver') {
      pauseMusic();
    }
  }, [gameState, musicEnabled, playMusic, pauseMusic]);

  const playShootSound = useCallback(() => {
    try {
      const audio = new Audio('/sounds/bullet.wav');
      audio.volume = 0.3;
      audio.play().catch(e => {
        console.log('Audio play failed:', e);
      });
    } catch (error) {
      console.log('Audio creation failed:', error);
    }
  }, []);

  const playBossSound = useCallback(() => {
    try {
      const audio = new Audio('/sounds/boss.mp3');
      audio.volume = 0.4;
      audio.play().catch(e => {
        console.log('Boss audio play failed:', e);
      });
    } catch (error) {
      console.log('Boss audio creation failed:', error);
    }
  }, []);

  // Gestion du clic pour tirer
  const handleMouseClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (gameState !== 'playing') return;

    const rect = gameRef.current?.getBoundingClientRect();
    if (!rect) return;

    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const angle = Math.atan2(mouseY - player.y, mouseX - player.x);

    if (weaponBonus.type === 'shotgun') {
      // Tir en éventail avec 3 balles
      const spread = Math.PI / 12;
      const angles = [angle - spread, angle, angle + spread];

      angles.forEach((bulletAngle, index) => {
        const newBullet: Bullet = {
          id: Date.now() + index,
          x: player.x,
          y: player.y,
          angle: bulletAngle,
          speed: 8
        };
        setBullets(prev => [...prev, newBullet]);
      });
    } else {
      // Tir normal avec une seule balle
      const newBullet: Bullet = {
        id: Date.now(),
        x: player.x,
        y: player.y,
        angle,
        speed: 8
      };
      setBullets(prev => [...prev, newBullet]);
    }

    playShootSound();
  }, [gameState, player.x, player.y, playShootSound, weaponBonus.type]);

  // Spawn des zombies
  const spawnZombies = useCallback((waveNumber: number) => {
    const newZombies: Zombie[] = [];
    const isBossWave = waveNumber % DIFFICULTY_CONFIG.BOSS_WAVE_INTERVAL === 0;

    if (isBossWave) {
      playBossSound();
      const bossHealth = DIFFICULTY_CONFIG.BOSS_BASE_HEALTH + (waveNumber * DIFFICULTY_CONFIG.BOSS_HEALTH_PER_WAVE);
      const bossSpeed = DIFFICULTY_CONFIG.BOSS_BASE_SPEED + (waveNumber * DIFFICULTY_CONFIG.BOSS_SPEED_PER_WAVE);

      newZombies.push({
        id: Date.now(),
        x: GAME_WIDTH / 2,
        y: GAME_HEIGHT + 100,
        health: bossHealth,
        maxHealth: bossHealth,
        speed: bossSpeed,
        isBoss: true,
        rotation: 0,
        scaleX: 1
      });

      const normalZombieCount = Math.floor(waveNumber);
      for (let i = 0; i < normalZombieCount; i++) {
        let x, y;
        const side = Math.floor(Math.random() * 4);

        switch (side) {
          case 0: x = Math.random() * GAME_WIDTH; y = -60; break;
          case 1: x = GAME_WIDTH + 60; y = Math.random() * GAME_HEIGHT; break;
          case 2: x = Math.random() * GAME_WIDTH; y = GAME_HEIGHT + 60; break;
          default: x = -60; y = Math.random() * GAME_HEIGHT;
        }

        const zombieHealth = DIFFICULTY_CONFIG.ZOMBIE_BASE_HEALTH + (waveNumber * DIFFICULTY_CONFIG.ZOMBIE_HEALTH_PER_WAVE);
        const zombieSpeed = DIFFICULTY_CONFIG.ZOMBIE_BASE_SPEED + (waveNumber * DIFFICULTY_CONFIG.ZOMBIE_SPEED_PER_WAVE);

        newZombies.push({
          id: Date.now() + i + 1,
          x, y,
          health: zombieHealth,
          maxHealth: zombieHealth,
          speed: zombieSpeed,
          isBoss: false,
          rotation: 0,
          scaleX: 1
        });
      }

      // NOUVEAU - Ajouter des chogs dans les vagues de boss à partir de la vague 5
      if (waveNumber >= DIFFICULTY_CONFIG.CHOG_START_WAVE) {
        const chogCount = Math.floor(waveNumber / 3); // Nombre de chogs dans les vagues de boss
        for (let i = 0; i < chogCount; i++) {
          let x, y;
          const side = Math.floor(Math.random() * 4);

          switch (side) {
            case 0: x = Math.random() * GAME_WIDTH; y = -60; break;
            case 1: x = GAME_WIDTH + 60; y = Math.random() * GAME_HEIGHT; break;
            case 2: x = Math.random() * GAME_WIDTH; y = GAME_HEIGHT + 60; break;
            default: x = -60; y = Math.random() * GAME_HEIGHT;
          }

          const chogHealth = DIFFICULTY_CONFIG.CHOG_BASE_HEALTH + (waveNumber * DIFFICULTY_CONFIG.CHOG_HEALTH_PER_WAVE);
          const chogSpeed = DIFFICULTY_CONFIG.CHOG_BASE_SPEED + (waveNumber * DIFFICULTY_CONFIG.CHOG_SPEED_PER_WAVE);

          newZombies.push({
            id: Date.now() + 1000 + i,
            x, y,
            health: chogHealth,
            maxHealth: chogHealth,
            speed: chogSpeed,
            isBoss: false,
            isChog: true,
            rotation: 0,
            scaleX: 1
          });
        }
      }
    } else {
      const zombieCount = DIFFICULTY_CONFIG.ZOMBIES_BASE_COUNT + (waveNumber * DIFFICULTY_CONFIG.ZOMBIES_COUNT_PER_WAVE);

      for (let i = 0; i < zombieCount; i++) {
        let x, y;
        const side = Math.floor(Math.random() * 4);

        switch (side) {
          case 0: x = Math.random() * GAME_WIDTH; y = -60; break;
          case 1: x = GAME_WIDTH + 60; y = Math.random() * GAME_HEIGHT; break;
          case 2: x = Math.random() * GAME_WIDTH; y = GAME_HEIGHT + 60; break;
          default: x = -60; y = Math.random() * GAME_HEIGHT;
        }

        const zombieHealth = DIFFICULTY_CONFIG.ZOMBIE_BASE_HEALTH + (waveNumber * DIFFICULTY_CONFIG.ZOMBIE_HEALTH_PER_WAVE);
        const zombieSpeed = DIFFICULTY_CONFIG.ZOMBIE_BASE_SPEED + (waveNumber * DIFFICULTY_CONFIG.ZOMBIE_SPEED_PER_WAVE);

        newZombies.push({
          id: Date.now() + i,
          x, y,
          health: zombieHealth,
          maxHealth: zombieHealth,
          speed: zombieSpeed,
          isBoss: false,
          rotation: 0,
          scaleX: 1
        });
      }

      // NOUVEAU - Ajouter des chogs dans les vagues normales à partir de la vague 5
      if (waveNumber >= DIFFICULTY_CONFIG.CHOG_START_WAVE) {
        const chogCount = DIFFICULTY_CONFIG.CHOGS_BASE_COUNT + ((waveNumber - DIFFICULTY_CONFIG.CHOG_START_WAVE) * DIFFICULTY_CONFIG.CHOGS_COUNT_PER_WAVE);

        for (let i = 0; i < chogCount; i++) {
          let x, y;
          const side = Math.floor(Math.random() * 4);

          switch (side) {
            case 0: x = Math.random() * GAME_WIDTH; y = -60; break;
            case 1: x = GAME_WIDTH + 60; y = Math.random() * GAME_HEIGHT; break;
            case 2: x = Math.random() * GAME_WIDTH; y = GAME_HEIGHT + 60; break;
            default: x = -60; y = Math.random() * GAME_HEIGHT;
          }

          const chogHealth = DIFFICULTY_CONFIG.CHOG_BASE_HEALTH + (waveNumber * DIFFICULTY_CONFIG.CHOG_HEALTH_PER_WAVE);
          const chogSpeed = DIFFICULTY_CONFIG.CHOG_BASE_SPEED + (waveNumber * DIFFICULTY_CONFIG.CHOG_SPEED_PER_WAVE);

          newZombies.push({
            id: Date.now() + 1000 + i,
            x, y,
            health: chogHealth,
            maxHealth: chogHealth,
            speed: chogSpeed,
            isBoss: false,
            isChog: true,
            rotation: 0,
            scaleX: 1
          });
        }
      }
    }

    setZombies(newZombies);
    waveTransitionRef.current = false;
  }, [playBossSound]);

  // Démarrer le jeu
  const startGame = () => {
    setGameState('playing');
    setPlayer({
      x: GAME_WIDTH / 2,
      y: GAME_HEIGHT / 2,
      health: 100,
      maxHealth: 100
    });
    setZombies([]);
    setBullets([]);
    setWeaponDrops([]);
    setWeaponBonus({ type: null, timeLeft: 0 });
    setWave(1);
    setScore(0);
    setZombiesKilled(0);
    setTotalTransactions(0);
    setSubmitMessage(null); // Reset du message de soumission
    waveTransitionRef.current = false;
    spawnZombies(1);
  };

  // Effet séparé pour gérer les transitions de vague
  useEffect(() => {
    if (gameState === 'playing' && zombies.length === 0 && !waveTransitionRef.current) {
      waveTransitionRef.current = true;
      setGameState('waveTransition');
    }
  }, [zombies.length, gameState]);

  // Effet séparé pour gérer l'écran de transition
  useEffect(() => {
    if (gameState === 'waveTransition') {
      const timeout = setTimeout(() => {
        const nextWave = wave + 1;
        setWave(nextWave);

        setPlayer(prev => ({
          ...prev,
          health: Math.min(prev.health + 30, prev.maxHealth)
        }));

        setGameState('playing');
        spawnZombies(nextWave);
        waveTransitionRef.current = false;
      }, 2000);

      return () => clearTimeout(timeout);
    }
  }, [gameState, wave, spawnZombies]);

  // Boucle de jeu principale
  useEffect(() => {
    if (gameState !== 'playing') return;

    const gameLoop = () => {
      // Mouvement du joueur
      setPlayer(prev => {
        let newX = prev.x;
        let newY = prev.y;

        if (keysRef.current['KeyW'] || keysRef.current['ArrowUp']) newY -= 4;
        if (keysRef.current['KeyS'] || keysRef.current['ArrowDown']) newY += 4;
        if (keysRef.current['KeyA'] || keysRef.current['ArrowLeft']) newX -= 4;
        if (keysRef.current['KeyD'] || keysRef.current['ArrowRight']) newX += 4;

        newX = Math.max(PLAYER_SIZE, Math.min(GAME_WIDTH - PLAYER_SIZE, newX));
        newY = Math.max(PLAYER_SIZE, Math.min(GAME_HEIGHT - PLAYER_SIZE, newY));

        return { ...prev, x: newX, y: newY };
      });

      // Mouvement des balles
      setBullets(prev => prev.map(bullet => ({
        ...bullet,
        x: bullet.x + Math.cos(bullet.angle) * bullet.speed,
        y: bullet.y + Math.sin(bullet.angle) * bullet.speed
      })).filter(bullet =>
        bullet.x > -10 && bullet.x < GAME_WIDTH + 10 &&
        bullet.y > -10 && bullet.y < GAME_HEIGHT + 10
      ));

      // Mouvement des zombies vers le joueur
      setZombies(prev => prev.map(zombie => {
        const dx = player.x - zombie.x;
        const dy = player.y - zombie.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance > 0) {
          let rotation = 0;
          let scaleX = 1;

          if (dx > 0) {
            rotation = 0;
            scaleX = 1;
          } else if (dx < 0) {
            rotation = 0;
            scaleX = -1;
          }

          return {
            ...zombie,
            x: zombie.x + (dx / distance) * zombie.speed,
            y: zombie.y + (dy / distance) * zombie.speed,
            rotation: rotation,
            scaleX: scaleX
          };
        }
        return zombie;
      }));

      // Gestion du timer de l'arme bonus
      setWeaponBonus(prev => {
        if (prev.type && prev.timeLeft > 0) {
          const newTimeLeft = prev.timeLeft - 16;
          if (newTimeLeft <= 0) {
            return { type: null, timeLeft: 0 };
          }
          return { ...prev, timeLeft: newTimeLeft };
        }
        return prev;
      });

      // Collisions joueur avec weapon drops
      setWeaponDrops(prevDrops => {
        return prevDrops.filter(drop => {
          const dx = player.x - drop.x;
          const dy = player.y - drop.y;
          const distance = Math.sqrt(dx * dx + dy * dy);

          if (distance < 30) {
            const duration = 60000;
            setWeaponBonus({ type: drop.type, timeLeft: duration });
            return false;
          }
          return true;
        });
      });

      // Collisions balles-zombies
      setBullets(prevBullets => {
        const bulletsToRemove = new Set<number>();

        prevBullets.forEach(bullet => {
          if (bulletsToRemove.has(bullet.id)) return;

          zombies.forEach(zombie => {
            if (bulletsToRemove.has(bullet.id)) return;

            const dx = bullet.x - zombie.x;
            const dy = bullet.y - zombie.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            const hitRadius = zombie.isBoss ? BOSS_SIZE : ZOMBIE_SIZE;

            if (distance < hitRadius) {
              bulletsToRemove.add(bullet.id);

              const damage = zombie.isBoss
                ? DIFFICULTY_CONFIG.BULLET_DAMAGE_BOSS
                : zombie.isChog
                  ? DIFFICULTY_CONFIG.BULLET_DAMAGE_CHOG
                  : DIFFICULTY_CONFIG.BULLET_DAMAGE_ZOMBIE;

              setZombies(prevZombies =>
                prevZombies.map(z => {
                  if (z.id === zombie.id) {
                    const newHealth = z.health - damage;
                    if (newHealth <= 0) {
                      const points = z.isBoss ? 100 : z.isChog ? 15 : 10;
                      setScore(prev => prev + points);
                      setZombiesKilled(prev => prev + 1);
                      setTotalTransactions(prev => prev + 1);

                      if (authenticated && playerAddress) {
                        click();
                      }

                      const dropChance = z.isBoss ? WEAPON_DROP_RATE_BOSS : WEAPON_DROP_RATE_ZOMBIE;
                      if (Math.random() < dropChance) {
                        const newDrop: WeaponDrop = {
                          id: Date.now() + Math.random(),
                          x: z.x,
                          y: z.y,
                          type: 'shotgun'
                        };
                        setWeaponDrops(prev => [...prev, newDrop]);
                      }

                      return null as any;
                    }
                    return { ...z, health: newHealth };
                  }
                  return z;
                }).filter(Boolean)
              );
            }
          });
        });

        return prevBullets.filter(bullet => !bulletsToRemove.has(bullet.id));
      });

      // Collisions zombies-joueur
      zombies.forEach(zombie => {
        const dx = player.x - zombie.x;
        const dy = player.y - zombie.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        const hitRadius = (zombie.isBoss ? BOSS_SIZE : ZOMBIE_SIZE) + PLAYER_SIZE;

        if (distance < hitRadius) {
          setPlayer(prev => {
            const damage = zombie.isBoss
              ? DIFFICULTY_CONFIG.BOSS_DAMAGE
              : zombie.isChog
                ? DIFFICULTY_CONFIG.CHOG_DAMAGE
                : DIFFICULTY_CONFIG.ZOMBIE_DAMAGE;

            const newHealth = prev.health - damage;
            if (newHealth <= 0) {
              setGameState('gameOver');
            }
            return { ...prev, health: newHealth };
          });
        }
      });

      animationRef.current = requestAnimationFrame(gameLoop);
    };

    animationRef.current = requestAnimationFrame(gameLoop);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [gameState, player.x, player.y, zombies, authenticated, playerAddress, click]);

  return (
    <div className="flex flex-col items-center space-y-4">
      {/* HUD */}
      <div className="flex items-center space-x-6 p-2">
        <div className="flex items-center space-x-2">
          <Heart className="w-5 h-5 text-red-500" />
          <div className="w-32 h-4 bg-gray-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-red-500 to-green-500 transition-all duration-300"
              style={{ width: `${(player.health / player.maxHealth) * 100}%` }}
            />
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <span className="text-white font-bold">Score: {score}</span>
        </div>

        <div className="flex items-center space-x-2">
          <span className="text-white font-bold">Wave: {wave}</span>
        </div>

        <div className="text-white font-bold">
          Kills: {zombiesKilled}
        </div>

        {/* Indicateur d'arme bonus */}
        {weaponBonus.type && (
          <div className="flex items-center space-x-2 px-3 py-2 bg-orange-600 rounded-lg">
            <span className="text-sm">🔫</span>
            <span className="text-white font-bold text-sm">
              SHOTGUN: {Math.ceil(weaponBonus.timeLeft / 1000)}s
            </span>
          </div>
        )}

        {/* Bouton musique */}
        <button
          onClick={toggleMusic}
          className={`flex items-center space-x-1 px-3 py-2 rounded-lg transition-colors duration-200 ${musicEnabled
            ? 'bg-green-600 hover:bg-green-700 text-white'
            : 'bg-gray-600 hover:bg-gray-700 text-gray-300'
            }`}
          title={musicEnabled ? 'Couper la musique' : 'Activer la musique'}
        >
          {musicEnabled ? (
            <>
              <span className="text-sm">🎵</span>
              <span className="text-xs">ON</span>
            </>
          ) : (
            <>
              <span className="text-sm">🔇</span>
              <span className="text-xs">OFF</span>
            </>
          )}
        </button>
      </div>

      {/* Zone de jeu */}
      <div
        ref={gameRef}
        className="relative bg-gray-800 border-2 border-gray-600 cursor-crosshair select-none"
        style={{
          width: GAME_WIDTH,
          height: GAME_HEIGHT,
          backgroundImage: 'url("/img/background.jpg")',
          backgroundSize: 'cover',
          backgroundPosition: 'center'
        }}
        onClick={handleMouseClick}
        onMouseMove={handleMouseMove}
      >
        {gameState === 'menu' && (
          <div className="absolute inset-0 bg-black bg-opacity-75 flex items-center justify-center">
            <div className="text-center space-y-4">
              <h2 className="text-4xl font-gaming font-bold text-white">Monapocalypse</h2>
              <p className="text-gray-300">WASD for moving, mouse click for shooting</p>
              <button
                onClick={startGame}
                className="px-16 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 font-semibold transition-all duration-200 text-xl"
              >
                Let's go!
              </button>
            </div>
          </div>
        )}

        {gameState === 'waveTransition' && (
          <div className="absolute inset-0 bg-black bg-opacity-75 flex items-center justify-center">
            <div className="text-center space-y-4">
              <h2 className="text-3xl font-gaming font-bold text-green-400">
                WAVE {wave} FINISHED !
              </h2>
              <p className="text-white text-xl">
                {(wave + 1) % DIFFICULTY_CONFIG.BOSS_WAVE_INTERVAL === 0
                  ? `⚠️ BOSS INCOMING - Wave ${wave + 1} ⚠️`
                  : `Wave incoming ${wave + 1}...`
                }
              </p>
              <div className="animate-spin w-8 h-8 border-4 border-green-400 border-t-transparent rounded-full mx-auto"></div>
            </div>
          </div>
        )}

        {gameState === 'gameOver' && (
          <div className="absolute inset-0 bg-black bg-opacity-75 flex items-center justify-center">
            <div className="text-center space-y-4 max-w-md">
              <h2 className="text-4xl font-gaming font-bold text-red-500">GAME OVER</h2>
              <p className="text-white text-xl">Final score: {score}</p>
              <p className="text-white">Kills: {zombiesKilled}</p>
              <p className="text-white">Transactions: {totalTransactions}</p>
              <p className="text-white">Waves finished: {wave - 1}</p>
              
              {/* Message de soumission */}
              {submitMessage && (
                <div className={`p-3 rounded-lg ${
                  submitMessage.type === 'success' 
                    ? 'bg-green-600 text-white' 
                    : 'bg-red-600 text-white'
                }`}>
                  {submitMessage.text}
                </div>
              )}

              {/* Boutons */}
              <div className="flex flex-col space-y-3">
                {/* Bouton Submit Score to Monad (existant) */}
                {authenticated && playerAddress && (
                  <button
                    onClick={submitGameScore}
                    disabled={isSubmittingScore}
                    className={`px-16 py-3 rounded-lg font-semibold transition-all duration-200 text-xl ${
                      isSubmittingScore
                        ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
                        : 'bg-purple-600 text-white hover:bg-purple-700'
                    }`}
                  >
                    {isSubmittingScore ? 'Submitting to Monad...' : 'Submit Score to Monad'}
                  </button>
                )}

                {/* Nouveau bouton Submit to Leaderboard */}
                {authenticated && userData.monadUsername && userData.crossAppWallet && (
                  <button
                    onClick={submitToLeaderboard}
                    disabled={isSubmittingToLeaderboard || submitMessage?.type === 'success'}
                    className={`px-16 py-3 rounded-lg font-semibold transition-all duration-200 text-xl ${
                      isSubmittingToLeaderboard
                        ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
                        : submitMessage?.type === 'success'
                        ? 'bg-green-600 text-white cursor-not-allowed'
                        : 'bg-blue-600 text-white hover:bg-blue-700'
                    }`}
                  >
                    {isSubmittingToLeaderboard 
                      ? 'Submitting to Leaderboard...' 
                      : submitMessage?.type === 'success'
                      ? '✓ Submitted to Leaderboard'
                      : 'Submit to Leaderboard'
                    }
                  </button>
                )}

                {/* Bouton Replay */}
                <button
                  onClick={startGame}
                  className="px-16 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 font-semibold transition-all duration-200 text-xl"
                >
                  REPLAY
                </button>
              </div>
            </div>
          </div>
        )}

        {(gameState === 'playing' || gameState === 'waveTransition') && (
          <>
            {/* Joueur */}
            <div
              className="absolute select-none pointer-events-none"
              style={{
                left: player.x - 30,
                top: player.y - 30,
                width: 60,
                height: 60,
                transform: `rotate(${playerRotation}deg)`,
                transformOrigin: 'center center'
              }}
            >
              <img
                src="/img/player.png"
                alt="player"
                className="w-full h-full object-contain"
                draggable={false}
              />
            </div>

            {/* Zombies */}
            {zombies
              .filter(zombie =>
                zombie.x >= (zombie.isBoss ? 50 : 25) &&
                zombie.x <= GAME_WIDTH - (zombie.isBoss ? 50 : 25) &&
                zombie.y >= (zombie.isBoss ? 50 : 25) &&
                zombie.y <= GAME_HEIGHT - (zombie.isBoss ? 50 : 25)
              )
              .map(zombie => {
                const size = zombie.isBoss ? 100 : 50;
                const halfSize = size / 2;

                return (
                  <div
                    key={zombie.id}
                    className="absolute"
                    style={{
                      left: zombie.x - halfSize,
                      top: zombie.y - halfSize,
                      width: size,
                      height: size,
                      transform: `rotate(${zombie.rotation || 0}deg) scaleX(${zombie.scaleX || 1})`,
                      transformOrigin: 'center center'
                    }}
                  >
                    <img
                      src={zombie.isBoss ? "/img/boss.gif" : zombie.isChog ? "/img/chog.gif" : "/img/molandakz.gif"}
                      alt={zombie.isBoss ? "boss" : zombie.isChog ? "chog" : "zombie"}
                      className={`w-full h-full object-cover rounded-full select-none pointer-events-none`}
                      draggable={false}
                    />

                    <div className={`absolute -top-1 left-1/2 transform -translate-x-1/2 h-2 bg-gray-600 rounded-full ${zombie.isBoss ? 'w-20' : 'w-12'}`}>
                      <div className={`h-full rounded-full transition-all duration-200 ${zombie.isBoss ? 'bg-purple-500' : zombie.isChog ? 'bg-orange-500' : 'bg-red-500'
                        }`}
                        style={{ width: `${(zombie.health / zombie.maxHealth) * 100}%` }}
                      />
                    </div>
                  </div>
                );
              })}

            {/* Weapon Drops */}
            {weaponDrops.map(drop => (
              <div
                key={drop.id}
                className="absolute animate-bounce"
                style={{
                  left: drop.x - 15,
                  top: drop.y - 15,
                  width: 30,
                  height: 30
                }}
              >
                <div className="w-full h-full bg-orange-500 rounded-lg border-2 border-orange-300 flex items-center justify-center shadow-lg">
                  <span className="text-white font-bold text-xs">🔫</span>
                </div>
              </div>
            ))}

            {/* Balles */}
            {bullets.map(bullet => (
              <div
                key={bullet.id}
                className="absolute w-1 h-1 bg-yellow-400 rounded-full select-none pointer-events-none"
                style={{
                  left: bullet.x - BULLET_SIZE / 2,
                  top: bullet.y - BULLET_SIZE / 2
                }}
              />
            ))}
          </>
        )}
      </div>
    </div>
  );
}