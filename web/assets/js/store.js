// Firestore data layer. Collections: notes, shopping; docs: settings/weeklyMeals, chores/<kidId>.
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import {
  getFirestore, collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot, query, orderBy, setDoc,
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';

import config from '../../config.js';

const firebaseConfig = config.firebase;

export const configured = !!(firebaseConfig && firebaseConfig.apiKey && firebaseConfig.projectId);
let db = null;
if (configured) { db = getFirestore(initializeApp(firebaseConfig)); }
else { console.warn('Firebase not configured in config.js — lists, meals and chores are disabled'); }
const notConfigured = () => Promise.reject(new Error('Firebase not configured'));

/* Simple check lists: `notes` and `shopping` collections ({text, completed, createdAt}). */
export function watchList(name, onItems, onError) {
  if (!configured) { onItems([]); onError?.(new Error('not configured')); return () => {}; }
  const q = query(collection(db, name), orderBy('createdAt', 'desc'));
  return onSnapshot(q, (snap) => {
    const items = [];
    snap.forEach((d) => items.push({ id: d.id, ...d.data() }));
    onItems(items);
  }, (err) => { console.error(`watch ${name}:`, err); onError?.(err); });
}
export const addListItem = (name, text) => !configured ? notConfigured() : addDoc(collection(db, name), { text, completed: false, createdAt: new Date() });
export const toggleListItem = (name, id, completed) => !configured ? notConfigured() : updateDoc(doc(db, name, id), { completed: !completed });
export const deleteListItem = (name, id) => !configured ? notConfigured() : deleteDoc(doc(db, name, id));

/* Weekly meals: single doc settings/weeklyMeals {Sunday..Saturday: string}. */
export const watchMeals = (onMeals, onError) => !configured ? (onMeals({}), onError?.(new Error('not configured')), () => {}) : onSnapshot(doc(db, 'settings', 'weeklyMeals'),
  (snap) => onMeals(snap.exists() ? snap.data() : {}),
  (err) => { console.error('watch meals:', err); onError?.(err); });
export const saveMeals = (meals) => !configured ? notConfigured() : setDoc(doc(db, 'settings', 'weeklyMeals'), meals);

/* Chores: one doc per kid, chores/<kidId> {items:[{id,text,completed}]}. */
export const watchChores = (kidId, onItems, onError) => !configured ? (onItems([]), onError?.(new Error('not configured')), () => {}) : onSnapshot(doc(db, 'chores', kidId),
  (snap) => onItems(snap.exists() ? (snap.data().items || []) : null),
  (err) => { console.error(`watch chores ${kidId}:`, err); onError?.(err); });
export const setChores = (kidId, items) => !configured ? notConfigured() : setDoc(doc(db, 'chores', kidId), { items });
