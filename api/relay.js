// api/relay.js - Vercel Serverless Function unifiée
import { createWalletClient, getContract, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

// Adresses des contrats
const SIFU_CLICK_CONTRACT_ADDRESS = "0x86282eefde3e840fb660f04a4a5d4be85a4a8f79";
const MONAD_CONTRACT_ADDRESS = "0xE1B25BEF05F647Fe93dE082769fc2e2E2A112a5b";

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

class RelayerService {
  constructor() {
    this.RELAYER_PRIVATE_KEY = process.env.RELAYER_PK;
    this.RPC_URL = process.env.MONAD_RPC_URL || "https://testnet-rpc.monad.xyz";
    this.CHAIN_ID = Number(process.env.MONAD_CHAIN_ID || 10143);
    
    if (!this.RELAYER_PRIVATE_KEY) {
      throw new Error("RELAYER_PK manquante dans les variables d'environnement");
    }
  }

  async getWalletClient() {
    const account = privateKeyToAccount(
      this.RELAYER_PRIVATE_KEY.startsWith("0x") 
        ? this.RELAYER_PRIVATE_KEY 
        : `0x${this.RELAYER_PRIVATE_KEY}`
    );

    return createWalletClient({
      account,
      chain: { id: this.CHAIN_ID },
      transport: http(this.RPC_URL),
    });
  }

  async processTransactionWithQueue(playerAddress, action, score, accuracy, transactions) {
    return new Promise((resolve, reject) => {
      // Ajouter à la queue
      transactionQueue.push({
        playerAddress,
        action,
        score,
        accuracy,
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
          item.accuracy,
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

  async processTransaction(playerAddress, action, score, accuracy, transactions) {
    console.log(`🎮 Processing: ${action} for ${playerAddress} (nonce: ${currentNonce})`);
    
    const walletClient = await this.getWalletClient();
    const nonce = await this.getNonce(walletClient);

    let txHash;
    
    try {
      if (action === "click") {
        // Fonction click vers le contrat SifuClick
        const sifuContract = getContract({
          address: SIFU_CLICK_CONTRACT_ADDRESS,
          abi: SIFU_CLICK_CONTRACT_ABI,
          client: walletClient,
        });

        console.log(`🎯 SifuClick transaction for player: ${playerAddress} (nonce: ${nonce})`);
        
        txHash = await sifuContract.write.click([playerAddress], { 
          nonce,
          gas: 100000n, // Gas limit fixe pour éviter l'estimation
        });
        
      } else if (action === "submitScoreMonad") {
        // Soumission de score au contrat Monad
        if (typeof score !== "number" || typeof transactions !== "number") {
          throw new Error("Paramètres 'score' ou 'transactions' invalides");
        }

        const monadContract = getContract({
          address: MONAD_CONTRACT_ADDRESS,
          abi: MONAD_CONTRACT_ABI,
          client: walletClient,
        });

        console.log(`🏆 Monad score: ${score}, transactions: ${transactions} for player: ${playerAddress} (nonce: ${nonce})`);

        txHash = await monadContract.write.updatePlayerData([
          playerAddress,
          BigInt(score),
          BigInt(transactions)
        ], { 
          nonce,
          gas: 150000n, // Gas limit fixe
        });
        
      } else {
        throw new Error(`Action non supportée: "${action}". Utilisez 'click' ou 'submitScoreMonad'.`);
      }
      
      console.log(`✅ Transaction réussie: ${txHash}`);
      
    } catch (error) {
      console.error("❌ Erreur transaction:", error);
      
      // Gestion des erreurs de nonce (reset et retry)
      if (error.message && (error.message.includes("nonce too low") || error.message.includes("higher priority"))) {
        console.log("🔄 Reset nonce et retry...");
        
        // Reset le nonce
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
            gas: 100000n,
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
            gas: 150000n,
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
    
    return true;
  }
}

// Handler principal pour Vercel
export default async function handler(req, res) {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log('🎮 Relay request received:', req.body);
    
    // Vérifier les variables d'environnement
    if (!process.env.RELAYER_PK) {
      console.error('❌ RELAYER_PK missing');
      return res.status(500).json({ 
        error: 'Configuration error', 
        details: 'RELAYER_PK not configured' 
      });
    }

    if (!process.env.MONAD_RPC_URL) {
      console.error('❌ MONAD_RPC_URL missing');
      return res.status(500).json({ 
        error: 'Configuration error', 
        details: 'MONAD_RPC_URL not configured' 
      });
    }

    const { playerAddress, action, score, accuracy, transactions } = req.body;
    
    console.log(`📨 Requête reçue: action="${action}", player="${playerAddress}"`);
    
    const relayer = new RelayerService();
    relayer.validateRequest(playerAddress, action);
    
    // Utiliser la queue pour éviter les conflits
    const txHash = await relayer.processTransactionWithQueue(playerAddress, action, score, accuracy, transactions);
    
    const result = {
      success: true,
      txHash,
    };
    
    console.log('✅ Relay request successful:', result);
    return res.status(200).json(result);
    
  } catch (error) {
    console.error('❌ Relay request failed:', error);
    
    return res.status(error.status || 500).json({
      error: error.error || 'Transaction échouée',
      details: error.details || error.message || 'Unknown error'
    });
  }
}