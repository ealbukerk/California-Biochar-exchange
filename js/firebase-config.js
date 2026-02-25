const firebaseConfig = {
  apiKey: "AIzaSyB0Be0jhQgbzPgT0bKAHgO-2uFTwe3Lkes",
  authDomain: "biochar-market.firebaseapp.com",
  projectId: "biochar-market",
  storageBucket: "biochar-market.firebasestorage.app",
  messagingSenderId: "315682754135",
  appId: "1:315682754135:web:efcb3dde0c01b912091d12",
}
firebase.initializeApp(firebaseConfig)
const auth = firebase.auth()
const db = firebase.firestore()
