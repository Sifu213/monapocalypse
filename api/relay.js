// api/relay.js - Vercel Serverless Function avec validation de score
import { createWalletClient, getContract, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { validateScore, logValidation } from './scoreValidator.js';

// Adresses des contrats
const SIFU_CLICK_CONTRACT_ADDRESS = "0x86282eefde3e840fb660f04a4a5d4be85a4a8f79";
const MONAD_CONTRACT_ADDRESS = "0xceCBFF203C8B6044F52CE23D914A1bfD997541A4";

// ABI du contrat SifuClick
const SIFU_CLICK_CONTRACT_ABI = [
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "playerAddress",
        "type": "address"
      }
    ],
    "name": "click",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  }
];

// ABI du contrat Monad
const MONAD_CONTRACT_ABI = [
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "player",
        "type": "address"
      },
      {
        "internalType": "uint256",
        "name": "scoreAmount",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "transactionAmount",
        "type": "uint256"
      }
    ],
    "name": "updatePlayerData",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  }
];

// Queue globale pour éviter les conflits de nonce
let transactionQueue = [];
let isProcessing = false;
let currentNonce = null;

// Cache pour les validations récentes (anti-spam)
const recentValidations = new Map();
const VALIDATION_CACHE_TTL = 60000; // 1 minute

class RelayerService {
  constructor() {
    this.RELAYER_PRIVATE_KEY = process.env.RELAYER_PK;
    this.RPC_URL = process.env.MONAD_RPC_URL || "https://testnet-rpc.monad.xyz";
    this.CHAIN_ID = Number(process.env.MONAD_CHAIN_ID || 10143);
    
    if (!this.RELAYER_PRIVATE_KEY) {
      throw new Error("RELAYER_PK manquante dans les variables d'environnement");
    }

    console.log(`🔗 Configuration relayer:`);
    console.log(`  - RPC URL: ${this.RPC_URL}`);
    console.log(`  - Chain ID: ${this.CHAIN_ID}`);
    console.log(`  - Sifu Contract: ${SIFU_CLICK_CONTRACT_ADDRESS}`);
    console.log(`  - Monad Contract: ${MONAD_CONTRACT_ADDRESS}`);
  }

  // Validation du score avant soumission au contrat
  validateScoreSubmission(playerAddress, score, waves_completed, enemies_killed, transactions) {
    console.log('\n🔍 VALIDATION SCORE POUR CONTRAT WEB3');
    
    // Vérification anti-spam
    const cacheKey = `${playerAddress}_${score}`;
    const now = Date.now();
    
    if (recentValidations.has(cacheKey)) {
      const lastValidation = recentValidations.get(cacheKey);
      if (now - lastValidation < VALIDATION_CACHE_TTL) {
        throw new Error(`Rate limit: Validation récente détectée pour ce score (${Math.ceil((VALIDATION_CACHE_TTL - (now - lastValidation)) / 1000)}s restantes)`);
      }
    }

    // Si toutes les données de jeu sont disponibles, faire une validation complète
    if (waves_completed !== undefined && enemies_killed !== undefined) {
      console.log('📊 Validation complète avec données de jeu');
      
      const submission = {
        username: 'web3_player', // Placeholder pour la validation
        wallet_address: playerAddress,
        waves_completed,
        enemies_killed,
        score
      };

      const validationResult = validateScore(submission);
      logValidation(submission, validationResult);

      if (!validationResult.isValid) {
        console.log('❌ Validation complète échouée');
        throw new Error(`Score validation failed: ${validationResult.errors.join(', ')}`);
      }

      console.log('✅ Validation complète réussie');
      
    } else {
      // Validation partielle si données incomplètes
      console.log('⚠️ Validation partielle (données incomplètes)');
      
      // Validations basiques
      if (typeof score !== 'number' || score < 0 || score > 10000000) {
        throw new Error('Score invalide (doit être entre 0 et 10,000,000)');
      }

      if (typeof transactions !== 'number' || transactions < 0 || transactions > 1000) {
        throw new Error('Nombre de transactions invalide');
      }

      // Validation de cohérence score/transactions
      if (transactions > 0) {
        const scorePerTransaction = score / transactions;
        if (scorePerTransaction > 50000) {
          throw new Error('Ratio score/transaction suspicieusement élevé');
        }
      }

      console.log('✅ Validation partielle réussie');
    }

    // Mettre en cache la validation
    recentValidations.set(cacheKey, now);
    
    // Nettoyer le cache périodiquement
    if (recentValidations.size > 1000) {
      const cutoff = now - VALIDATION_CACHE_TTL;
      for (const [key, timestamp] of recentValidations.entries()) {
        if (timestamp < cutoff) {
          recentValidations.delete(key);
        }
      }
    }
  }

