// TODO
import admin from 'firebase-admin';
import serviceAccount from './spleet-e232e-firebase-adminsdk-t38q4-f7c0de8d65.json' assert { type: 'json' };

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

export async function sendNotification(payload) {
  return new Promise(async (resolve, reject) => {
    try {
      if (payload.tokens && payload.tokens.length > 0) {
        await admin.messaging().sendEachForMulticast(payload);
        resolve();
        return;
      }

      if (!payload.token) {
        reject('No token provided');
        return;
      }

      await admin.messaging().send(payload);
      resolve();
    } catch (error) {
      console.error('Error sending message:', error);
      reject(error);
    }
  });
}