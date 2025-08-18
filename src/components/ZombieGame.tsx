import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useRelayer } from '../lib/useRelayer';
import { useLeaderboard } from '../hooks/useLeaderboard';

// CSS optimisé en tant que chaîne
const flickerCSS = `
  @keyframes flicker {
    0% { opacity: 0.8; transform: scale(1); }
    100% { opacity: 1; transform: scale(1.1); }
  }
  @keyframes laserTrail {
    0% { opacity: 1; transform: scale(1); }
    100% { opacity: 0; transform: scale(0.5); }
  }
`;

// Injection unique du CSS
if (!document.head.querySelector('[data-flicker-styles]')) {
  const style = document.createElement('style');
  style.textContent = flickerCSS;
  style.setAttribute('data-flicker-styles', 'true');
  document.head.appendChild(style);
}

// Types optimisés avec des interfaces plus strictes
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
  bossType?: BossType;
  rotation?: number;
  scaleX?: number;
}

interface Bullet {
  id: number;
  x: number;
  y: number;
  angle: number;
  speed: number;
  type?: BulletType;
  trail?: TrailPoint[];
  createdAt: number;
}

interface TrailPoint {
  x: number;
  y: number;
  opacity: number;
}

interface Explosion {
  id: number;
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  opacity: number;
  damage: number;
}

interface Drop {
  id: number;
  x: number;
  y: number;
  type: string;
}

interface WeaponBonus {
  type: WeaponType | null;
  timeLeft: number;
}

interface ShieldBonus {
  active: boolean;
  timeLeft: number;
}

// Types pour améliorer la performance
type BulletType = 'normal' | 'shotgun' | 'laser' | 'plasma' | 'rocket';
type WeaponType = 'shotgun' | 'laser' | 'plasma' | 'rocket';
type PowerUpType = 'health' | 'shield';
type GameState = 'menu' | 'playing' | 'gameOver' | 'waveTransition';
type BossType = 'destroyer' | 'titan' | 'nightmare' | 'overlord';

interface ZombieGameProps {
  userData: { monadUsername: string | null; crossAppWallet: string | null };
}

// Configuration centralisée et optimisée
const CONFIG = {
  GAME: {
    WIDTH: 1200,
    HEIGHT: 600,
    PLAYER_SIZE: 30,
    ZOMBIE_SIZE: 25,
    BOSS_SIZE: 50,
    BULLET_SIZE: 6,
    PLAYER_SPEED: 4, // Vitesse du joueur en pixels par frame
  },
  DIFFICULTY: {
    ZOMBIE_BASE_HEALTH: 250,
    ZOMBIE_HEALTH_PER_WAVE: 5,
    ZOMBIE_BASE_SPEED: 0.8,
    ZOMBIE_SPEED_PER_WAVE: 0.03,
    ZOMBIE_MAX_SPEED: 3.5, // Vitesse maximale pour les zombies (87.5% de la vitesse joueur)
    ZOMBIE_DAMAGE: 1,
    CHOG_BASE_HEALTH: 150,
    CHOG_HEALTH_PER_WAVE: 5,
    CHOG_BASE_SPEED: 1.2,
    CHOG_SPEED_PER_WAVE: 0.03,
    CHOG_MAX_SPEED: 3.8, // Vitesse maximale pour les chogs (95% de la vitesse joueur)
    CHOG_DAMAGE: 2,
    CHOG_START_WAVE: 3,
    BOSS_BASE_HEALTH: 2000,
    BOSS_HEALTH_PER_WAVE: 500,
    BOSS_BASE_SPEED: 0.5,
    BOSS_SPEED_PER_WAVE: 0.05,
    BOSS_MAX_SPEED: 3.2, // Vitesse maximale pour les boss (80% de la vitesse joueur)
    BOSS_DAMAGE: 3,
    BOSS_WAVE_INTERVAL: 5,
    ZOMBIES_BASE_COUNT: 5,
    ZOMBIES_COUNT_PER_WAVE: 1,
    CHOGS_BASE_COUNT: 2,
    CHOGS_COUNT_PER_WAVE: 1,
    BULLET_DAMAGE_ZOMBIE: 25,
    BULLET_DAMAGE_CHOG: 20,
    BULLET_DAMAGE_BOSS: 15,
    LASER_DAMAGE_ZOMBIE: 50,
    LASER_DAMAGE_CHOG: 50,
    LASER_DAMAGE_BOSS: 50,
    PLASMA_DAMAGE_ZOMBIE: 60,
    PLASMA_DAMAGE_CHOG: 55,
    PLASMA_DAMAGE_BOSS: 40,
    PLASMA_EXPLOSION_RADIUS: 80,
    ROCKET_DAMAGE_ZOMBIE: 120,
    ROCKET_DAMAGE_CHOG: 120,
    ROCKET_DAMAGE_BOSS: 120,
    ROCKET_EXPLOSION_RADIUS: 120,
    ROCKET_SELF_DAMAGE: 20,
    ROCKET_SAFE_DISTANCE: 60,
    SHIELD_DURATION: 30000,
  },
  BOSS_TYPES: {
    destroyer: {
      name: 'Destroyer',
      image: '/img/boss1.gif',
      healthMultiplier: 1.0,
      speedMultiplier: 1.0,
      damageMultiplier: 1.0,
      color: 'bg-purple-500',
      emoji: ''
    },
    titan: {
      name: 'Titan',
      image: '/img/boss2.gif',
      healthMultiplier: 1.3,
      speedMultiplier: 1.0,
      damageMultiplier: 1.5,
      color: 'bg-red-500',
      emoji: ''
    },
    nightmare: {
      name: 'Nightmare',
      image: '/img/boss3.gif',
      healthMultiplier: 0.8,
      speedMultiplier: 1.5,
      damageMultiplier: 1.2,
      color: 'bg-green-500',
      emoji: ''
    },
    overlord: {
      name: 'Overlord',
      image: '/img/boss4.gif',
      healthMultiplier: 2,
      speedMultiplier: 1.0,
      damageMultiplier: 2.0,
      color: 'bg-yellow-500',
      emoji: ''
    }
  },
  DROPS: {
    WEAPON_DROP_RATE_ZOMBIE: 0.04,
    WEAPON_DROP_RATE_BOSS: 0.5,
    POWERUP_DROP_RATE_ZOMBIE: 0.02,
    POWERUP_DROP_RATE_BOSS: 0.5,
  },
  BULLETS: {
    MAX_LIFETIME: 8000,
    BOUNDARY_MARGIN: 50,
    CLEANUP_INTERVAL: 2000,
    MAX_BULLETS: 150,
  },
  FIRE_RATES: {
    shotgun: 100,
    rocket: 250,
    plasma: 210,
    laser: 175,
    normal: 100,
  },
  SPAWN: {
    DURATION: 8000,           // Durée totale d'apparition (5s)
    MIN_DELAY: 400,           // Délai minimum entre spawns (200ms)
    MAX_DELAY: 1200,          // Délai maximum entre spawns (1200ms)
    OVERLAP_FACTOR: 0.6,      // Facteur pour permettre du chevauchement
  }
} as const;

const BLOCKCHAIN_TX_ENABLED = import.meta.env.VITE_ENABLE_BLOCKCHAIN_TX === '1';

