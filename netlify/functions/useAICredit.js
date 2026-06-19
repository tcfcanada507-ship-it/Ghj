const admin = require('firebase-admin');

// Init Admin SDK une seule fois
if (!admin.apps.length) {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

const db = admin.firestore();

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    // 1. Vérifier le token Firebase Auth
    const authHeader = event.headers.authorization || '';
    if (!authHeader.startsWith('Bearer ')) {
      return { statusCode: 401, headers, body: JSON.stringify({ error: 'Token manquant' }) };
    }
    const idToken = authHeader.split('Bearer ')[1];
    const decoded = await admin.auth().verifyIdToken(idToken);
    const uid = decoded.uid;

    // 2. Lire le coût depuis le body
    const { cost } = JSON.parse(event.body || '{}');
    if (!cost || typeof cost !== 'number' || cost <= 0) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Coût invalide' }) };
    }

    // 3. Transaction atomique : renouveler (si Gratuit) puis vérifier et déduire
    const FREE_MONTHLY_CREDITS = 10;
    const MS_30_DAYS = 30 * 24 * 60 * 60 * 1000;
    const userRef = db.collection('users').doc(uid);
    const result = await db.runTransaction(async (tx) => {
      const snap = await tx.get(userRef);
      if (!snap.exists) throw new Error('Utilisateur introuvable');
      const data = snap.data();
      let credits = data.credits ?? 0;

      // Renouvellement mensuel automatique pour le plan Gratuit uniquement.
      // Basé sur un timestamp serveur (lastFreeCreditAt), non modifiable par le client.
      if (data.plan === 'gratuit' || !data.plan) {
        const lastRenew = data.lastFreeCreditAt ? new Date(data.lastFreeCreditAt).getTime() : 0;
        if (Date.now() - lastRenew >= MS_30_DAYS) {
          credits = FREE_MONTHLY_CREDITS;
          tx.update(userRef, { credits, lastFreeCreditAt: new Date().toISOString() });
        }
      }

      if (credits < cost) throw new Error(`INSUFFICIENT:${credits}`);
      tx.update(userRef, { credits: admin.firestore.FieldValue.increment(-cost) });
      return { creditsRestants: credits - cost };
    });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ ok: true, creditsRestants: result.creditsRestants }),
    };

  } catch (e) {
    if (e.message?.startsWith('INSUFFICIENT:')) {
      const credits = parseInt(e.message.split(':')[1]);
      return { statusCode: 402, headers, body: JSON.stringify({ error: 'insufficient', credits }) };
    }
    console.error('useAICredit error:', e);
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
  }
};
