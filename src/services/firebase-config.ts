import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import { getStorage } from 'firebase/storage';

// IMPORTANT: Ensure you have a .env file with your Firebase project configuration.
// See .env.example or the console error/warning for the required variables.
// Make sure the variables are prefixed with NEXT_PUBLIC_ if they need to be accessed client-side.
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID // Optional
};

// Validate that necessary config values are present and not placeholders
const requiredConfigs: (keyof typeof firebaseConfig)[] = ['apiKey', 'projectId', 'storageBucket'];
const missingConfigs = requiredConfigs.filter(key => !firebaseConfig[key] || String(firebaseConfig[key]).includes('YOUR_')); // Check for empty or placeholder values

if (missingConfigs.length > 0) {
  const errorMessage = `Firebase configuration is incomplete or uses placeholder values. Please check your .env file and ensure the following NEXT_PUBLIC_ variables are set correctly: ${missingConfigs.map(key => `NEXT_PUBLIC_FIREBASE_${key.replace(/([A-Z])/g, '_$1').toUpperCase()}`).join(', ')}`;
  console.error(errorMessage);
  // Throw an error to stop execution if the config is invalid.
  // This prevents the app from running with a broken Firebase connection.
  throw new Error(errorMessage);
}


// Initialize Firebase
let app: FirebaseApp;
if (!getApps().length) {
  try {
    app = initializeApp(firebaseConfig);
    console.log("Firebase initialized successfully.");
  } catch (error) {
    console.error("Error initializing Firebase:", error);
    // Re-throw the error after logging it, as initialization failure is critical
    throw new Error(`Firebase initialization failed: ${(error as Error).message}`);
  }
} else {
  app = getApps()[0];
}

let storage;
try {
  storage = getStorage(app);
} catch (error) {
  console.error("Error getting Firebase Storage instance:", error);
  // Depending on requirements, you might want to throw here as well
  // or provide a fallback mechanism if storage is optional.
  // For this app, storage is crucial, so we throw.
  throw new Error(`Failed to get Firebase Storage instance: ${(error as Error).message}`);
}


export { app, storage };
