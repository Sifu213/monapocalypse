// api/leaderboard.js - Handler pour l'endpoint leaderboard
import { createClient } from '@supabase/supabase-js';

// api/leaderboard.js - Handler pour l'endpoint leaderboard avec validation
import { createClient } from '@supabase/supabase-js';
import { validateScore, logValidation } from './scoreValidator.js';

const leaderboardHandler = async (req, res) => {
  console.log('\n🏆 LEADERBOARD REQUEST RECEIVED');
  console.log('📦 Request body:', req.body);

  // Configuration Supabase avec la clé service (déplacée ici)
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('❌ Missing Supabase environment variables');
    console.error('VITE_SUPABASE_URL:', !!supabaseUrl);
    console.error('SUPABASE_SERVICE_ROLE_KEY:', !!supabaseServiceKey);
    return res.status(500).json({
      success: false,
      error: 'Server configuration error'
    });
  }

  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

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

    // Validation des données de base
    const { username, wallet_address, waves_completed, enemies_killed, score } = submission;

    if (!username || !wallet_address || typeof score !== 'number') {
      console.log('❌ Missing or invalid required fields');
      return res.status(400).json({
        success: false,
        error: 'Missing or invalid required fields'
      });
    }

    // NOUVELLE VALIDATION : Validation logique du score
    const validationResult = validateScore(submission);
    logValidation(submission, validationResult);

    if (!validationResult.isValid) {
      console.log('❌ Score validation failed');
      return res.status(400).json({
        success: false,
        error: 'Score failed',
      });
    }

    console.log('✅ Score validation passed');

    // Validations supplémentaires existantes (gardées pour sécurité)
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

    if (enemies_killed < 0 || enemies_killed > 500000) {
      console.log('❌ Invalid enemies killed value:', enemies_killed);
      return res.status(400).json({
        success: false,
        error: 'Invalid enemies killed value'
      });
    }

    console.log('✅ All validations passed');

    // Vérification anti-spam : pas plus d'un score par wallet par minute
    const oneMinuteAgo = new Date(Date.now() - 60000).toISOString();
    const { data: recentSubmissions, error: checkError } = await supabaseAdmin
      .from('leaderboard_monapocalypse')
      .select('created_at')
      .eq('wallet_address', wallet_address.trim())
      .gt('created_at', oneMinuteAgo);

    if (checkError) {
      console.error('❌ Error checking recent submissions:', checkError);
    } else if (recentSubmissions && recentSubmissions.length > 0) {
      console.log('❌ Rate limit: Recent submission found for wallet:', wallet_address);
      return res.status(429).json({
        success: false,
        error: 'Rate limit: Please wait before submitting another score'
      });
    }

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

    console.log('✅ Score submitted successfully:', {
      id: data.id,
      username: data.username,
      score: data.score,
      validation: validationResult.details
    });

    return res.status(200).json({
      success: true,
      data,
      validation: validationResult.details
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