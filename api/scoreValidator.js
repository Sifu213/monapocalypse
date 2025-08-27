// api/scoreValidator.js - Validation des scores basée sur la logique du jeu

// Configuration du jeu (copiée du frontend)
const CONFIG = {
  DIFFICULTY: {
    ZOMBIE_BASE_HEALTH: 250,
    ZOMBIE_HEALTH_PER_WAVE: 5,
    ZOMBIE_BASE_SPEED: 0.8,
    ZOMBIE_SPEED_PER_WAVE: 0.03,
    ZOMBIE_MAX_SPEED: 3.5,
    ZOMBIE_DAMAGE: 1,
    CHOG_BASE_HEALTH: 150,
    CHOG_HEALTH_PER_WAVE: 5,
    CHOG_BASE_SPEED: 1.2,
    CHOG_SPEED_PER_WAVE: 0.03,
    CHOG_MAX_SPEED: 3.8,
    CHOG_DAMAGE: 2,
    CHOG_START_WAVE: 3,
    BOSS_BASE_HEALTH: 2000,
    BOSS_HEALTH_PER_WAVE: 500,
    BOSS_BASE_SPEED: 0.5,
    BOSS_SPEED_PER_WAVE: 0.05,
    BOSS_MAX_SPEED: 3.2,
    BOSS_DAMAGE: 3,
    BOSS_WAVE_INTERVAL: 5,
    ZOMBIES_BASE_COUNT: 5,
    ZOMBIES_COUNT_PER_WAVE: 1,
    CHOGS_BASE_COUNT: 2,
    CHOGS_COUNT_PER_WAVE: 1,
  }
};

/**
 * Calcule le nombre total d'ennemis pour une vague donnée
 */
const calculateEnemiesForWave = (waveNumber) => {
  const isBossWave = waveNumber % CONFIG.DIFFICULTY.BOSS_WAVE_INTERVAL === 0;
  let totalEnemies = 0;

  if (isBossWave) {
    // Boss wave
    totalEnemies += 1; // Boss
    
    // Zombies normaux dans les vagues de boss
    totalEnemies += Math.floor(waveNumber);
    
    // Chogs si vague >= 3
    if (waveNumber >= CONFIG.DIFFICULTY.CHOG_START_WAVE) {
      totalEnemies += Math.floor(waveNumber / 3);
    }
  } else {
    // Vague normale
    const zombieCount = CONFIG.DIFFICULTY.ZOMBIES_BASE_COUNT + (waveNumber * CONFIG.DIFFICULTY.ZOMBIES_COUNT_PER_WAVE);
    totalEnemies += zombieCount;
    
    // Chogs si vague >= 3
    if (waveNumber >= CONFIG.DIFFICULTY.CHOG_START_WAVE) {
      const chogCount = CONFIG.DIFFICULTY.CHOGS_BASE_COUNT + ((waveNumber - CONFIG.DIFFICULTY.CHOG_START_WAVE) * CONFIG.DIFFICULTY.CHOGS_COUNT_PER_WAVE);
      totalEnemies += chogCount;
    }
  }

  return totalEnemies;
};

/**
 * Calcule le nombre maximum d'ennemis possibles pour un nombre de vagues données
 * CORRECTION : Inclut la vague en cours (vague suivante) où le joueur est mort
 */
const calculateMaxEnemiesForWaves = (wavesCompleted) => {
  let totalEnemies = 0;
  
  // Compter les ennemis des vagues complétées
  for (let wave = 1; wave <= wavesCompleted; wave++) {
    totalEnemies += calculateEnemiesForWave(wave);
  }
  
  // NOUVEAU : Ajouter les ennemis de la vague en cours (où le joueur est mort)
  const currentWave = wavesCompleted + 1;
  totalEnemies += calculateEnemiesForWave(currentWave);
  
  return totalEnemies;
};

/**
 * Calcule le score maximum théorique pour des vagues et kills donnés
 */
const calculateMaxScoreForWavesAndKills = (wavesCompleted, enemiesKilled) => {
  // Points par type d'ennemi (du code frontend)
  const ZOMBIE_POINTS = 10;
  const CHOG_POINTS = 15;
  const BOSS_POINTS = 100;

  // Pour être généreux dans la validation, on suppose le meilleur cas :
  // On calcule combien de boss maximum il peut y avoir (vagues complétées + vague en cours)
  const totalWaves = wavesCompleted + 1; // Inclure la vague en cours
  const maxBossWaves = Math.floor(totalWaves / CONFIG.DIFFICULTY.BOSS_WAVE_INTERVAL);
  const maxBosses = maxBossWaves;
  
  // Le reste des kills, on suppose que c'est du meilleur ratio (chogs > zombies)
  let remainingKills = Math.max(0, enemiesKilled - maxBosses);
  
  // Calculer le nombre de chogs maximum possibles (incluant vague en cours)
  let maxChogs = 0;
  for (let wave = CONFIG.DIFFICULTY.CHOG_START_WAVE; wave <= totalWaves; wave++) {
    const isBossWave = wave % CONFIG.DIFFICULTY.BOSS_WAVE_INTERVAL === 0;
    
    if (isBossWave) {
      maxChogs += Math.floor(wave / 3);
    } else if (wave >= CONFIG.DIFFICULTY.CHOG_START_WAVE) {
      const chogCount = CONFIG.DIFFICULTY.CHOGS_BASE_COUNT + ((wave - CONFIG.DIFFICULTY.CHOG_START_WAVE) * CONFIG.DIFFICULTY.CHOGS_COUNT_PER_WAVE);
      maxChogs += chogCount;
    }
  }

  // Distribution optimiste des kills
  const actualChogs = Math.min(remainingKills, maxChogs);
  const actualZombies = Math.max(0, remainingKills - actualChogs);
  const actualBosses = Math.min(enemiesKilled, maxBosses);

  const maxScore = (actualZombies * ZOMBIE_POINTS) + 
                   (actualChogs * CHOG_POINTS) + 
                   (actualBosses * BOSS_POINTS);

  return maxScore;
};