  async getWalletClient() {
    const account = privateKeyToAccount(
      this.RELAYER_PRIVATE_KEY.startsWith("0x") 
        ? this.RELAYER_PRIVATE_KEY 
        : `0x${this.RELAYER_PRIVATE_KEY}`
    );

    console.log(`🔑 Wallet Address: ${account.address}`);

    const walletClient = createWalletClient({
      account,
      chain: { id: this.CHAIN_ID },
      transport: http(this.RPC_URL),
    });

    // Vérifier la connexion et le balance
    try {
      const balance = await walletClient.request({
        method: "eth_getBalance",
        params: [account.address, "latest"],
      });
      const balanceInEth = Number(balance) / 1e18;
      console.log(`💰 Balance du relayer: ${balanceInEth.toFixed(6)} ETH`);

      if (balanceInEth < 0.001) {
        console.warn(`⚠️ ATTENTION: Balance faible (${balanceInEth.toFixed(6)} ETH)`);
      }
    } catch (error) {
      console.error(`❌ Erreur lors de la vérification du balance:`, error.message);
    }

    return walletClient;
  }

  async processTransactionWithQueue(playerAddress, action, score, waves_completed, enemies_killed, transactions) {
    return new Promise((resolve, reject) => {
      // Ajouter à la queue
      transactionQueue.push({
        playerAddress,
        action,
        score,
        waves_completed,
        enemies_killed,
        transactions,
        resolve,
        reject
      });

      // Démarrer le traitement si pas déjà en cours
      this.processQueue();
    });
  }

  async processQueue() {
    if (isProcessing || transactionQueue.length === 0) return;
    
    isProcessing = true;
    console.log(`📦 Processing queue (${transactionQueue.length} transactions)`);

    while (transactionQueue.length > 0) {
      const item = transactionQueue.shift();
      
      try {
        const txHash = await this.processTransaction(
          item.playerAddress,
          item.action,
          item.score,
          item.waves_completed,
          item.enemies_killed,
          item.transactions
        );
        item.resolve(txHash);
        
        // Petite pause entre les transactions pour éviter les conflits
        await new Promise(resolve => setTimeout(resolve, 100));
        
      } catch (error) {
        console.error(`❌ Erreur transaction pour ${item.action}:`, error);
        item.reject(error);
      }
    }

    isProcessing = false;
  }

  async getNonce(walletClient) {
    if (currentNonce === null) {
      const nonceHex = await walletClient.request({
        method: "eth_getTransactionCount",
        params: [walletClient.account.address, "pending"],
      });
      currentNonce = parseInt(String(nonceHex), 16);
      console.log(`🎯 Nonce initial: ${currentNonce}`);
    }
    
    const nonce = currentNonce;
    currentNonce++; // Incrémenter pour la prochaine transaction
    return nonce;
  }

  async waitForTransactionReceipt(walletClient, txHash, timeout = 30000) {
    console.log(`⏳ Attente du receipt pour ${txHash}...`);
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      try {
        const receipt = await walletClient.request({
          method: "eth_getTransactionReceipt",
          params: [txHash],
        });

        if (receipt) {
          console.log(`📄 Receipt reçu pour ${txHash}:`);
          console.log(`  - Status: ${receipt.status} (${receipt.status === '0x1' ? 'SUCCESS' : 'FAILED'})`);
          console.log(`  - Block: ${receipt.blockNumber}`);
          console.log(`  - Gas Used: ${parseInt(receipt.gasUsed, 16)}`);
          
          if (receipt.status === '0x0') {
            console.error(`❌ TRANSACTION FAILED - Hash: ${txHash}`);
          }

          return receipt;
        }
      } catch (error) {
        // Transaction pas encore minée, continuer à attendre
      }

      // Attendre 1 seconde avant de réessayer
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    console.warn(`⏰ Timeout atteint pour ${txHash} après ${timeout}ms`);
    return null;
  }

