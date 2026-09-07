// Firestore backend. Collections: notes, shopping, events; docs: settings/weeklyMeals, chores/<kidId>.
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import {
  getFirestore, collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot, query, orderBy, setDoc, getDoc,
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';

export const name = 'firestore';
export async function testConnection(cfg) {
  const app = initializeApp(cfg, `test-${Date.now()}`);
  const d = await getDoc(doc(getFirestore(app), 'settings', 'weeklyMeals'));
  return d.exists() ? 'connected — existing meal plan found' : 'connected — empty project (fine for a fresh start)';
}

export function create(cfg) {
  const db = getFirestore(initializeApp(cfg));
  const snapList = (snap) => { const items = []; snap.forEach((d) => items.push({ id: d.id, ...d.data() })); return items; };
  return {
    name,
    watchList: (col, onItems, onError) => onSnapshot(query(collection(db, col), orderBy('createdAt', 'desc')), (s) => onItems(snapList(s)), (e) => onError?.(e)),
    addListItem: (col, text) => addDoc(collection(db, col), { text, completed: false, createdAt: new Date() }),
    toggleListItem: (col, id, completed) => updateDoc(doc(db, col, id), { completed: !completed }),
    deleteListItem: (col, id) => deleteDoc(doc(db, col, id)),
    watchMeals: (onMeals, onError) => onSnapshot(doc(db, 'settings', 'weeklyMeals'), (s) => onMeals(s.exists() ? s.data() : {}), (e) => onError?.(e)),
    saveMeals: (meals) => setDoc(doc(db, 'settings', 'weeklyMeals'), meals),
    watchChores: (kidId, onItems, onError) => onSnapshot(doc(db, 'chores', kidId), (s) => onItems(s.exists() ? (s.data().items || []) : null), (e) => onError?.(e)),
    setChores: (kidId, items) => setDoc(doc(db, 'chores', kidId), { items }),
    // local-calendar events: {summary, location, description, start, end, allDay}
    watchEvents: (onItems, onError) => onSnapshot(collection(db, 'events'), (s) => onItems(snapList(s)), (e) => onError?.(e)),
    putEvent: (id, data) => setDoc(doc(db, 'events', id), data),
    deleteEvent: (id) => deleteDoc(doc(db, 'events', id)),
  };
}
