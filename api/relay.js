// api/relay.js - Vercel Serverless Function unifiée avec logs détaillés
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

    console.log(`🔗 Configuration relayer:`);
    console.log(`  - RPC URL: ${this.RPC_URL}`);
    console.log(`  - Chain ID: ${this.CHAIN_ID}`);
    console.log(`  - Sifu Contract: ${SIFU_CLICK_CONTRACT_ADDRESS}`);
    console.log(`  - Monad Contract: ${MONAD_CONTRACT_ADDRESS}`);
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
            
            // Essayer de récupérer plus d'infos sur l'erreur
            try {
              const tx = await walletClient.request({
                method: "eth_getTransactionByHash",
                params: [txHash],
              });
              console.log(`📋 Détails de la transaction échouée:`, {
                from: tx.from,
                to: tx.to,
                value: tx.value,
                gas: tx.gas,
                gasPrice: tx.gasPrice,
                input: tx.input?.substring(0, 100) + '...',
              });
            } catch (txError) {
              console.error(`❌ Erreur lors de la récupération des détails de tx:`, txError.message);
            }

            // Essayer de faire un eth_call pour voir l'erreur de revert
            try {
              const tx = await walletClient.request({
                method: "eth_getTransactionByHash",
                params: [txHash],
              });
              
              if (tx) {
                console.log(`🔍 Tentative de simulation de la transaction échouée...`);
                await walletClient.request({
                  method: "eth_call",
                  params: [{
                    from: tx.from,
                    to: tx.to,
                    data: tx.input,
                    value: tx.value,
                    gas: tx.gas,
                  }, "latest"],
                });
              }
            } catch (callError) {
              console.error(`🔍 Erreur détectée via eth_call:`, callError.message);
              
              // Parser l'erreur pour extraire le message de revert
              if (callError.message.includes('revert')) {
                const revertMatch = callError.message.match(/revert (.+)/);
                if (revertMatch) {
                  console.error(`🚫 Message de revert: "${revertMatch[1]}"`);
                }
              }
            }
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

  async processTransaction(playerAddress, action, score, accuracy, transactions) {
    console.log(`🎮 Processing: ${action} for ${playerAddress}`);
    console.log(`📊 Paramètres: score=${score}, transactions=${transactions}`);
    
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
        // Soumission de score au contrat Monad
        if (typeof score !== "number" || typeof transactions !== "number") {
          throw new Error("Paramètres 'score' ou 'transactions' invalides");
        }

        console.log(`🏆 Preparing Monad transaction:`);
        console.log(`  - Player: ${playerAddress}`);
        console.log(`  - Score: ${score} (BigInt: ${BigInt(score)})`);
        console.log(`  - Transactions: ${transactions} (BigInt: ${BigInt(transactions)})`);

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
          
          // Analyser l'erreur d'estimation
          if (estimateError.message.includes('revert')) {
            console.error(`🚫 Le contrat va revert - vérifiez les conditions:`, estimateError.message);
          }
          
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
      console.error("❌ Stack trace:", error.stack);
      
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
    
    console.log(`✅ Validation réussie pour ${action} - ${playerAddress}`);
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
    const envCheck = {
      RELAYER_PK: !!process.env.RELAYER_PK,
      MONAD_RPC_URL: !!process.env.MONAD_RPC_URL,
      MONAD_CHAIN_ID: !!process.env.MONAD_CHAIN_ID,
    };
    console.log(`🔧 Variables d'environnement:`, envCheck);

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
    
    console.log(`🔨 Requête reçue: action="${action}", player="${playerAddress}"`);
    
    const relayer = new RelayerService();
    relayer.validateRequest(playerAddress, action);
    
    // Utiliser la queue pour éviter les conflits
    const txHash = await relayer.processTransactionWithQueue(playerAddress, action, score, accuracy, transactions);
    
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
    console.error('❌ Error stack:', error.stack);
    console.log(`⏱️ Temps avant erreur: ${processingTime}ms`);
    console.log(`🏁 ===== FIN REQUÊTE RELAYER (ERREUR) =====\n`);
    
    return res.status(error.status || 500).json({
      error: error.error || 'Transaction échouée',
      details: error.details || error.message || 'Unknown error',
      processingTime,
    });
  }
}