  async processTransaction(playerAddress, action, score, waves_completed, enemies_killed, transactions) {
    console.log(`🎮 Processing: ${action} for ${playerAddress}`);
    
    const walletClient = await this.getWalletClient();
    const nonce = await this.getNonce(walletClient);

    let txHash;
    let gasEstimate;
    
    try {
      if (action === "click") {
        // Fonction click vers le contrat SifuClick
        const sifuContract = getContract({
          address: SIFU_CLICK_CONTRACT_ADDRESS,
          abi: SIFU_CLICK_CONTRACT_ABI,
          client: walletClient,
        });

        console.log(`🎯 SifuClick transaction for player: ${playerAddress} (nonce: ${nonce})`);
        
        // Estimer le gas d'abord
        try {
          gasEstimate = await sifuContract.estimateGas.click([playerAddress]);
          console.log(`⛽ Gas estimé pour click: ${gasEstimate}`);
        } catch (estimateError) {
          console.error(`❌ Erreur estimation gas pour click:`, estimateError.message);
          gasEstimate = 100000n; // Fallback
        }
        
        txHash = await sifuContract.write.click([playerAddress], { 
          nonce,
          gas: gasEstimate + 20000n, // Ajouter une marge
        });
        
      } else if (action === "submitScoreMonad") {
        // NOUVELLE VALIDATION AVANT SOUMISSION AU CONTRAT
        this.validateScoreSubmission(playerAddress, score, waves_completed, enemies_killed, transactions);
        
        // Soumission de score au contrat Monad
        if (typeof score !== "number" || typeof transactions !== "number") {
          throw new Error("Paramètres 'score' ou 'transactions' invalides");
        }

        console.log(`🏆 Preparing Monad transaction (VALIDÉ):`);
        console.log(`  - Player: ${playerAddress}`);
        console.log(`  - Score: ${score} (BigInt: ${BigInt(score)})`);
        console.log(`  - Transactions: ${transactions} (BigInt: ${BigInt(transactions)})`);
        console.log(`  - Waves: ${waves_completed}`);
        console.log(`  - Kills: ${enemies_killed}`);

        const monadContract = getContract({
          address: MONAD_CONTRACT_ADDRESS,
          abi: MONAD_CONTRACT_ABI,
          client: walletClient,
        });

        // Estimer le gas d'abord
        try {
          gasEstimate = await monadContract.estimateGas.updatePlayerData([
            playerAddress,
            BigInt(score),
            BigInt(transactions)
          ]);
          console.log(`⛽ Gas estimé pour updatePlayerData: ${gasEstimate}`);
        } catch (estimateError) {
          console.error(`❌ Erreur estimation gas pour updatePlayerData:`, estimateError.message);
          gasEstimate = 150000n; // Fallback
        }

        console.log(`🏆 Monad score: ${score}, transactions: ${transactions} for player: ${playerAddress} (nonce: ${nonce})`);

        txHash = await monadContract.write.updatePlayerData([
          playerAddress,
          BigInt(score),
          BigInt(transactions)
        ], { 
          nonce,
          gas: gasEstimate + 30000n, // Ajouter une marge plus importante
        });
        
      } else {
        throw new Error(`Action non supportée: "${action}". Utilisez 'click' ou 'submitScoreMonad'.`);
      }
      
      console.log(`✅ Transaction envoyée: ${txHash}`);
      console.log(`🔗 Explorer: https://testnet-explorer.monad.xyz/tx/${txHash}`);
      
      // Attendre le receipt et vérifier le statut
      const receipt = await this.waitForTransactionReceipt(walletClient, txHash);
      
      if (receipt && receipt.status === '0x0') {
        throw new Error(`Transaction failed on-chain. Hash: ${txHash}. Vérifiez l'explorer pour plus de détails.`);
      }
      
    } catch (error) {
      console.error("❌ Erreur transaction:", error);
      
      // Si c'est une erreur de validation, la propager directement
      if (error.message && (error.message.includes('Score validation failed') || error.message.includes('Rate limit'))) {
        throw error;
      }
      
      // Gestion des erreurs de nonce (reset et retry)
      if (error.message && (error.message.includes("nonce too low") || error.message.includes("higher priority"))) {
        console.log("🔄 Reset nonce et retry...");
        
        // Reset le nonce et retry (logique existante)
        const nonceHex = await walletClient.request({
          method: "eth_getTransactionCount",
          params: [walletClient.account.address, "pending"],
        });
        currentNonce = parseInt(String(nonceHex), 16);
        const newNonce = currentNonce;
        currentNonce++;
        
        console.log(`🔄 Nouveau nonce: ${newNonce}`);
        
        // Retry avec le nouveau nonce
        if (action === "click") {
          const sifuContract = getContract({
            address: SIFU_CLICK_CONTRACT_ADDRESS,
            abi: SIFU_CLICK_CONTRACT_ABI,
            client: walletClient,
          });
          txHash = await sifuContract.write.click([playerAddress], { 
            nonce: newNonce,
            gas: gasEstimate + 20000n,
          });
          
        } else if (action === "submitScoreMonad") {
          const monadContract = getContract({
            address: MONAD_CONTRACT_ADDRESS,
            abi: MONAD_CONTRACT_ABI,
            client: walletClient,
          });
          txHash = await monadContract.write.updatePlayerData([
            playerAddress,
            BigInt(score),
            BigInt(transactions)
          ], { 
            nonce: newNonce,
            gas: gasEstimate + 30000n,
          });
        }
        
        console.log(`✅ Transaction retry réussie: ${txHash}`);
      } else {
        throw error;
      }
    }
    
    return txHash;
  }

