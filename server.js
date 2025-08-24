// server.js - Express Server (mis à jour avec leaderboard)
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

// Importer les handlers
import relayHandler from './api/relay.js';
import leaderboardHandler from './api/leaderboard.js';

// Charger les variables d'environnement
dotenv.config({ path: '.env' });
dotenv.config();

const PORT = process.env.PORT || 3001;

const app = express();

// Middleware de logging
app.use((req, res, next) => {
  console.log(`\n🌐 ${new Date().toISOString()} - ${req.method} ${req.url}`);
  if (req.method === 'POST') {
    console.log(`📦 Body:`, req.body);
  }
  next();
});

// Middleware
app.use(cors({
  origin: ['http://localhost:5173', 'http://localhost:3000', 'http://127.0.0.1:5173'], 
  credentials: true
}));
app.use(express.json());

// Route API pour le relayer - UTILISE LA FONCTION DE relay.js
app.post('/api/relay', async (req, res) => {
  console.log('\n🎮 RELAY REQUEST RECEIVED');
  console.log('📦 Request body:', req.body);
  
  try {
    // Utiliser directement la fonction handler de relay.js
    await relayHandler(req, res);
  } catch (error) {
    console.error('❌ RELAY ERROR in server.js:', error);
    
    // Si relayHandler n'a pas encore envoyé de réponse
    if (!res.headersSent) {
      res.status(error.status || 500).json({
        error: error.error || 'Erreur serveur',
        details: error.details || error.message
      });
    }
  }
});

// Route API pour le leaderboard - NOUVELLE
app.post('/api/leaderboard', async (req, res) => {
  console.log('\n🏆 LEADERBOARD REQUEST RECEIVED');
  console.log('📦 Request body:', req.body);
  
  try {
    await leaderboardHandler(req, res);
  } catch (error) {
    console.error('❌ LEADERBOARD ERROR in server.js:', error);
    
    if (!res.headersSent) {
      res.status(error.status || 500).json({
        error: error.error || 'Erreur serveur leaderboard',
        details: error.details || error.message
      });
    }
  }
});

// Routes utilitaires
app.get('/health', (req, res) => {
  console.log('✅ Health check called');
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    environment: 'development',
    env_vars: {
      RELAYER_PK: !!process.env.RELAYER_PK,
      MONAD_RPC_URL: !!process.env.MONAD_RPC_URL,
      MONAD_CHAIN_ID: !!process.env.MONAD_CHAIN_ID,
      VITE_SUPABASE_URL: !!process.env.VITE_SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY: !!process.env.SUPABASE_SERVICE_ROLE_KEY
    }
  });
});

app.get('/api/test', (req, res) => {
  console.log('🧪 Test endpoint called');
  res.json({ 
    message: 'Serveur relayer Monad et Leaderboard actif!',
    timestamp: new Date().toISOString()
  });
});

// Gestion des erreurs globales
app.use((error, req, res, next) => {
  console.error('💥 Erreur serveur globale:', error);
  console.error('💥 Stack:', error.stack);
  
  if (!res.headersSent) {
    res.status(500).json({
      error: 'Erreur serveur interne',
      details: error.message
    });
  }
});

// Gestion des erreurs non catchées
process.on('uncaughtException', (error) => {
  console.error('🔥 UNCAUGHT EXCEPTION:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('🔥 UNHANDLED REJECTION at:', promise, 'reason:', reason);
});

// Démarrage du serveur
app.listen(PORT, () => {
  console.log('\n🚀 ===== SERVEUR RELAYER + LEADERBOARD DÉMARRÉ =====');
  console.log(`📡 Port: ${PORT}`);
  console.log(`🌐 Serveur: http://localhost:${PORT}`);
  console.log(`🎮 Frontend: http://localhost:5173`);
  console.log(`🔗 API relay: http://localhost:${PORT}/api/relay`);
  console.log(`🏆 API leaderboard: http://localhost:${PORT}/api/leaderboard`);
  console.log(`💚 Health check: http://localhost:${PORT}/health`);
  console.log(`🧪 Test: http://localhost:${PORT}/api/test`);
  
  // Vérifier les variables d'environnement au démarrage
  console.log('\n🔧 Variables d\'environnement:');
  console.log(`  - RELAYER_PK: ${process.env.RELAYER_PK ? '✅ Définie' : '❌ Manquante'}`);
  console.log(`  - MONAD_RPC_URL: ${process.env.MONAD_RPC_URL ? '✅ Définie' : '❌ Manquante'}`);
  console.log(`  - MONAD_CHAIN_ID: ${process.env.MONAD_CHAIN_ID ? '✅ Définie' : '❌ Manquante'}`);
  console.log(`  - VITE_SUPABASE_URL: ${process.env.VITE_SUPABASE_URL ? '✅ Définie' : '❌ Manquante'}`);
  console.log(`  - SUPABASE_SERVICE_ROLE_KEY: ${process.env.SUPABASE_SERVICE_ROLE_KEY ? '✅ Définie' : '❌ Manquante'}`);
  
  console.log('\n⚡ Prêt à traiter les transactions Monad et les scores !');
  console.log('=====================================================\n');
});