/**
 * Valide un score soumis
 */
const validateScore = (submission) => {
  const { username, wallet_address, waves_completed, enemies_killed, score } = submission;
  
  const validationErrors = [];
  
  // Validations de base
  if (!username || username.length < 1 || username.length > 50) {
    validationErrors.push('Username invalide');
  }
  
  if (!wallet_address || !/^0x[a-fA-F0-9]{40}$/.test(wallet_address)) {
    validationErrors.push('Adresse wallet invalide');
  }
  
  if (typeof waves_completed !== 'number' || waves_completed < 0 || waves_completed > 1000) {
    validationErrors.push('Nombre de vagues invalide');
  }
  
  if (typeof enemies_killed !== 'number' || enemies_killed < 0 || enemies_killed > 500000) {
    validationErrors.push('Nombre d\'ennemis tués invalide');
  }
  
  if (typeof score !== 'number' || score < 0 || score > 10000000) {
    validationErrors.push('Score invalide');
  }

  // Validation de cohérence : vagues vs kills (avec marge généreuse)
  if (waves_completed >= 0) {
    const maxPossibleEnemies = calculateMaxEnemiesForWaves(waves_completed);
    
    // Marge plus généreuse de 20% pour éviter les faux positifs
    if (enemies_killed > maxPossibleEnemies * 1.2) {
      validationErrors.push(`Nombre d'ennemis tués trop élevé pour ${waves_completed} vagues (max théorique avec marge: ${Math.floor(maxPossibleEnemies * 1.2)})`);
    }
  }

  // Validation de cohérence : score vs vagues/kills (avec marge généreuse)
  if (waves_completed >= 0 && enemies_killed > 0) {
    const maxPossibleScore = calculateMaxScoreForWavesAndKills(waves_completed, enemies_killed);
    
    // Marge plus généreuse de 20% pour éviter les faux positifs
    if (score > maxPossibleScore * 1.2) {
      validationErrors.push(`Score trop élevé pour ${waves_completed} vagues et ${enemies_killed} kills (max théorique avec marge: ${Math.floor(maxPossibleScore * 1.2)})`);
    }
  }

  // Validation de ratio minimum : au moins 1 point par kill
  if (enemies_killed > 0 && score < enemies_killed) {
    validationErrors.push('Score trop faible par rapport aux kills (minimum 1 point par kill)');
  }

  // Validation de cohérence : si 0 vague, alors 0 kill et 0 score
  if (waves_completed === 0) {
    if (enemies_killed > 0) {
      validationErrors.push('Impossible d\'avoir des kills sans vagues complétées');
    }
    if (score > 0) {
      validationErrors.push('Impossible d\'avoir un score sans vagues complétées');
    }
  }

  // Validation pour détecter des valeurs suspicieuses
  if (waves_completed > 100) {
    validationErrors.push('Nombre de vagues suspicieusement élevé');
  }

  if (enemies_killed > 0 && waves_completed > 0) {
    const avgKillsPerWave = enemies_killed / (waves_completed + 1); // +1 pour la vague en cours
    if (avgKillsPerWave > 100) { // Plus réaliste
      validationErrors.push('Ratio kills/vague suspicieusement élevé');
    }
  }

  return {
    isValid: validationErrors.length === 0,
    errors: validationErrors,
    details: {
      maxPossibleEnemies: calculateMaxEnemiesForWaves(waves_completed),
      maxPossibleScore: waves_completed >= 0 && enemies_killed > 0 ? calculateMaxScoreForWavesAndKills(waves_completed, enemies_killed) : 0,
      avgKillsPerWave: waves_completed >= 0 ? (enemies_killed / (waves_completed + 1)).toFixed(2) : 0,
      scorePerKill: enemies_killed > 0 ? (score / enemies_killed).toFixed(2) : 0,
      wavesIncludingCurrent: waves_completed + 1
    }
  };
};

/**
 * Fonction utilitaire pour logger les détails de validation
 */
const logValidation = (submission, validationResult) => {
  console.log('🔍 SCORE VALIDATION');
  console.log('📊 Submission:', {
    username: submission.username,
    waves: submission.waves_completed,
    kills: submission.enemies_killed,
    score: submission.score
  });
  console.log('✅ Validation:', validationResult.isValid ? 'PASSED' : 'FAILED');
  
  if (!validationResult.isValid) {
    console.log('❌ Errors:', validationResult.errors);
  }
  
  console.log('📈 Details:', validationResult.details);
  console.log('---');
};

export { validateScore, logValidation, calculateMaxEnemiesForWaves, calculateMaxScoreForWavesAndKills };