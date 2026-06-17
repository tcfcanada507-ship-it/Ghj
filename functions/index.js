const functions = require("firebase-functions");
const admin = require("firebase-admin");
admin.initializeApp();
const db = admin.firestore();

/* ─── 1. CONFIRM PAYMENT & CHANGE PLAN ─── */
exports.confirmPayment = functions.https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Connexion requise.");

  const { uid, plan, transactionId } = data;
  if (!uid || !plan || !transactionId) {
    throw new functions.https.HttpsError("invalid-argument", "Données manquantes.");
  }

  const validPlans = ["express", "memoire", "recherche"];
  if (!validPlans.includes(plan)) {
    throw new functions.https.HttpsError("invalid-argument", "Plan invalide.");
  }

  // Durée selon le plan
  const durationMap = { express: 2, memoire: 30, recherche: 30 };
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + durationMap[plan]);

  // Mettre à jour le plan (admin SDK — contourne les règles Firestore)
  await db.collection("users").doc(uid).update({
    plan: plan,
    expiresAt: expiresAt.toISOString(),
    lastPayment: { plan, transactionId, date: new Date().toISOString() },
  });

  // Déclencher le bonus parrainage si applicable
  await _triggerReferralBonus(uid, plan);

  return { success: true, plan, expiresAt: expiresAt.toISOString() };
});

/* ─── 2. REFERRAL BONUS (interne) ─── */
async function _triggerReferralBonus(uid, plan) {
  const userSnap = await db.collection("users").doc(uid).get();
  if (!userSnap.exists) return;
  const data = userSnap.data();

  // Bonus déjà accordé ou pas de parrain
  if (!data.referredBy || data.referralBonusGiven) return;

  const bonusMap = {
    express:   { parrain: 500,  filleul: 1 },
    memoire:   { parrain: 1200, filleul: 2 },
    recherche: { parrain: 2000, filleul: 3 },
  };
  const bonus = bonusMap[plan];
  if (!bonus) return;

  // Créditer le filleul
  await db.collection("users").doc(uid).update({
    credits: admin.firestore.FieldValue.increment(bonus.filleul),
    referralBonusGiven: true,
  });

  // Créditer le parrain
  if (data.referredByUid) {
    await db.collection("users").doc(data.referredByUid).update({
      referralEarnings: admin.firestore.FieldValue.increment(bonus.parrain),
      referralCount: admin.firestore.FieldValue.increment(1),
      credits: admin.firestore.FieldValue.increment(Math.floor(bonus.parrain / 1000)),
    });
  }
}

/* ─── 3. DEDUCT CREDITS ─── */
exports.deductCredits = functions.https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Connexion requise.");

  const uid = context.auth.uid;
  const { action } = data;

  const costMap = {
    protocole:    5,
    sommaire:     3,
    chapitre:     5,
    export_final: 2,
    suggestion:   1,
  };

  const cost = costMap[action];
  if (!cost) throw new functions.https.HttpsError("invalid-argument", "Action inconnue.");

  const userRef = db.collection("users").doc(uid);
  const userSnap = await userRef.get();
  if (!userSnap.exists) throw new functions.https.HttpsError("not-found", "Utilisateur introuvable.");

  const currentCredits = userSnap.data().credits || 0;
  if (currentCredits < cost) {
    throw new functions.https.HttpsError("resource-exhausted", "Crédits insuffisants.");
  }

  await userRef.update({
    credits: admin.firestore.FieldValue.increment(-cost),
  });

  return { success: true, creditsUsed: cost, creditsRemaining: currentCredits - cost };
});