// Fonction utilitaire pour sélectionner un boss aléatoire
const getRandomBossType = (): BossType => {
  const bossTypes: BossType[] = ['destroyer', 'titan', 'nightmare', 'overlord'];
  return bossTypes[Math.floor(Math.random() * bossTypes.length)];
};

// Fonction utilitaire pour calculer la vitesse limitée des ennemis
const calculateLimitedSpeed = (baseSpeed: number, speedPerWave: number, waveNumber: number, maxSpeed: number): number => {
  const calculatedSpeed = baseSpeed + (waveNumber * speedPerWave);
  return Math.min(calculatedSpeed, maxSpeed);
};

// Fonction utilitaire pour créer des sons
const createSound = (src: string, volume = 0.5) => {
  try {
    const audio = new Audio(src);
    audio.volume = volume;
    return audio;
  } catch {
    return null;
  }
};



export default function ZombieGame({ userData }: ZombieGameProps) {
  // Refs optimisées
  const gameRef = useRef<HTMLDivElement>(null);
  const animationRef = useRef<number>(0);
  const keysRef = useRef<Record<string, boolean>>({});
  const waveTransitionRef = useRef<boolean>(false);
  const mousePositionRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const lastCleanupRef = useRef<number>(0);
  const bulletCounterRef = useRef<number>(0);
  const musicRef = useRef<HTMLAudioElement | null>(null);

  // États principaux
  const [gameState, setGameState] = useState<GameState>('menu');
  const [player, setPlayer] = useState<Player>({
    x: CONFIG.GAME.WIDTH / 2,
    y: CONFIG.GAME.HEIGHT / 2,
    health: 100,
    maxHealth: 100
  });

  const [zombies, setZombies] = useState<Zombie[]>([]);
  const [bullets, setBullets] = useState<Bullet[]>([]);
  const [plasmaExplosions, setPlasmaExplosions] = useState<Explosion[]>([]);
  const [rocketExplosions, setRocketExplosions] = useState<Explosion[]>([]);
  const [weaponDrops, setWeaponDrops] = useState<Drop[]>([]);
  const [powerUpDrops, setPowerUpDrops] = useState<Drop[]>([]);
  const [weaponBonus, setWeaponBonus] = useState<WeaponBonus>({ type: null, timeLeft: 0 });
  const [shieldBonus, setShieldBonus] = useState<ShieldBonus>({ active: false, timeLeft: 0 });
  const [isMouseDown, setIsMouseDown] = useState<boolean>(false);
  const [lastShotTime, setLastShotTime] = useState<number>(0);
  const [lastRocketTime, setLastRocketTime] = useState<number>(0); // Nouveau: cooldown spécial pour rocket
  const [wave, setWave] = useState(1);
  const [score, setScore] = useState(0);
  const [zombiesKilled, setZombiesKilled] = useState(0);
  const [totalTransactions, setTotalTransactions] = useState(0);
  const [playerRotation, setPlayerRotation] = useState(0);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [submitMessage, setSubmitMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isSpawning, setIsSpawning] = useState(false);
  const spawnTimeoutsRef = useRef<NodeJS.Timeout[]>([]);

  // Hooks externes
  const {
    click,
    submitScoreMonad,
    isLoading: isSubmittingScore,
    userAddress: playerAddress,
    isUserConnected: authenticated
  } = useRelayer();

  const { submitScore, isLoading: isSubmittingToLeaderboard } = useLeaderboard();

  const shareOnTwitter = () => {
    const tweetText = `I survived ${wave} waves on Monapocalypse with a ${score} score !!\n\nTry to break my score:\n https://monapocalypse.vercel.app/`;
    const twitterIntentUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(tweetText)}`;
    window.open(twitterIntentUrl, '_blank');
  };

  // Fonctions de validation optimisées avec useMemo
  const bulletValidators = useMemo(() => ({
    isOutOfBounds: (bullet: Bullet): boolean => (
      bullet.x < 0 || bullet.x > CONFIG.GAME.WIDTH || bullet.y < 0 || bullet.y > CONFIG.GAME.HEIGHT
    ),
    isTooOld: (bullet: Bullet, currentTime: number): boolean => (
      (currentTime - bullet.createdAt) > CONFIG.BULLETS.MAX_LIFETIME
    )
  }), []);

  // Fonction de nettoyage optimisée
  const cleanupBullets = useCallback((currentBullets: Bullet[]): Bullet[] => {
    const currentTime = Date.now();
    let validBullets = currentBullets.filter(bullet => (
      !bulletValidators.isOutOfBounds(bullet) &&
      !bulletValidators.isTooOld(bullet, currentTime) &&
      bullet.id && typeof bullet.id === 'number'
    ));

    if (validBullets.length > CONFIG.BULLETS.MAX_BULLETS) {
      validBullets.sort((a, b) => b.createdAt - a.createdAt);
      validBullets = validBullets.slice(0, CONFIG.BULLETS.MAX_BULLETS);
    }

    return validBullets;
  }, [bulletValidators]);

  // Fonctions audio optimisées
  const audioFunctions = useMemo(() => ({
    playShoot: () => soundEnabled && createSound('/sounds/bullet.wav', 0.3)?.play().catch(() => { }),
    playLaser: () => soundEnabled && createSound('/sounds/laser.wav', 0.4)?.play().catch(() => { }),
    playPlasma: () => soundEnabled && createSound('/sounds/plasma.wav', 0.5)?.play().catch(() => { }),
    playRocket: () => soundEnabled && createSound('/sounds/rocket.wav', 0.6)?.play().catch(() => { }),
    playExplosion: () => soundEnabled && createSound('/sounds/explosion.wav', 0.7)?.play().catch(() => { }),
    playHealth: () => soundEnabled && createSound('/sounds/health.wav', 0.5)?.play().catch(() => { }),
    playShield: () => soundEnabled && createSound('/sounds/shield.wav', 0.6)?.play().catch(() => { }),
    playBoss: () => soundEnabled && createSound('/sounds/boss.mp3', 0.4)?.play().catch(() => { }),
  }), [soundEnabled]);

  // Gestion de la musique optimisée
  const musicFunctions = useMemo(() => ({
    init: () => {
      if (!musicRef.current) {
        musicRef.current = createSound('/sounds/music.mp3', 0.2);
        if (musicRef.current) musicRef.current.loop = true;
      }
    },
    play: () => {
      if (soundEnabled && musicRef.current && musicRef.current.paused) {
        musicRef.current.play().catch(() => { });
      }
    },
    pause: () => musicRef.current?.pause(),
    toggle: () => {
      setSoundEnabled(prev => {
        const newValue = !prev;
        if (newValue && (gameState === 'playing' || gameState === 'waveTransition')) {
          if (musicRef.current && musicRef.current.paused) {
            musicRef.current.play().catch(() => { });
          }
        } else {
          musicRef.current?.pause();
        }
        return newValue;
      });
    }
  }), [soundEnabled]); // Retirer gameState des dépendances

  // Fonction pour calculer les dégâts optimisée
  const calculateDamage = useCallback((bulletType: BulletType, zombieType: 'normal' | 'chog' | 'boss'): number => {
    // Gestion spéciale pour les balles normales et shotgun
    if (bulletType === 'normal' || bulletType === 'shotgun') {
      if (zombieType === 'boss') return CONFIG.DIFFICULTY.BULLET_DAMAGE_BOSS;
      if (zombieType === 'chog') return CONFIG.DIFFICULTY.BULLET_DAMAGE_CHOG;
      return CONFIG.DIFFICULTY.BULLET_DAMAGE_ZOMBIE;
    }

    // Pour laser, plasma, rocket
    const damageKey = `${bulletType.toUpperCase()}_DAMAGE_${zombieType.toUpperCase()}` as keyof typeof CONFIG.DIFFICULTY;
    return CONFIG.DIFFICULTY[damageKey] as number || CONFIG.DIFFICULTY.BULLET_DAMAGE_ZOMBIE;
  }, []);

  // Fonction pour créer des drops optimisée
  const createDrop = useCallback((x: number, y: number, type: 'weapon' | 'powerup', isBoss = false) => {
    const dropChance = isBoss ?
      (type === 'weapon' ? CONFIG.DROPS.WEAPON_DROP_RATE_BOSS : CONFIG.DROPS.POWERUP_DROP_RATE_BOSS) :
      (type === 'weapon' ? CONFIG.DROPS.WEAPON_DROP_RATE_ZOMBIE : CONFIG.DROPS.POWERUP_DROP_RATE_ZOMBIE);

    if (Math.random() < dropChance) {
      const id = Date.now() + Math.random();
      if (type === 'weapon') {
        const weaponTypes: WeaponType[] = ['shotgun', 'laser', 'plasma', 'rocket'];
        const randomType = weaponTypes[Math.floor(Math.random() * weaponTypes.length)];
        setWeaponDrops(prev => [...prev, { id, x, y, type: randomType }]);
      } else {
        const powerUpTypes: PowerUpType[] = ['health', 'shield'];
        const randomType = powerUpTypes[Math.floor(Math.random() * powerUpTypes.length)];
        setPowerUpDrops(prev => [...prev, { id, x, y, type: randomType }]);
      }
    }
  }, []);

  // Fonction pour tuer un zombie optimisée
  const killZombie = useCallback((zombie: Zombie) => {
    const points = zombie.isBoss ? 100 : zombie.isChog ? 15 : 10;
    setScore(prev => prev + points);
    setZombiesKilled(prev => prev + 1);

    createDrop(zombie.x, zombie.y, 'weapon', zombie.isBoss);
    createDrop(zombie.x, zombie.y, 'powerup', zombie.isBoss);
  }, [authenticated, playerAddress, click, createDrop]);

  // Fonction pour créer des explosions optimisée
  const createExplosion = useCallback((x: number, y: number, type: 'plasma' | 'rocket') => {
    const config = type === 'plasma' ?
      { radius: CONFIG.DIFFICULTY.PLASMA_EXPLOSION_RADIUS, setter: setPlasmaExplosions } :
      { radius: CONFIG.DIFFICULTY.ROCKET_EXPLOSION_RADIUS, setter: setRocketExplosions };

    const newExplosion: Explosion = {
      id: Date.now() + Math.random(),
      x, y,
      radius: 0,
      maxRadius: config.radius,
      opacity: 1,
      damage: 0
    };

    config.setter(prev => [...prev, newExplosion]);
    if (type === 'rocket') audioFunctions.playExplosion();

    // Vérifier dégâts au joueur pour rocket
    if (type === 'rocket' && !shieldBonus.active) {
      const playerDistance = Math.sqrt((player.x - x) ** 2 + (player.y - y) ** 2);
      if (playerDistance <= CONFIG.DIFFICULTY.ROCKET_SAFE_DISTANCE) {
        setPlayer(prev => ({
          ...prev,
          health: Math.max(0, prev.health - CONFIG.DIFFICULTY.ROCKET_SELF_DAMAGE)
        }));
      }
    }

    // Appliquer dégâts aux zombies
    setZombies(prevZombies =>
      prevZombies.map(zombie => {
        const distance = Math.sqrt((zombie.x - x) ** 2 + (zombie.y - y) ** 2);
        if (distance <= config.radius) {
          const zombieType = zombie.isBoss ? 'boss' : zombie.isChog ? 'chog' : 'normal';
          const damage = calculateDamage(type, zombieType);
          const newHealth = zombie.health - damage;

          if (newHealth <= 0) {
            killZombie(zombie);
            return null;
          }
          return { ...zombie, health: newHealth };
        }
        return zombie;
      }).filter(Boolean) as Zombie[]
    );
  }, [player.x, player.y, shieldBonus.active, audioFunctions.playExplosion, calculateDamage, killZombie]);

  // Fonction de tir optimisée
  const fireBullet = useCallback(() => {
    if (gameState !== 'playing') return;

    const currentTime = Date.now();

    // Vérification spéciale pour le rocket launcher (1 seconde de cooldown)
    if (weaponBonus.type === 'rocket') {
      if (currentTime - lastRocketTime < 1000) {
        return; // Empêche le tir si moins d'1 seconde s'est écoulée
      }
      setLastRocketTime(currentTime);
    }

    const mousePos = mousePositionRef.current;
    const angle = Math.atan2(mousePos.y - player.y, mousePos.x - player.x);
    bulletCounterRef.current += 1;

    const createBullet = (bulletAngle: number, offset = 0): Bullet => ({
      id: currentTime + bulletCounterRef.current + offset,
      x: player.x,
      y: player.y,
      angle: bulletAngle,
      speed: weaponBonus.type === 'laser' ? 12 : weaponBonus.type === 'plasma' ? 6 : weaponBonus.type === 'rocket' ? 4 : 8,
      type: (weaponBonus.type || 'normal') as BulletType,
      trail: weaponBonus.type === 'laser' ? [] : undefined,
      createdAt: currentTime
    });

    let newBullets: Bullet[];

    if (weaponBonus.type === 'shotgun') {
      const spread = Math.PI / 12;
      newBullets = [angle - spread, angle, angle + spread].map((a, i) => createBullet(a, i * 0.1));
      audioFunctions.playShoot();
    } else {
      newBullets = [createBullet(angle)];
      switch (weaponBonus.type) {
        case 'laser': audioFunctions.playLaser(); break;
        case 'plasma': audioFunctions.playPlasma(); break;
        case 'rocket': audioFunctions.playRocket(); break;
        default: audioFunctions.playShoot();
      }
    }

    setBullets(prev => cleanupBullets([...prev, ...newBullets]));
  }, [gameState, player.x, player.y, weaponBonus.type, audioFunctions, cleanupBullets, lastRocketTime]);

  // Gestion des événements optimisée
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => { keysRef.current[e.code] = true; };
    const handleKeyUp = (e: KeyboardEvent) => { keysRef.current[e.code] = false; };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  // Gestion de la souris optimisée
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (gameState !== 'playing') return;

    const rect = gameRef.current?.getBoundingClientRect();
    if (!rect) return;

    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    mousePositionRef.current = { x: mouseX, y: mouseY };

    const angle = Math.atan2(mouseY - player.y, mouseX - player.x);
    setPlayerRotation((angle * 180 / Math.PI) + 90);
  }, [gameState, player.x, player.y]);

  const handleMouseDown = useCallback(() => {
    if (gameState !== 'playing') return;
    setIsMouseDown(true);

    // Pour le rocket launcher, ne pas réinitialiser lastShotTime pour éviter le tir immédiat en boucle
    if (weaponBonus.type !== 'rocket') {
      setLastShotTime(0); // Permettre le tir immédiat pour les autres armes
    }

    fireBullet();
  }, [gameState, fireBullet, weaponBonus.type]);

  const handleMouseUp = useCallback(() => setIsMouseDown(false), []);

  const spawnZombies = useCallback((waveNumber: number) => {
    // Nettoyer les timeouts précédents
    spawnTimeoutsRef.current.forEach(timeout => clearTimeout(timeout));
    spawnTimeoutsRef.current = [];

    setIsSpawning(true);

    const newZombies: Zombie[] = [];
    const isBossWave = waveNumber % CONFIG.DIFFICULTY.BOSS_WAVE_INTERVAL === 0;

    const createZombie = (type: 'normal' | 'chog' | 'boss', index = 0): Zombie => {
      let x, y;
      const side = Math.floor(Math.random() * 4);

      switch (side) {
        case 0: x = Math.random() * CONFIG.GAME.WIDTH; y = -60; break;
        case 1: x = CONFIG.GAME.WIDTH + 60; y = Math.random() * CONFIG.GAME.HEIGHT; break;
        case 2: x = Math.random() * CONFIG.GAME.WIDTH; y = CONFIG.GAME.HEIGHT + 60; break;
        default: x = -60; y = Math.random() * CONFIG.GAME.HEIGHT;
      }

      const baseId = Date.now() + index;

      if (type === 'boss') {
        // Sélectionner un type de boss aléatoire
        const bossType = getRandomBossType();
        const bossConfig = CONFIG.BOSS_TYPES[bossType];

        console.log(`🎲 Boss spawned: ${bossConfig.name} (${bossType})`);

        const baseHealth = CONFIG.DIFFICULTY.BOSS_BASE_HEALTH + (waveNumber * CONFIG.DIFFICULTY.BOSS_HEALTH_PER_WAVE);
        const health = Math.floor(baseHealth * bossConfig.healthMultiplier);

        const baseSpeed = calculateLimitedSpeed(
          CONFIG.DIFFICULTY.BOSS_BASE_SPEED,
          CONFIG.DIFFICULTY.BOSS_SPEED_PER_WAVE,
          waveNumber,
          CONFIG.DIFFICULTY.BOSS_MAX_SPEED
        );
        const speed = baseSpeed * bossConfig.speedMultiplier;

        console.log(`Boss stats - Health: ${health}, Speed: ${speed.toFixed(2)}, Type: ${bossType}`);

        return {
          id: baseId,
          x: CONFIG.GAME.WIDTH / 2,
          y: CONFIG.GAME.HEIGHT + 100,
          health,
          maxHealth: health,
          speed,
          isBoss: true,
          bossType,
          rotation: 0,
          scaleX: 1
        };
      } else if (type === 'chog') {
        const health = CONFIG.DIFFICULTY.CHOG_BASE_HEALTH + (waveNumber * CONFIG.DIFFICULTY.CHOG_HEALTH_PER_WAVE);
        const speed = calculateLimitedSpeed(
          CONFIG.DIFFICULTY.CHOG_BASE_SPEED,
          CONFIG.DIFFICULTY.CHOG_SPEED_PER_WAVE,
          waveNumber,
          CONFIG.DIFFICULTY.CHOG_MAX_SPEED
        );
        return { id: baseId + 1000, x, y, health, maxHealth: health, speed, isChog: true, rotation: 0, scaleX: 1 };
      } else {
        const health = CONFIG.DIFFICULTY.ZOMBIE_BASE_HEALTH + (waveNumber * CONFIG.DIFFICULTY.ZOMBIE_HEALTH_PER_WAVE);
        const speed = calculateLimitedSpeed(
          CONFIG.DIFFICULTY.ZOMBIE_BASE_SPEED,
          CONFIG.DIFFICULTY.ZOMBIE_SPEED_PER_WAVE,
          waveNumber,
          CONFIG.DIFFICULTY.ZOMBIE_MAX_SPEED
        );
        return { id: baseId, x, y, health, maxHealth: health, speed, rotation: 0, scaleX: 1 };
      }
    };

    // Créer tous les zombies qui vont apparaître
    if (isBossWave) {
      audioFunctions.playBoss();
      newZombies.push(createZombie('boss'));

      // Zombies normaux
      for (let i = 0; i < Math.floor(waveNumber); i++) {
        newZombies.push(createZombie('normal', i + 1));
      }

      // Chogs si vague >= 5
      if (waveNumber >= CONFIG.DIFFICULTY.CHOG_START_WAVE) {
        for (let i = 0; i < Math.floor(waveNumber / 3); i++) {
          newZombies.push(createZombie('chog', i + 1000));
        }
      }
    } else {
      const zombieCount = CONFIG.DIFFICULTY.ZOMBIES_BASE_COUNT + (waveNumber * CONFIG.DIFFICULTY.ZOMBIES_COUNT_PER_WAVE);

      for (let i = 0; i < zombieCount; i++) {
        newZombies.push(createZombie('normal', i));
      }

      if (waveNumber >= CONFIG.DIFFICULTY.CHOG_START_WAVE) {
        const chogCount = CONFIG.DIFFICULTY.CHOGS_BASE_COUNT + ((waveNumber - CONFIG.DIFFICULTY.CHOG_START_WAVE) * CONFIG.DIFFICULTY.CHOGS_COUNT_PER_WAVE);
        for (let i = 0; i < chogCount; i++) {
          newZombies.push(createZombie('chog', i + 1000));
        }
      }
    }

    // Programmer l'apparition de chaque zombie avec un délai aléatoire
    newZombies.forEach((zombie, index) => {
      // Délai aléatoire entre MIN_DELAY et une portion de DURATION
      const maxDelayForThisZombie = CONFIG.SPAWN.DURATION * CONFIG.SPAWN.OVERLAP_FACTOR;
      const randomDelay = Math.random() * (maxDelayForThisZombie - CONFIG.SPAWN.MIN_DELAY) + CONFIG.SPAWN.MIN_DELAY;

      const timeout = setTimeout(() => {
        setZombies(prevZombies => [...prevZombies, zombie]);

        // Vérifier si c'est le dernier zombie à apparaître
        if (index === newZombies.length - 1) {
          setIsSpawning(false);
        }
      }, randomDelay);

      spawnTimeoutsRef.current.push(timeout);
    });

    // Nettoyer la liste des zombies existants pour commencer fresh
    setZombies([]);
    waveTransitionRef.current = false;
  }, [audioFunctions.playBoss]);

  const submitToLeaderboard = useCallback(async () => {
    if (!userData.monadUsername || !userData.crossAppWallet || !authenticated || isSubmittingToLeaderboard || submitMessage?.type === 'success') return;

    try {
      setSubmitMessage(null);
      await submitScore({
        username: userData.monadUsername,
        wallet_address: userData.crossAppWallet,
        waves_completed: wave - 1,
        enemies_killed: zombiesKilled,
        score: score
      });
      setSubmitMessage({ type: 'success', text: 'Score soumis avec succès au leaderboard !' });
    } catch (error) {
      console.error('Erreur lors de la soumission du score:', error);
      setSubmitMessage({ type: 'error', text: 'Erreur lors de la soumission du score.' });
    }
  }, [userData, authenticated, score, wave, zombiesKilled, submitScore, isSubmittingToLeaderboard, submitMessage?.type]);

  // Soumission automatique au leaderboard en cas de game over
  useEffect(() => {
    if (gameState === 'gameOver' && userData.monadUsername && userData.crossAppWallet && authenticated) {
      submitToLeaderboard();
      submitGameScore();
    }
  }, [gameState, userData.monadUsername, userData.crossAppWallet, authenticated, submitToLeaderboard]);

  const submitGameScore = useCallback(async () => {
    if (!playerAddress || !authenticated || isSubmittingScore) return;
    await submitScoreMonad(score, totalTransactions);
  }, [playerAddress, authenticated, score, totalTransactions, isSubmittingScore, submitScoreMonad]);

  // Fonction de démarrage optimisée
  const startGame = useCallback(() => {
    // Nettoyer les timeouts de spawn précédents
    spawnTimeoutsRef.current.forEach(timeout => clearTimeout(timeout));
    spawnTimeoutsRef.current = [];

    setGameState('playing');
    setPlayer({ x: CONFIG.GAME.WIDTH / 2, y: CONFIG.GAME.HEIGHT / 2, health: 100, maxHealth: 100 });
    setZombies([]);
    setBullets([]);
    setPlasmaExplosions([]);
    setRocketExplosions([]);
    setWeaponDrops([]);
    setPowerUpDrops([]);
    setWeaponBonus({ type: null, timeLeft: 0 });
    setShieldBonus({ active: false, timeLeft: 0 });
    setIsMouseDown(false);
    setLastShotTime(0);
    setWave(1);
    setScore(0);
    setZombiesKilled(0);
    setTotalTransactions(0);
    setSubmitMessage(null);
    setIsSpawning(false);
    waveTransitionRef.current = false;
    spawnZombies(1);
    bulletCounterRef.current = 0;
    lastCleanupRef.current = 0;
  }, [spawnZombies]);

  // Initialisation de la musique
  useEffect(() => {
    musicFunctions.init();
    return () => {
      musicRef.current?.pause();
      musicRef.current = null;
    };
  }, [musicFunctions]);

  useEffect(() => {
    return () => {
      // Nettoyer tous les timeouts quand le composant est démonté
      spawnTimeoutsRef.current.forEach(timeout => clearTimeout(timeout));
    };
  }, []);

  // Gestion de la musique selon l'état
  useEffect(() => {
    if ((gameState === 'playing' || gameState === 'waveTransition') && soundEnabled) {
      // Ne jouer que si la musique est en pause
      if (musicRef.current && musicRef.current.paused) {
        musicRef.current.play().catch(() => { });
      }
    } else if (gameState === 'menu' || gameState === 'gameOver') {
      musicRef.current?.pause();
    }
  }, [gameState, soundEnabled]);

  // Transitions de vague
  useEffect(() => {
    if (gameState === 'playing' && zombies.length === 0 && !waveTransitionRef.current && !isSpawning) {
      waveTransitionRef.current = true;
      setGameState('waveTransition');
    }
  }, [zombies.length, gameState, isSpawning]);

  useEffect(() => {
    if (gameState === 'waveTransition') {
      const timeout = setTimeout(() => {
        const nextWave = wave + 1;
        setWave(nextWave);
        setPlayer(prev => ({ ...prev, health: Math.min(prev.health + 30, prev.maxHealth) }));
        setGameState('playing');
        spawnZombies(nextWave);
        waveTransitionRef.current = false;

        if (BLOCKCHAIN_TX_ENABLED && authenticated && playerAddress) {
          click();
          setTotalTransactions(prev => prev + 1);
        }

      }, 2000);
      return () => clearTimeout(timeout);
    }
  }, [gameState, wave, spawnZombies, authenticated, playerAddress, click]);

  // Boucle de jeu principale optimisée
  useEffect(() => {
    if (gameState !== 'playing') return;

    const gameLoop = () => {
      const currentTime = Date.now();

      // Nettoyage périodique des balles
      if (currentTime - lastCleanupRef.current > CONFIG.BULLETS.CLEANUP_INTERVAL) {
        setBullets(cleanupBullets);
        lastCleanupRef.current = currentTime;
      }

      // Mouvement du joueur
      setPlayer(prev => {
        let newX = prev.x, newY = prev.y;
        const keys = keysRef.current;

        if (keys['KeyW'] || keys['ArrowUp']) newY -= CONFIG.GAME.PLAYER_SPEED;
        if (keys['KeyS'] || keys['ArrowDown']) newY += CONFIG.GAME.PLAYER_SPEED;
        if (keys['KeyA'] || keys['ArrowLeft']) newX -= CONFIG.GAME.PLAYER_SPEED;
        if (keys['KeyD'] || keys['ArrowRight']) newX += CONFIG.GAME.PLAYER_SPEED;

        return {
          ...prev,
          x: Math.max(CONFIG.GAME.PLAYER_SIZE, Math.min(CONFIG.GAME.WIDTH - CONFIG.GAME.PLAYER_SIZE, newX)),
          y: Math.max(CONFIG.GAME.PLAYER_SIZE, Math.min(CONFIG.GAME.HEIGHT - CONFIG.GAME.PLAYER_SIZE, newY))
        };
      });

      // Tir automatique
      if (isMouseDown && weaponBonus.type !== 'rocket') { // Désactiver le tir automatique pour rocket
        const fireRate = CONFIG.FIRE_RATES[weaponBonus.type || 'normal'];
        if (currentTime - lastShotTime >= fireRate) {
          fireBullet();
          setLastShotTime(currentTime);
        }
      }

      // Mouvement des balles avec nettoyage
      setBullets(prev => {
        const updatedBullets = prev.map(bullet => {
          const newBullet = {
            ...bullet,
            x: bullet.x + Math.cos(bullet.angle) * bullet.speed,
            y: bullet.y + Math.sin(bullet.angle) * bullet.speed
          };

          // Gestion de la traînée laser
          if (bullet.type === 'laser') {
            const trail = bullet.trail || [];
            trail.push({ x: bullet.x, y: bullet.y, opacity: 1 });
            newBullet.trail = trail.slice(-8).map((point, index) => ({
              ...point,
              opacity: (index + 1) / 8
            }));
          }

          return newBullet;
        });

        return cleanupBullets(updatedBullets);
      });

      // Mouvement des zombies
      setZombies(prev => prev.map(zombie => {
        const dx = player.x - zombie.x;
        const dy = player.y - zombie.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance > 0) {
          return {
            ...zombie,
            x: zombie.x + (dx / distance) * zombie.speed,
            y: zombie.y + (dy / distance) * zombie.speed,
            rotation: 0,
            scaleX: dx > 0 ? 1 : -1
          };
        }
        return zombie;
      }));

      // Gestion des timers de bonus
      setWeaponBonus(prev => {
        if (prev.type && prev.timeLeft > 0) {
          const newTimeLeft = prev.timeLeft - 16;
          return newTimeLeft <= 0 ? { type: null, timeLeft: 0 } : { ...prev, timeLeft: newTimeLeft };
        }
        return prev;
      });

      setShieldBonus(prev => {
        if (prev.active && prev.timeLeft > 0) {
          const newTimeLeft = prev.timeLeft - 16;
          return newTimeLeft <= 0 ? { active: false, timeLeft: 0 } : { ...prev, timeLeft: newTimeLeft };
        }
        return prev;
      });

      // Collisions joueur avec drops
      setWeaponDrops(prevDrops => prevDrops.filter(drop => {
        const distance = Math.sqrt((player.x - drop.x) ** 2 + (player.y - drop.y) ** 2);
        if (distance < 30) {
          const durations = { shotgun: 60000, laser: 45000, plasma: 50000, rocket: 40000 };
          setWeaponBonus({ type: drop.type as WeaponType, timeLeft: durations[drop.type as WeaponType] });
          return false;
        }
        return true;
      }));

      setPowerUpDrops(prevDrops => prevDrops.filter(drop => {
        const distance = Math.sqrt((player.x - drop.x) ** 2 + (player.y - drop.y) ** 2);
        if (distance < 30) {
          if (drop.type === 'health') {
            setPlayer(prev => ({ ...prev, health: prev.maxHealth }));
            audioFunctions.playHealth();
          } else if (drop.type === 'shield') {
            setShieldBonus({ active: true, timeLeft: CONFIG.DIFFICULTY.SHIELD_DURATION });
            audioFunctions.playShield();
          }
          return false;
        }
        return true;
      }));

      // Collisions balles-zombies
      setBullets(prevBullets => {
        const bulletsToRemove = new Set<number>();

        prevBullets.forEach(bullet => {
          if (bulletsToRemove.has(bullet.id)) return;

          zombies.forEach(zombie => {
            if (bulletsToRemove.has(bullet.id)) return;

            const distance = Math.sqrt((bullet.x - zombie.x) ** 2 + (bullet.y - zombie.y) ** 2);
            const hitRadius = zombie.isBoss ? CONFIG.GAME.BOSS_SIZE : CONFIG.GAME.ZOMBIE_SIZE;

            if (distance < hitRadius) {
              bulletsToRemove.add(bullet.id);

              if (bullet.type === 'plasma') {
                createExplosion(bullet.x, bullet.y, 'plasma');
                return;
              } else if (bullet.type === 'rocket') {
                createExplosion(bullet.x, bullet.y, 'rocket');
                return;
              }

              const zombieType = zombie.isBoss ? 'boss' : zombie.isChog ? 'chog' : 'normal';
              const damage = calculateDamage(bullet.type || 'normal', zombieType);

              setZombies(prevZombies =>
                prevZombies.map(z => {
                  if (z.id === zombie.id) {
                    const newHealth = z.health - damage;

                    if (newHealth <= 0) {
                      killZombie(z);
                      return null;
                    }
                    return { ...z, health: newHealth };
                  }
                  return z;
                }).filter(Boolean) as Zombie[]
              );
            }
          });
        });

        return cleanupBullets(prevBullets.filter(bullet => !bulletsToRemove.has(bullet.id)));
      });

      // Animation des explosions
      setPlasmaExplosions(prev =>
        prev.map(explosion => ({
          ...explosion,
          radius: Math.min(explosion.radius + 4, explosion.maxRadius),
          opacity: Math.max(explosion.opacity - 0.02, 0)
        })).filter(explosion => explosion.opacity > 0)
      );

      setRocketExplosions(prev =>
        prev.map(explosion => ({
          ...explosion,
          radius: Math.min(explosion.radius + 6, explosion.maxRadius),
          opacity: Math.max(explosion.opacity - 0.015, 0)
        })).filter(explosion => explosion.opacity > 0)
      );

      // Collisions zombies-joueur
      zombies.forEach(zombie => {
        const distance = Math.sqrt((player.x - zombie.x) ** 2 + (player.y - zombie.y) ** 2);
        const hitRadius = (zombie.isBoss ? CONFIG.GAME.BOSS_SIZE : CONFIG.GAME.ZOMBIE_SIZE) + CONFIG.GAME.PLAYER_SIZE;

        if (distance < hitRadius && !shieldBonus.active) {
          setPlayer(prev => {
            let damage: number = CONFIG.DIFFICULTY.ZOMBIE_DAMAGE;

            if (zombie.isBoss && zombie.bossType) {
              const bossConfig = CONFIG.BOSS_TYPES[zombie.bossType];
              damage = Math.floor(CONFIG.DIFFICULTY.BOSS_DAMAGE * bossConfig.damageMultiplier);
            } else if (zombie.isChog) {
              damage = CONFIG.DIFFICULTY.CHOG_DAMAGE;
            }

            const newHealth = prev.health - damage;
            if (newHealth <= 0) setGameState('gameOver');
            return { ...prev, health: newHealth };
          });
        }
      });

      animationRef.current = requestAnimationFrame(gameLoop);
    };

    animationRef.current = requestAnimationFrame(gameLoop);
    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [gameState, player, zombies, isMouseDown, lastShotTime, weaponBonus.type, shieldBonus.active, fireBullet, cleanupBullets, audioFunctions, createExplosion, calculateDamage, killZombie]);

  // Composants de rendu optimisés
  const renderPlayer = useMemo(() => (
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
      <img src="/img/player.png" alt="player" className="w-full h-full object-contain" draggable={false} />
      {shieldBonus.active && (
        <div
          className="absolute inset-0 rounded-full border-4 animate-pulse"
          style={{
            borderColor: 'rgba(0, 255, 255, 0.8)',
            boxShadow: '0 0 20px rgba(0, 255, 255, 0.6), inset 0 0 20px rgba(0, 255, 255, 0.3)',
            background: 'radial-gradient(circle, transparent 60%, rgba(0, 255, 255, 0.1) 100%)',
            animation: 'flicker 0.3s infinite alternate'
          }}
        />
      )}
    </div>
  ), [player.x, player.y, playerRotation, shieldBonus.active]);

  const renderHealthBar = useMemo(() => (
    <div
      className="absolute select-none pointer-events-none"
      style={{ left: player.x - 40, top: player.y - 50, width: 80, height: 20 }}
    >
      <div className="absolute top-2 w-16 h-2 bg-gray-800 border border-gray-600 rounded-full overflow-hidden">
        <div
          className={`h-full transition-all duration-300 ${(player.health / player.maxHealth) > 0.75 ? 'bg-green-500' :
            (player.health / player.maxHealth) > 0.25 ? 'bg-yellow-400' : 'bg-red-500'
            }`}
          style={{ width: `${(player.health / player.maxHealth) * 100}%` }}
        />
      </div>
    </div>
  ), [player.x, player.y, player.health, player.maxHealth]);

  const renderBullet = useCallback((bullet: Bullet) => {
    if (bullet.type === 'laser') {
      return (
        <div key={bullet.id}>
          {bullet.trail?.map((trailPoint, index) => (
            <div
              key={`${bullet.id}-trail-${index}`}
              className="absolute rounded-full select-none pointer-events-none"
              style={{
                left: trailPoint.x - 3,
                top: trailPoint.y - 3,
                width: 6,
                height: 6,
                background: `radial-gradient(circle, rgba(0, 150, 255, ${trailPoint.opacity}) 0%, rgba(0, 100, 200, ${trailPoint.opacity * 0.7}) 50%, transparent 100%)`,
                boxShadow: `0 0 ${6 * trailPoint.opacity}px rgba(0, 150, 255, ${trailPoint.opacity})`,
                animation: `laserTrail ${200 + index * 50}ms ease-out forwards`
              }}
            />
          ))}
          <div
            className="absolute rounded-full select-none pointer-events-none"
            style={{
              left: bullet.x - 4,
              top: bullet.y - 4,
              width: 8,
              height: 8,
              background: 'radial-gradient(circle, rgba(255, 255, 255, 1) 0%, rgba(0, 150, 255, 1) 30%, rgba(0, 100, 200, 0.8) 70%, transparent 100%)',
              boxShadow: '0 0 12px rgba(0, 150, 255, 0.8), 0 0 24px rgba(0, 150, 255, 0.4)',
              filter: 'brightness(1.2)'
            }}
          />
        </div>
      );
    } else if (bullet.type === 'plasma') {
      return (
        <div
          key={bullet.id}
          className="absolute rounded-full select-none pointer-events-none"
          style={{
            left: bullet.x - 6,
            top: bullet.y - 6,
            width: 12,
            height: 12,
            background: 'radial-gradient(circle, rgba(255, 255, 255, 1) 0%, rgba(255, 0, 255, 1) 20%, rgba(128, 0, 255, 0.9) 50%, rgba(64, 0, 128, 0.6) 80%, transparent 100%)',
            boxShadow: '0 0 16px rgba(255, 0, 255, 0.8), 0 0 32px rgba(128, 0, 255, 0.4)',
            filter: 'brightness(1.3)',
            animation: 'flicker 0.2s infinite alternate'
          }}
        />
      );
    } else if (bullet.type === 'rocket') {
      return (
        <div
          key={bullet.id}
          className="absolute select-none pointer-events-none"
          style={{
            left: bullet.x - 8,
            top: bullet.y - 8,
            width: 16,
            height: 16,
            transform: `rotate(${(bullet.angle * 180 / Math.PI)}deg)`,
            transformOrigin: 'center center'
          }}
        >
          <div
            className="w-full h-full"
            style={{
              background: 'linear-gradient(45deg, rgba(255, 0, 0, 1) 0%, rgba(255, 100, 0, 1) 30%, rgba(200, 0, 0, 1) 70%, rgba(150, 0, 0, 1) 100%)',
              borderRadius: '50% 0 50% 0',
              boxShadow: '0 0 8px rgba(255, 0, 0, 0.6)',
              filter: 'brightness(1.2)'
            }}
          />
          <div
            className="absolute"
            style={{
              left: -6,
              top: '50%',
              transform: 'translateY(-50%)',
              width: 6,
              height: 8,
              background: 'linear-gradient(90deg, rgba(255, 255, 0, 0.9) 0%, rgba(255, 100, 0, 0.7) 50%, transparent 100%)',
              borderRadius: '0 50% 50% 0',
              animation: 'flicker 0.1s infinite alternate'
            }}
          />
        </div>
      );
    } else {
      return (
        <div
          key={bullet.id}
          className="absolute w-1 h-1 bg-yellow-400 rounded-full select-none pointer-events-none"
          style={{
            left: bullet.x - CONFIG.GAME.BULLET_SIZE / 2,
            top: bullet.y - CONFIG.GAME.BULLET_SIZE / 2
          }}
        />
      );
    }
  }, []);

  return (
    <div className="flex flex-col items-center space-y-4">

      <div className="flex items-center space-x-6 p-2">
        <span className="text-white font-bold">Score: {score}</span>
        <span className="text-white font-bold">Wave: {wave}</span>
        <span className="text-white font-bold">Kills: {zombiesKilled}</span>
        <span className="text-white font-bold">Waves TX: {totalTransactions}</span>

        <div className={`flex items-center space-x-1 px-2 py-1 rounded text-xs font-bold ${BLOCKCHAIN_TX_ENABLED ? 'bg-green-600 text-white' : 'bg-gray-600 text-gray-300'
          }`}>
          <span>{BLOCKCHAIN_TX_ENABLED ? 'CHAIN ON' : 'CHAIN OFF'}</span>
        </div>

        {weaponBonus.type && (
          <div className={`flex items-center space-x-2 px-3 py-2 rounded-lg ${weaponBonus.type === 'shotgun' ? 'bg-orange-600' :
            weaponBonus.type === 'laser' ? 'bg-blue-600' :
              weaponBonus.type === 'plasma' ? 'bg-purple-600' : 'bg-red-600'
            }`}>
            <span className="text-sm">
              {weaponBonus.type === 'shotgun' ? '🔫' : weaponBonus.type === 'laser' ? '⚡' : weaponBonus.type === 'plasma' ? '💫' : '🚀'}
            </span>
            <span className="text-white font-bold text-sm">
              {weaponBonus.type.toUpperCase()}: {Math.ceil(weaponBonus.timeLeft / 1000)}s
            </span>
          </div>
        )}

        {shieldBonus.active && (
          <div className="flex items-center space-x-2 px-3 py-2 rounded-lg bg-cyan-600">
            <span className="text-sm">🛡️</span>
            <span className="text-white font-bold text-sm">SHIELD: {Math.ceil(shieldBonus.timeLeft / 1000)}s</span>
          </div>
        )}

        <button
          onClick={musicFunctions.toggle}
          className={`flex items-center space-x-1 px-3 py-2 rounded-lg transition-colors duration-200 ${soundEnabled ? 'bg-green-600 hover:bg-green-700 text-white' : 'bg-gray-600 hover:bg-gray-700 text-gray-300'
            }`}
          title={soundEnabled ? 'Cut sound' : 'Active sound'}
        >
          <span className="text-sm">{soundEnabled ? '🎵' : '🔇'}</span>
          <span className="text-xs">{soundEnabled ? 'ON' : 'OFF'}</span>
        </button>
      </div>

      {/* Zone de jeu */}
      <div
        ref={gameRef}
        className="relative bg-gray-800 border-2 border-gray-600 cursor-crosshair select-none"
        style={{
          width: CONFIG.GAME.WIDTH,
          height: CONFIG.GAME.HEIGHT,
          backgroundImage: 'url("/img/background.jpg")',
          backgroundSize: 'cover',
          backgroundPosition: 'center'
        }}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onMouseMove={handleMouseMove}
      >
        {/* Écrans d'état */}
        {gameState === 'menu' && (
          <div className="absolute inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50">
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
          <div className="absolute inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50">
            <div className="text-center space-y-4">
              <h2 className="text-3xl font-gaming font-bold text-green-400">WAVE {wave} FINISHED !</h2>
              <p className="text-white text-xl">
                {(wave + 1) % CONFIG.DIFFICULTY.BOSS_WAVE_INTERVAL === 0
                  ? `⚠️ BOSS INCOMING - Wave ${wave + 1} ⚠️`
                  : `Wave incoming ${wave + 1}...`}
              </p>
              {(wave + 1) % CONFIG.DIFFICULTY.BOSS_WAVE_INTERVAL === 0 && (
                <p className="text-yellow-300 text-lg animate-pulse">
                  Random Boss Challenge!
                </p>
              )}
              <div className="animate-spin w-8 h-8 border-4 border-green-400 border-t-transparent rounded-full mx-auto"></div>
            </div>
          </div>
        )}

        {gameState === 'gameOver' && (
          <div className="absolute inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50">
            <div className="text-center space-y-4 max-w-md">
              <h2 className="text-4xl font-gaming font-bold text-red-500">GAME OVER</h2>
              <p className="text-white text-xl">Final score: {score}</p>
              <p className="text-white">Kills: {zombiesKilled}</p>
              <p className="text-white">Transactions: {totalTransactions}</p>
              <p className="text-white">Waves finished: {wave - 1}</p>



              <div className="flex flex-col space-y-3">
                
                <button
                  onClick={shareOnTwitter}
                  className="px-16 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 font-semibold transition-all duration-200 text-xl"
                >
                  Flex score On Twitter
                </button>

                <button
                  onClick={startGame}
                  className="px-16 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 font-semibold transition-all duration-200 text-xl"
                >
                  Replay
                </button>

              </div>
            </div>
          </div>
        )}

        {/* Éléments de jeu */}
        {(gameState === 'playing' || gameState === 'waveTransition') && (
          <>
            {renderPlayer}
            {renderHealthBar}

            {/* Zombies */}
            {zombies
              .filter(zombie => {
                const margin = zombie.isBoss ? 50 : 25;
                return zombie.x >= margin && zombie.x <= CONFIG.GAME.WIDTH - margin &&
                  zombie.y >= margin && zombie.y <= CONFIG.GAME.HEIGHT - margin;
              })
              .map(zombie => {
                const size = zombie.isBoss ? 100 : 50;
                const halfSize = size / 2;

                // Obtenir les informations du boss si c'est un boss
                const bossConfig = zombie.isBoss && zombie.bossType ? CONFIG.BOSS_TYPES[zombie.bossType] : null;

                // Pour l'instant, utiliser l'image originale pour tous les boss
                // Vous pourrez changer ces chemins quand vous aurez les nouvelles images
                let imageSrc;
                if (zombie.isBoss) {
                  switch (zombie.bossType) {
                    case 'titan':
                      imageSrc = "/img/boss3.gif"; // Changez vers "/img/boss2.gif" quand disponible
                      break;
                    case 'nightmare':
                      imageSrc = "/img/boss3.gif"; // Changez vers "/img/boss3.gif" quand disponible
                      break;
                    case 'overlord':
                      imageSrc = "/img/boss3.gif"; // Changez vers "/img/boss4.gif" quand disponible
                      break;
                    default: // destroyer
                      imageSrc = "/img/boss.gif";
                  }
                } else {
                  imageSrc = zombie.isChog ? "/img/chog.gif" : "/img/molandakz.gif";
                }

                const healthBarColor = zombie.isBoss && bossConfig ? bossConfig.color :
                  zombie.isChog ? 'bg-orange-500' : 'bg-red-500';

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
                      src={imageSrc}
                      alt={zombie.isBoss ? `boss-${zombie.bossType}` : zombie.isChog ? "chog" : "zombie"}
                      className="w-full h-full object-cover rounded-full select-none pointer-events-none"
                      draggable={false}
                    />
                    <div className={`absolute -top-1 left-1/2 transform -translate-x-1/2 h-1 bg-gray-600 rounded-full ${zombie.isBoss ? 'w-20' : 'w-12'}`}>
                      <div
                        className={`h-full rounded-full transition-all duration-200 ${healthBarColor}`}
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
                style={{ left: drop.x - 15, top: drop.y - 15, width: 30, height: 30 }}
              >
                <div className={`w-full h-full rounded-lg border-2 flex items-center justify-center shadow-lg ${drop.type === 'shotgun' ? 'bg-orange-500 border-orange-300' :
                  drop.type === 'laser' ? 'bg-blue-500 border-blue-300' :
                    drop.type === 'plasma' ? 'bg-purple-500 border-purple-300' : 'bg-red-500 border-red-300'
                  }`}>
                  <span className="text-white font-bold text-xs">
                    {drop.type === 'shotgun' ? '🔫' : drop.type === 'laser' ? '⚡' : drop.type === 'plasma' ? '💫' : '🚀'}
                  </span>
                </div>
              </div>
            ))}

            {/* Power-Up Drops */}
            {powerUpDrops.map(drop => (
              <div
                key={drop.id}
                className="absolute animate-bounce"
                style={{ left: drop.x - 15, top: drop.y - 15, width: 30, height: 30 }}
              >
                <div className={`w-full h-full rounded-full border-3 flex items-center justify-center shadow-lg ${drop.type === 'health' ? 'bg-green-500 border-green-300' : 'bg-cyan-500 border-cyan-300'
                  }`}>
                  <span className="text-white font-bold text-sm">
                    {drop.type === 'health' ? '💊' : '🛡️'}
                  </span>
                </div>
              </div>
            ))}

            {/* Balles */}
            {bullets.map(renderBullet)}

            {/* Explosions plasma */}
            {plasmaExplosions.map(explosion => (
              <div
                key={explosion.id}
                className="absolute rounded-full select-none pointer-events-none"
                style={{
                  left: explosion.x - explosion.radius,
                  top: explosion.y - explosion.radius,
                  width: explosion.radius * 2,
                  height: explosion.radius * 2,
                  background: `radial-gradient(circle, rgba(255, 255, 255, ${explosion.opacity * 0.8}) 0%, rgba(255, 0, 255, ${explosion.opacity * 0.6}) 20%, rgba(128, 0, 255, ${explosion.opacity * 0.4}) 50%, rgba(64, 0, 128, ${explosion.opacity * 0.2}) 80%, transparent 100%)`,
                  boxShadow: `0 0 ${explosion.radius}px rgba(255, 0, 255, ${explosion.opacity * 0.6})`,
                  filter: 'brightness(1.5)',
                  animation: 'flicker 0.1s infinite alternate'
                }}
              />
            ))}

            {/* Explosions de roquettes */}
            {rocketExplosions.map(explosion => (
              <div key={explosion.id}>
                <div
                  className="absolute rounded-full select-none pointer-events-none"
                  style={{
                    left: explosion.x - explosion.radius,
                    top: explosion.y - explosion.radius,
                    width: explosion.radius * 2,
                    height: explosion.radius * 2,
                    background: `radial-gradient(circle, rgba(255, 255, 255, ${explosion.opacity * 0.9}) 0%, rgba(255, 150, 0, ${explosion.opacity * 0.8}) 15%, rgba(255, 0, 0, ${explosion.opacity * 0.6}) 35%, rgba(200, 0, 0, ${explosion.opacity * 0.4}) 60%, rgba(100, 0, 0, ${explosion.opacity * 0.2}) 80%, transparent 100%)`,
                    boxShadow: `0 0 ${explosion.radius * 1.5}px rgba(255, 100, 0, ${explosion.opacity * 0.8})`,
                    filter: 'brightness(1.5)',
                    animation: 'flicker 0.08s infinite alternate'
                  }}
                />
                <div
                  className="absolute rounded-full border-4 select-none pointer-events-none"
                  style={{
                    left: explosion.x - explosion.radius * 1.2,
                    top: explosion.y - explosion.radius * 1.2,
                    width: explosion.radius * 2.4,
                    height: explosion.radius * 2.4,
                    borderColor: `rgba(255, 200, 0, ${explosion.opacity * 0.3})`,
                    borderStyle: 'solid',
                    background: 'transparent'
                  }}
                />
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}