// api/leaderboard.js - Handler pour l'endpoint leaderboard
import { createClient } from '@supabase/supabase-js';



const leaderboardHandler = async (req, res) => {
  console.log('\n🏆 LEADERBOARD REQUEST RECEIVED');
  console.log('📦 Request body:', req.body);

  // Configuration Supabase avec la clé service
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Missing Supabase environment variables');
  }

  // Vérification de la méthode HTTP
  if (req.method !== 'POST') {
    console.log('❌ Method not allowed:', req.method);
    return res.status(405).json({
      success: false,
      error: 'Method not allowed'
    });
  }

  try {
    const submission = req.body;

    // Validation des données
    const { username, wallet_address, waves_completed, enemies_killed, score } = submission;

    if (!username || !wallet_address || typeof score !== 'number') {
      console.log('❌ Missing or invalid required fields');
      return res.status(400).json({
        success: false,
        error: 'Missing or invalid required fields'
      });
    }

    // Validations supplémentaires
    if (score < 0 || score > 1000000) {
      console.log('❌ Invalid score value:', score);
      return res.status(400).json({
        success: false,
        error: 'Invalid score value'
      });
    }

    if (waves_completed < 0 || waves_completed > 1000) {
      console.log('❌ Invalid waves completed value:', waves_completed);
      return res.status(400).json({
        success: false,
        error: 'Invalid waves completed value'
      });
    }

    if (enemies_killed < 0 || enemies_killed > 100000) {
      console.log('❌ Invalid enemies killed value:', enemies_killed);
      return res.status(400).json({
        success: false,
        error: 'Invalid enemies killed value'
      });
    }

    console.log('✅ Data validation passed');

    // Insertion dans Supabase avec la clé service
    const { data, error } = await supabaseAdmin
      .from('leaderboard_monapocalypse')
      .insert([{
        username: username.trim(),
        wallet_address: wallet_address.trim(),
        waves_completed,
        enemies_killed,
        score
      }])
      .select()
      .single();

    if (error) {
      console.error('❌ Supabase error:', error);
      return res.status(500).json({
        success: false,
        error: 'Database error'
      });
    }

    console.log('✅ Score submitted successfully:', data);

    return res.status(200).json({
      success: true,
      data
    });

  } catch (error) {
    console.error('❌ API error:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
};

export default leaderboardHandler;