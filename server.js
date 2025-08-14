// server.js - Express Server (simplifié)
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { handleRelayRequest } from './src/lib/relayer.js';

// Charger les variables d'environnement
dotenv.config({ path: '.env.local' });
dotenv.config();

const PORT = process.env.PORT || 3001;

const app = express();

// Middleware
app.use(cors({
  origin: ['http://localhost:5173', 'http://localhost:3000', 'http://127.0.0.1:5173'], 
  credentials: true
}));
app.use(express.json());

// Route API pour le relayer - UTILISE LA MÊME LOGIQUE QUE VERCEL
app.post('/api/relay', async (req, res) => {
  try {
    const result = await handleRelayRequest(req, res);
    res.json(result);
    
  } catch (error) {
    res.status(error.status || 500).json({
      error: error.error || 'Erreur serveur',
      details: error.details
    });
  }
});

// Routes utilitaires
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    environment: 'development'
  });
});

app.get('/api/test', (req, res) => {
  res.json({ 
    message: 'Serveur relayer Monad actif!',
    timestamp: new Date().toISOString()
  });
});

// Gestion des erreurs globales
app.use((error, req, res, next) => {
  console.error('💥 Erreur serveur:', error);
  res.status(500).json({
    error: 'Erreur serveur interne',
    details: error.message
  });
});

// Démarrage du serveur
app.listen(PORT, () => {
  console.log('\n🚀 SERVEUR RELAYER DÉMARRÉ !');
  console.log(`📍 Serveur: http://localhost:${PORT}`);
  console.log(`🎮 Frontend: http://localhost:5173`);
  console.log(`🔗 API relay: http://localhost:${PORT}/api/relay`);
  console.log(`💚 Health check: http://localhost:${PORT}/health`);
  console.log('\n⚡ Prêt à traiter les transactions Monad !');
});