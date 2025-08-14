// api/relay.js - Vercel Serverless Function (simplifié)
import { handleRelayRequest } from '../lib/relayer.js';

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
    const result = await handleRelayRequest(req, res);
    return res.status(200).json(result);
    
  } catch (error) {
    return res.status(error.status || 500).json({
      error: error.error || 'Erreur serveur',
      details: error.details
    });
  }
}