  validateRequest(playerAddress, action) {
    if (!playerAddress || !action) {
      throw new Error("Paramètres 'playerAddress' et 'action' requis.");
    }
    
    const validActions = ['click', 'submitScoreMonad'];
    if (!validActions.includes(action)) {
      throw new Error(`Action invalide: "${action}". Actions supportées: ${validActions.join(', ')}`);
    }
    
    // Validation de l'adresse
    if (!playerAddress.startsWith('0x') || playerAddress.length !== 42) {
      throw new Error(`Adresse invalide: "${playerAddress}". Doit être une adresse Ethereum valide.`);
    }
    
    console.log(`✅ Validation requête réussie pour ${action} - ${playerAddress}`);
    return true;
  }
}

// Handler principal pour Vercel
export default async function handler(req, res) {
  const startTime = Date.now();
  console.log(`\n🚀 ===== NOUVELLE REQUÊTE RELAYER =====`);
  console.log(`📅 Timestamp: ${new Date().toISOString()}`);
  
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    console.error(`❌ Méthode non autorisée: ${req.method}`);
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log('📨 Relay request received:', JSON.stringify(req.body, null, 2));
    
    // Vérifier les variables d'environnement
    if (!process.env.RELAYER_PK || !process.env.MONAD_RPC_URL) {
      return res.status(500).json({ 
        error: 'Configuration error', 
        details: 'Missing environment variables' 
      });
    }

    const { 
      playerAddress, 
      action, 
      score, 
      transactions,
      waves_completed,
      enemies_killed
    } = req.body;
    
    console.log(`📨 Requête reçue: action="${action}", player="${playerAddress}"`);
    
    const relayer = new RelayerService();
    relayer.validateRequest(playerAddress, action);
    
    // Utiliser la queue pour éviter les conflits
    const txHash = await relayer.processTransactionWithQueue(
      playerAddress, 
      action, 
      score, 
      waves_completed, 
      enemies_killed, 
      transactions
    );
    
    const result = {
      success: true,
      txHash,
      processingTime: Date.now() - startTime,
    };
    
    console.log('✅ Relay request successful:', result);
    console.log(`⏱️ Temps total de traitement: ${result.processingTime}ms`);
    console.log(`🏁 ===== FIN REQUÊTE RELAYER =====\n`);
    
    return res.status(200).json(result);
    
  } catch (error) {
    const processingTime = Date.now() - startTime;
    console.error('❌ Relay request failed:', error);
    console.log(`⏱️ Temps avant erreur: ${processingTime}ms`);
    console.log(`🏁 ===== FIN REQUÊTE RELAYER (ERREUR) =====\n`);
    
    return res.status(error.status || 500).json({
      error: error.error || 'Transaction échouée',
      details: error.details || error.message || 'Unknown error',
      processingTime,
    });
  }
}