const STORAGE_KEY = "progetto-adhd-quest-v2";
const LEGACY_STORAGE_KEYS = ["progetto-adhd-quest-v1"];
const XP_PER_LEVEL = 180;
const COACH_ENDPOINT = "/api/coach";
const COACH_HISTORY_LIMIT = 12;
const COACH_TIMEOUT_MS = 12000;
const CLOUD_SYNC_DELAY_MS = 900;
const CLOUD_LOCAL_UPDATED_KEY = `${STORAGE_KEY}-cloud-updated-at`;

if (typeof window.ADHD_FIREBASE_CONFIG === "undefined") {
  window.ADHD_FIREBASE_CONFIG = null;
}

const rewards = [
  { id: "focus-map", level: 2, name: "Bussola Focus", meta: "priorità visibili" },
  { id: "no-gate", level: 3, name: "Porta del No", meta: "+25 XP a rifiuto" },
  { id: "amber-skin", level: 4, name: "Skin Ambra", meta: "tema sbloccato", theme: "amber" },
  { id: "pink-skin", level: 5, name: "Skin Magenta", meta: "tema sbloccato", theme: "pink" },
  { id: "overload-shield", level: 6, name: "Scudo Sovraccarico", meta: "carico sotto controllo" },
  { id: "deep-sprint", level: 7, name: "Sprint Profondo", meta: "45 minuti" },
];

const noScripts = {
  capacity:
    "Grazie per aver pensato a me. In questo momento ho già la capienza piena e non riuscirei a prenderlo in carico bene, quindi devo dirti di no.",
  priority:
    "Mi interessa, ma ho già preso priorità che non posso spostare. Per non promettere male, questa volta passo.",
  energy:
    "Questa settimana ho poca energia disponibile e sto proteggendo gli impegni essenziali. Preferisco dirti di no adesso invece di sparire dopo.",
  time:
    "I tempi sono troppo stretti per farlo con attenzione. Non posso aggiungerlo adesso, ma grazie per avermelo chiesto.",
};

const defaultState = () => ({
  profile: {
    name: "",
    avatar: "",
    xp: 0,
    coins: 0,
    streak: 0,
    lastDoneDay: null,
    theme: "default",
  },
  prefs: {
    energyToday: 2,
    capacityHours: 4,
    focusMinutes: 10,
    filter: "open",
  },
  tasks: [],
  history: [],
  meta: {
    localUpdatedAt: 0,
  },
  timer: {
    running: false,
    remaining: 10 * 60,
    taskId: null,
  },
});

let state = loadState();
let selectedCoachTaskId = null;
let coachAiReady = null;
let cloudRef = null;
let cloudUnsubscribe = null;
let cloudApplying = false;
let cloudSaveHandle = null;
let cloudLastSavedAt = 0;
let firebaseAuth = null;
let firebaseDb = null;
let googleProvider = null;
let timerHandle = null;
let toastHandle = null;
let stars = [];

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

const els = {
  profileName: $("#profileName"),
  avatarButton: $("#avatarButton"),
  avatarInput: $("#avatarInput"),
  avatarImage: $("#avatarImage"),
  avatarInitial: $("#avatarInitial"),
  levelLabel: $("#levelLabel"),
  xpFill: $("#xpFill"),
  xpLabel: $("#xpLabel"),
  coinCount: $("#coinCount"),
  streakLabel: $("#streakLabel"),
  missionState: $("#missionState"),
  whyList: $("#whyList"),
  priorityScore: $("#priorityScore"),
  timerClock: $("#timerClock"),
  timerTask: $("#timerTask"),
  startFocus: $("#startFocus"),
  pauseFocus: $("#pauseFocus"),
  resetFocus: $("#resetFocus"),
  completePrimary: $("#completePrimary"),
  parkPrimary: $("#parkPrimary"),
  missPrimary: $("#missPrimary"),
  splitPrimary: $("#splitPrimary"),
  coachPrimary: $("#coachPrimary"),
  taskForm: $("#taskForm"),
  taskTitle: $("#taskTitle"),
  taskArea: $("#taskArea"),
  taskDue: $("#taskDue"),
  taskDuration: $("#taskDuration"),
  taskImportance: $("#taskImportance"),
  taskFriction: $("#taskFriction"),
  taskConsequence: $("#taskConsequence"),
  taskEnergy: $("#taskEnergy"),
  taskBlocker: $("#taskBlocker"),
  taskAction: $("#taskAction"),
  icsInput: $("#icsInput"),
  icsButton: $("#icsButton"),
  backupInput: $("#backupInput"),
  backupButton: $("#backupButton"),
  exportButton: $("#exportButton"),
  clearDone: $("#clearDone"),
  newRun: $("#newRun"),
  taskCount: $("#taskCount"),
  taskList: $("#taskList"),
  capacityHours: $("#capacityHours"),
  loadLabel: $("#loadLabel"),
  loadFill: $("#loadFill"),
  dayMap: $("#dayMap"),
  noReason: $("#noReason"),
  noScript: $("#noScript"),
  copyNo: $("#copyNo"),
  scoreNo: $("#scoreNo"),
  rewardGrid: $("#rewardGrid"),
  activityLog: $("#activityLog"),
  coachBackdrop: $("#coachBackdrop"),
  coachPanel: $("#coachPanel"),
  closeCoach: $("#closeCoach"),
  clearCoach: $("#clearCoach"),
  coachTitle: $("#coachTitle"),
  coachMode: $("#coachMode"),
  coachHero: $("#coachHero"),
  coachSteps: $("#coachSteps"),
  coachForm: $("#coachForm"),
  coachInput: $("#coachInput"),
  coachSend: $("#coachSend"),
  coachMessages: $("#coachMessages"),
  cloudStatus: $("#cloudStatus"),
  googleLogin: $("#googleLogin"),
  toast: $("#toast"),
  starfield: $("#starfield"),
};

function loadState() {
  try {
    LEGACY_STORAGE_KEYS.forEach((key) => localStorage.removeItem(key));
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return defaultState();
    const parsed = JSON.parse(saved);
    return mergeState(defaultState(), parsed);
  } catch {
    return defaultState();
  }
}

function mergeState(base, saved) {
  return {
    ...base,
    ...saved,
    profile: { ...base.profile, ...(saved.profile || {}) },
    prefs: { ...base.prefs, ...(saved.prefs || {}) },
    meta: { ...base.meta, ...(saved.meta || {}) },
    timer: { ...base.timer, ...(saved.timer || {}) },
    tasks: Array.isArray(saved.tasks) ? saved.tasks : [],
    history: Array.isArray(saved.history) ? saved.history : [],
  };
}

function saveState({ syncCloud = true } = {}) {
  if (!cloudApplying) {
    state.meta = { ...(state.meta || {}), localUpdatedAt: Date.now() };
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  if (syncCloud) scheduleCloudSave();
}

function firebaseConfig() {
  const config = window.ADHD_FIREBASE_CONFIG;
  if (!config || typeof config !== "object") return null;
  if (!config.apiKey || !config.projectId || !config.appId) return null;
  return config;
}

function updateCloudStatus(status, title = "") {
  if (!els.cloudStatus) return;
  const labels = {
    local: "Locale",
    connecting: "Cloud...",
    synced: "Cloud",
    saving: "Sync...",
    error: "Cloud!",
  };
  els.cloudStatus.textContent = labels[status] || "Locale";
  els.cloudStatus.title = title || {
    local: "Salvataggio solo su questo browser",
    connecting: "Connessione a Firebase",
    synced: "Sincronizzato con Firebase",
    saving: "Salvataggio su Firebase",
    error: "Firebase non raggiungibile",
  }[status] || "";
  els.cloudStatus.className = `cloud-status ${status}`;
}

function updateGoogleLogin(user = firebaseAuth?.currentUser) {
  if (!els.googleLogin) return;
  if (!firebaseAuth || !googleProvider) {
    els.googleLogin.disabled = true;
    els.googleLogin.textContent = "Google";
    els.googleLogin.title = "Firebase non configurato";
    return;
  }
  const isGoogle = Boolean(user?.providerData?.some((provider) => provider.providerId === "google.com"));
  els.googleLogin.disabled = false;
  els.googleLogin.textContent = isGoogle ? "Google ✓" : "Google";
  els.googleLogin.title = isGoogle ? "Account Google collegato" : "Accedi con Google";
  els.googleLogin.classList.toggle("connected", isGoogle);
}

function initFirebaseSync() {
  const config = firebaseConfig();
  if (!config) {
    updateCloudStatus("local");
    updateGoogleLogin(null);
    return;
  }
  if (!window.firebase?.initializeApp || !window.firebase?.auth || !window.firebase?.firestore) {
    updateCloudStatus("error", "Firebase SDK non caricato");
    updateGoogleLogin(null);
    return;
  }

  updateCloudStatus("connecting");
  try {
    const app = firebase.apps?.length ? firebase.app() : firebase.initializeApp(config);
    firebaseAuth = firebase.auth(app);
    firebaseDb = firebase.firestore(app);
    googleProvider = new firebase.auth.GoogleAuthProvider();
    googleProvider.setCustomParameters({ prompt: "select_account" });
    updateGoogleLogin(firebaseAuth.currentUser);
    handleGoogleRedirectResult();

    firebaseAuth.onAuthStateChanged((user) => {
      updateGoogleLogin(user);
      if (!user) {
        firebaseAuth.signInAnonymously().catch((error) => {
          updateCloudStatus("error", `Login Firebase non riuscito: ${error.message}`);
          showToast("Firebase: attiva accesso anonimo");
        });
        return;
      }
      connectCloudState(firebaseDb, user.uid);
    });
  } catch (error) {
    updateCloudStatus("error", `Firebase non configurato: ${error.message}`);
    updateGoogleLogin(null);
  }
}

async function handleGoogleRedirectResult() {
  if (!firebaseAuth?.getRedirectResult) return;
  try {
    const result = await firebaseAuth.getRedirectResult();
    if (result?.user) {
      showToast("Accesso Google effettuato");
      updateGoogleLogin(result.user);
    }
  } catch (error) {
    showToast(googleAuthErrorText(error));
  }
}

async function signInWithGoogle() {
  if (!firebaseAuth || !googleProvider) {
    showToast("Firebase non è ancora pronto");
    return;
  }
  if (els.googleLogin) {
    els.googleLogin.disabled = true;
    els.googleLogin.textContent = "Apro...";
  }

  try {
    const user = firebaseAuth.currentUser;
    if (user?.providerData?.some((provider) => provider.providerId === "google.com")) {
      showToast("Google è già collegato");
      return;
    }

    if (user?.isAnonymous && user.linkWithPopup) {
      try {
        await user.linkWithPopup(googleProvider);
        showToast("Account Google collegato");
        return;
      } catch (error) {
        if (shouldUseRedirect(error) && user.linkWithRedirect) {
          showToast("Apro Google in modalità compatibile");
          await user.linkWithRedirect(googleProvider);
          return;
        }
        if (!["auth/credential-already-in-use", "auth/email-already-in-use", "auth/provider-already-linked"].includes(error.code)) {
          throw error;
        }
      }
    }

    try {
      await firebaseAuth.signInWithPopup(googleProvider);
      showToast("Accesso Google effettuato");
    } catch (error) {
      if (shouldUseRedirect(error) && firebaseAuth.signInWithRedirect) {
        showToast("Apro Google in modalità compatibile");
        await firebaseAuth.signInWithRedirect(googleProvider);
        return;
      }
      throw error;
    }
  } catch (error) {
    showToast(googleAuthErrorText(error));
  } finally {
    updateGoogleLogin(firebaseAuth.currentUser);
  }
}

function shouldUseRedirect(error) {
  return [
    "auth/popup-closed-by-user",
    "auth/popup-blocked",
    "auth/cancelled-popup-request",
    "auth/operation-not-supported-in-this-environment",
  ].includes(error?.code);
}

function googleAuthErrorText(error) {
  if (error?.code === "auth/popup-closed-by-user") return "La finestra Google si è chiusa. Riprova.";
  if (error?.code === "auth/popup-blocked") return "Popup bloccato: abilita popup o riprova.";
  if (error?.code === "auth/unauthorized-domain") return "Aggiungi questo dominio in Firebase Auth.";
  if (error?.code === "auth/operation-not-allowed") return "Abilita Google in Firebase Authentication.";
  if (error?.code === "auth/account-exists-with-different-credential") return "Questo account usa già un altro metodo di accesso.";
  return `Google non collegato: ${error?.message || "errore sconosciuto"}`;
}

function connectCloudState(db, uid) {
  if (cloudUnsubscribe) cloudUnsubscribe();
  cloudRef = db.collection("users").doc(uid).collection("game").doc("state");
  updateCloudStatus("connecting", "Carico il salvataggio cloud");

  cloudUnsubscribe = cloudRef.onSnapshot(
    (snapshot) => {
      if (!snapshot.exists) {
        pushStateToCloud();
        return;
      }
      applyCloudSnapshot(snapshot.data());
    },
    (error) => {
      updateCloudStatus("error", `Firebase: ${error.message}`);
      showToast("Firebase non raggiungibile");
    },
  );
}

function applyCloudSnapshot(data) {
  const cloudState = data?.state;
  const cloudUpdatedAt = Number(data?.updatedAtMs) || 0;
  const localUpdatedAt = Number(localStorage.getItem(CLOUD_LOCAL_UPDATED_KEY) || state.meta?.localUpdatedAt || 0);

  if (!cloudState || cloudUpdatedAt === cloudLastSavedAt) {
    updateCloudStatus("synced");
    return;
  }

  if (cloudUpdatedAt > localUpdatedAt) {
    cloudApplying = true;
    state = mergeState(defaultState(), cloudState);
    state.meta = { ...(state.meta || {}), localUpdatedAt: cloudUpdatedAt };
    localStorage.setItem(CLOUD_LOCAL_UPDATED_KEY, String(cloudUpdatedAt));
    saveState({ syncCloud: false });
    cloudApplying = false;
    render();
    updateCloudStatus("synced");
    showToast("Salvataggio Firebase caricato");
    return;
  }

  pushStateToCloud();
}

function scheduleCloudSave() {
  if (!cloudRef || cloudApplying) return;
  clearTimeout(cloudSaveHandle);
  cloudSaveHandle = setTimeout(pushStateToCloud, CLOUD_SYNC_DELAY_MS);
}

async function pushStateToCloud() {
  if (!cloudRef || cloudApplying) return;
  const updatedAtMs = Date.now();
  const cloudState = JSON.parse(JSON.stringify({
    ...state,
    meta: { ...(state.meta || {}), localUpdatedAt: updatedAtMs },
  }));

  updateCloudStatus("saving");
  try {
    await cloudRef.set(
      {
        version: 2,
        updatedAtMs,
        state: cloudState,
      },
      { merge: true },
    );
    cloudLastSavedAt = updatedAtMs;
    localStorage.setItem(CLOUD_LOCAL_UPDATED_KEY, String(updatedAtMs));
    updateCloudStatus("synced");
  } catch (error) {
    updateCloudStatus("error", `Firebase: ${error.message}`);
    showToast("Firebase: salvataggio non riuscito");
  }
}

function uid(prefix = "task") {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function todayKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function startOfToday(date = new Date()) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function isYesterday(dayKey) {
  if (!dayKey) return false;
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  return todayKey(yesterday) === dayKey;
}

function levelFromXp(xp) {
  return Math.floor(xp / XP_PER_LEVEL) + 1;
}

function xpIntoLevel(xp) {
  return xp % XP_PER_LEVEL;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function formatDateTime(value) {
  if (!value) return "nessuna scadenza";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "data non valida";
  return date.toLocaleString("it-IT", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatClock(seconds) {
  const safe = Math.max(0, seconds);
  const minutes = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

function formatDays(count) {
  return `${count} ${count === 1 ? "giorno" : "giorni"}`;
}

function dueHours(task, now = new Date()) {
  if (!task.due) return null;
  const due = new Date(task.due);
  if (Number.isNaN(due.getTime())) return null;
  return (due.getTime() - now.getTime()) / 36e5;
}

function generatedAction(task) {
  const duration = Number(task.duration) || 20;
  if (task.nextAction) return task.nextAction;
  if (duration >= 45) return `Dedica 10 minuti a definire il primo passo per: ${task.title}`;
  if ((Number(task.friction) || 1) >= 4) return `Apri solo l'inizio e prepara il materiale per: ${task.title}`;
  return `Inizia da una micro-azione concreta: ${task.title}`;
}

function scoreTask(task, now = new Date()) {
  let score = 0;
  const reasons = [];
  const hours = dueHours(task, now);
  const importance = Number(task.importance) || 3;
  const friction = Number(task.friction) || 3;
  const consequence = Number(task.consequence) || 3;
  const energyNeed = Number(task.energy) || 2;
  const duration = Number(task.duration) || 20;
  const energyToday = Number(state.prefs.energyToday) || 2;

  if (hours === null) {
    score += 8;
    reasons.push("non ha scadenza: resta visibile senza diventare emergenza finta");
  } else if (hours < 0) {
    score += 90;
    reasons.push("è già oltre la scadenza");
  } else if (hours <= 2) {
    score += 78;
    reasons.push("scade nelle prossime 2 ore");
  } else if (hours <= 8) {
    score += 62;
    reasons.push("scade oggi e ha poco margine");
  } else if (hours <= 24) {
    score += 46;
    reasons.push("scade entro 24 ore");
  } else if (hours <= 72) {
    score += 28;
    reasons.push("arriva nei prossimi 3 giorni");
  } else {
    score += 10;
    reasons.push("ha tempo, quindi non ruba il turno alle urgenze vere");
  }

  score += importance * 9;
  score += consequence * 8;

  if (importance >= 4) reasons.push("ha importanza alta");
  if (consequence >= 4) reasons.push("rimandarla avrebbe conseguenze forti");

  if (task.blocker) {
    score += 19;
    reasons.push("sblocca altre cose");
  }

  if (duration <= 15) {
    score += 10;
    reasons.push("è abbastanza piccola da chiudere subito");
  } else if (duration >= 75 && hours !== null && hours > 24) {
    score -= 8;
    reasons.push("è grande: conviene trattarla come sprint, non come blocco unico");
  }

  if (friction >= 4 && hours !== null && hours <= 24) {
    score += 10;
    reasons.push("è pesante e vicina: meglio non lasciarla fermentare");
  } else if (friction >= 4) {
    score -= 4;
    reasons.push("è pesante: entra solo con un primo passo piccolo");
  }

  if (energyNeed > energyToday) {
    score -= 13;
    reasons.push("richiede più energia di quella che hai segnato oggi");
  } else {
    score += 6;
    reasons.push("è compatibile con l'energia di oggi");
  }

  const capped = clamp(Math.round(score), 0, 160);
  return {
    score: capped,
    reasons: reasons.slice(0, 4),
    band: bandForTask(task, capped, hours),
    slot: suggestedSlot(task, capped, hours),
  };
}

function bandForTask(task, score, hours) {
  if (task.status === "parked") return "parked";
  if (hours !== null && hours < 0) return "now";
  if (hours !== null && hours <= 8) return "now";
  if (score >= 92) return "now";
  if (hours !== null && hours <= 24) return "today";
  if (score >= 62) return "today";
  if (hours !== null && hours <= 96) return "later";
  return "later";
}

function suggestedSlot(task, score, hours) {
  if (task.status === "parked") return "parcheggiata";
  if (hours !== null && hours < 0) return "adesso";
  if (hours !== null && hours <= 2) return "adesso";
  if (hours !== null && hours <= 8) return "oggi, prima della scadenza";
  if (score >= 92) return "prossimo blocco libero";
  if (hours !== null && hours <= 24) return "oggi";
  if (hours !== null && hours <= 72) return "entro 3 giorni";
  return "più avanti";
}

function priorityText(score) {
  if (score >= 100) return "Priorità alta";
  if (score >= 60) return "Priorità media";
  return "Priorità bassa";
}

function slotText(slot) {
  const labels = {
    adesso: "Adesso",
    "oggi, prima della scadenza": "Oggi, prima della scadenza",
    "prossimo blocco libero": "Prossimo blocco libero",
    oggi: "Oggi",
    "entro 3 giorni": "Entro 3 giorni",
    "più avanti": "Più avanti",
    dopo: "Più avanti",
    parcheggiata: "Parcheggiata",
  };
  return labels[slot] || slot;
}

function sourceText(task) {
  return task.source === "calendar" ? "Calendario" : "Manuale";
}

function rankedTasks(includeParked = false) {
  return state.tasks
    .filter((task) => task.status !== "done")
    .filter((task) => includeParked || task.status !== "parked")
    .map((task) => ({ task, rank: scoreTask(task) }))
    .sort((a, b) => b.rank.score - a.rank.score);
}

function primaryQuest() {
  return rankedTasks(false)[0] || null;
}

function addHistory(text, tone = "good") {
  state.history.unshift({
    id: uid("log"),
    text,
    tone,
    at: new Date().toISOString(),
  });
  state.history = state.history.slice(0, 30);
}

function showToast(message) {
  clearTimeout(toastHandle);
  els.toast.textContent = message;
  els.toast.classList.add("show");
  toastHandle = setTimeout(() => els.toast.classList.remove("show"), 2600);
}

function award({ xp = 0, coins = 0, text }) {
  const beforeLevel = levelFromXp(state.profile.xp);
  state.profile.xp += xp;
  state.profile.coins += coins;
  const afterLevel = levelFromXp(state.profile.xp);
  if (text) addHistory(text);
  if (afterLevel > beforeLevel) {
    addHistory(`Livello ${afterLevel} raggiunto`, "level");
    showToast(`Livello ${afterLevel} sbloccato`);
  }
}

function completeTask(id) {
  const task = state.tasks.find((item) => item.id === id);
  if (!task || task.status === "done") return;

  task.status = "done";
  task.completedAt = new Date().toISOString();

  const today = todayKey();
  if (state.profile.lastDoneDay !== today) {
    state.profile.streak = isYesterday(state.profile.lastDoneDay)
      ? state.profile.streak + 1
      : 1;
    state.profile.lastDoneDay = today;
  }

  const hours = dueHours(task);
  const urgencyBonus = hours !== null && hours <= 24 ? 18 : 6;
  const xp = 20 + (Number(task.importance) || 3) * 8 + (Number(task.friction) || 3) * 5 + urgencyBonus;
  const coins = 5 + Math.ceil((Number(task.duration) || 20) / 15);
  award({
    xp,
    coins,
    text: `Completata: ${task.title} (+${xp} XP)`,
  });
  if (state.timer.taskId === id) stopTimer(false);
  saveAndRender();
  showToast(`Missione chiusa: +${xp} XP`);
}

function parkTask(id) {
  const task = state.tasks.find((item) => item.id === id);
  if (!task) return;
  task.status = task.status === "parked" ? "open" : "parked";
  addHistory(`${task.status === "parked" ? "Parcheggiata" : "Riattivata"}: ${task.title}`);
  saveAndRender();
}

function missTask(id, reason = "") {
  const task = state.tasks.find((item) => item.id === id);
  if (!task || task.status === "done") return;
  const cleanReason = reason.trim() || "da capire";
  task.status = "open";
  task.missedCount = (Number(task.missedCount) || 0) + 1;
  task.lastMissedAt = new Date().toISOString();
  task.missedReason = cleanReason;
  task.duration = Math.min(Number(task.duration) || 20, 15);
  task.friction = Math.min(5, (Number(task.friction) || 3) + 1);
  task.nextAction = recoveryAction(task, cleanReason);
  task.coachMessages = Array.isArray(task.coachMessages) ? task.coachMessages : [];
  task.coachMessages.push({
    role: "assistant",
    text: recoveryCoachText(task, cleanReason),
    at: new Date().toISOString(),
  });
  task.coachMessages = task.coachMessages.slice(-COACH_HISTORY_LIMIT);
  addHistory(`Non fatta: ${task.title}. Recupero più piccolo pronto.`, "quiet");
  if (state.timer.taskId === id) stopTimer(true);
  selectedCoachTaskId = id;
  saveAndRender();
  openCoach(id);
  showToast("Nessuna penalità: ho preparato un recupero");
}

function deleteTask(id) {
  const task = state.tasks.find((item) => item.id === id);
  state.tasks = state.tasks.filter((item) => item.id !== id);
  if (task) addHistory(`Rimossa: ${task.title}`, "quiet");
  saveAndRender();
}

function splitTask(id) {
  const task = state.tasks.find((item) => item.id === id);
  if (!task) return;
  task.nextAction = firstStepAction(task);
  task.duration = Math.min(Number(task.duration) || 20, 15);
  task.friction = Math.max(1, Number(task.friction || 3) - 1);
  addHistory(`Ridotta in primo passo: ${task.title}`);
  selectedCoachTaskId = id;
  saveAndRender();
  openCoach(id);
}

function restoreTask(id) {
  const task = state.tasks.find((item) => item.id === id);
  if (!task) return;
  task.status = "open";
  task.completedAt = null;
  addHistory(`Riaperta: ${task.title}`, "quiet");
  saveAndRender();
}

function recoveryAction(task, reason) {
  const lower = reason.toLowerCase();
  if (lower.includes("energia")) return "fai solo 5 minuti, senza completare tutto";
  if (lower.includes("tempo")) return "trova il prossimo buco da 10 minuti e prepara solo l'inizio";
  if (lower.includes("grande") || lower.includes("troppo")) return "spezza in una singola azione da 10 minuti";
  if (lower.includes("diment")) return "mettila in vista e fai subito un segno di avanzamento";
  if (task.source === "calendar") return "decidi se recuperare, riprogrammare o creare una nuova quest";
  return "riparti da una versione più piccola di 10 minuti";
}

function firstStepAction(task) {
  if (task.source === "calendar") return "controlla cosa richiede l'evento e prepara un output concreto";
  if (task.area === "relazioni") return "scrivi una bozza imperfetta di 2 righe";
  if ((Number(task.friction) || 1) >= 4) return "apri solo l'inizio e prepara il materiale";
  return "fai 10 minuti di avvio, senza cercare di finire tutto";
}

function recoveryCoachText(task, reason) {
  const reasonText = reason && reason !== "da capire" ? ` Motivo segnato: ${reason}.` : "";
  const question = reason === "da capire" ? " Se vuoi, scrivimi qui sotto cosa l'ha bloccata." : "";
  return `Ok, non è una sconfitta: è un dato.${reasonText} Io ripartirei da: ${recoveryAction(task, reason)}.${question}`;
}

function saveAndRender() {
  saveState();
  render();
}

function render() {
  document.body.dataset.theme = state.profile.theme || "default";
  renderProfile();
  renderMission();
  renderTimer();
  renderTasks();
  renderDayMap();
  renderRewards();
  renderNoScript();
  renderLog();
  if (selectedCoachTaskId) renderCoach();
  updateSegmentState();
}

function renderProfile() {
  const level = levelFromXp(state.profile.xp);
  const progress = (xpIntoLevel(state.profile.xp) / XP_PER_LEVEL) * 100;
  const name = state.profile.name || "";
  const avatar = state.profile.avatar || "";

  els.profileName.value = name;
  els.avatarButton.classList.toggle("has-image", Boolean(avatar));
  els.avatarImage.src = avatar;
  els.avatarInitial.textContent = name ? name.trim().charAt(0).toUpperCase() : "?";
  els.levelLabel.textContent = `Lv ${level}`;
  els.xpFill.style.width = `${progress}%`;
  els.xpLabel.textContent = `${xpIntoLevel(state.profile.xp)} / ${XP_PER_LEVEL} XP`;
  els.coinCount.textContent = state.profile.coins;
  els.streakLabel.textContent = formatDays(state.profile.streak || 0);
  els.capacityHours.value = state.prefs.capacityHours;
}

function renderMission() {
  const primary = primaryQuest();
  if (!primary) {
    els.priorityScore.textContent = "--";
    els.missionState.innerHTML = `
      <div class="empty-state game-empty">
        <strong>Nuova partita pronta.</strong>
        <span>Evoca la prima quest quando vuoi.</span>
      </div>
    `;
    els.whyList.innerHTML = "";
    els.timerTask.textContent = "In attesa";
    toggleMissionButtons(false);
    return;
  }

  const { task, rank } = primary;
  els.priorityScore.textContent = rank.score;
  els.timerTask.textContent = shortText(task.title, 14);
  els.missionState.innerHTML = `
    <button class="mission-guide-hit" type="button" data-guide-task-id="${task.id}">
      Guida
    </button>
    <div class="tag-row">
      <span class="tag ${rank.band === "now" ? "now" : "blue"}">${slotText(rank.slot)}</span>
      <span class="tag">Area: ${escapeHtml(task.area)}</span>
      <span class="tag">Durata: ${task.duration || 20} min</span>
    </div>
    <h3>${escapeHtml(task.title)}</h3>
    <p class="next-action">${escapeHtml(generatedAction(task))}</p>
    <div class="mission-meta">
      <span class="tag">Scadenza: ${formatDateTime(task.due)}</span>
      ${task.missedCount ? '<span class="tag recover">Recupero</span>' : ""}
      ${task.blocker ? '<span class="tag good">sblocca altro</span>' : ""}
      ${task.source === "calendar" ? '<span class="tag blue">Calendario</span>' : ""}
    </div>
  `;
  els.whyList.innerHTML = rank.reasons
    .slice(0, 2)
    .map((reason) => `<li>${escapeHtml(reason)}</li>`)
    .join("");
  toggleMissionButtons(true);
}

function toggleMissionButtons(enabled) {
  [els.startFocus, els.pauseFocus, els.completePrimary, els.parkPrimary, els.missPrimary, els.splitPrimary, els.coachPrimary].forEach((button) => {
    button.disabled = !enabled;
  });
}

function renderTimer() {
  els.timerClock.textContent = formatClock(state.timer.remaining);
  els.startFocus.innerHTML = state.timer.running
    ? '<svg><use href="#icon-check"></use></svg>In corso'
    : '<svg><use href="#icon-play"></use></svg>Avvia';
}

function renderTasks() {
  const filter = state.prefs.filter;
  const tasks = state.tasks
    .filter((task) => {
      if (filter === "done") return task.status === "done";
      if (filter === "parked") return task.status === "parked";
      return task.status !== "done" && task.status !== "parked";
    })
    .map((task) => ({ task, rank: scoreTask(task) }))
    .sort((a, b) => {
      if (filter === "done") return new Date(b.task.completedAt || 0) - new Date(a.task.completedAt || 0);
      return b.rank.score - a.rank.score;
    });

  els.taskCount.textContent = `${tasks.length}`;
  if (!tasks.length) {
    els.taskList.innerHTML = `<div class="empty-state"><span>Diario vuoto.</span></div>`;
    return;
  }

  els.taskList.innerHTML = tasks
    .map(({ task, rank }) => {
      const done = task.status === "done";
      const parked = task.status === "parked";
      const bandClass = rank.band === "now" ? "danger" : rank.band === "today" ? "now" : "blue";
      return `
        <article class="task-card ${done ? "done" : ""}" data-task-id="${task.id}" role="button" tabindex="0">
          <div class="task-topline">
            <div>
              <div class="task-title">${escapeHtml(task.title)}</div>
              <div class="task-meta">
                <span>${formatDateTime(task.due)}</span>
                <span>${task.duration || 20} min</span>
                <span>${escapeHtml(task.area)}</span>
              </div>
            </div>
            <div class="task-actions">
              <button class="guide-button" data-action="coach" title="Apri guida">Guida</button>
              ${
                done
                  ? `<button data-action="restore" title="Riapri"><svg><use href="#icon-refresh"></use></svg></button>`
                  : `<button data-action="done" title="Fatto"><svg><use href="#icon-check"></use></svg></button>
                     <button class="miss-button" data-action="miss" title="Non fatta">Non fatta</button>
                     <button data-action="park" title="${parked ? "Riattiva" : "Parcheggia"}"><svg><use href="#icon-pause"></use></svg></button>`
              }
              <button data-action="delete" title="Elimina"><svg><use href="#icon-trash"></use></svg></button>
            </div>
          </div>
          <div class="tag-row">
            <span class="tag ${bandClass}">${priorityText(rank.score)}</span>
            <span class="tag">${slotText(rank.slot)}</span>
            ${task.blocker ? '<span class="tag good">Sblocca altro</span>' : ""}
            ${task.missedCount ? '<span class="tag recover">Recupero</span>' : ""}
            ${task.source === "calendar" ? '<span class="tag blue">Calendario</span>' : ""}
          </div>
        </article>
      `;
    })
    .join("");
}

function renderDayMap() {
  const ranked = rankedTasks(true);
  const openRanked = ranked.filter(({ task }) => task.status !== "parked");
  const capacityMinutes = Number(state.prefs.capacityHours || 4) * 60;
  const todayLoad = openRanked
    .filter(({ rank }) => rank.band === "now" || rank.band === "today")
    .reduce((sum, { task }) => sum + (Number(task.duration) || 20), 0);
  const loadPercent = capacityMinutes ? Math.round((todayLoad / capacityMinutes) * 100) : 0;
  const capped = clamp(loadPercent, 0, 140);
  els.loadLabel.textContent = `${loadPercent}%`;
  els.loadFill.style.width = `${Math.min(capped, 100)}%`;
  els.loadFill.style.background =
    loadPercent > 100
      ? "linear-gradient(90deg, var(--amber), var(--red))"
      : "linear-gradient(90deg, var(--green), var(--amber))";

  const lanes = [
    { id: "now", label: "Adesso", items: openRanked.filter(({ rank }) => rank.band === "now").slice(0, 3) },
    { id: "today", label: "Oggi", items: openRanked.filter(({ rank }) => rank.band === "today").slice(0, 3) },
    { id: "later", label: "Più avanti", items: openRanked.filter(({ rank }) => rank.band === "later").slice(0, 4) },
    { id: "parked", label: "Parcheggio", items: ranked.filter(({ task }) => task.status === "parked").slice(0, 3) },
  ];

  els.dayMap.innerHTML = lanes
    .map((lane) => `
      <div class="map-lane">
        <h3>${lane.label}</h3>
        ${
          lane.items.length
            ? lane.items
                .map(({ task, rank }) => `
                  <button class="map-item ${lane.id}" data-map-task-id="${task.id}" type="button">
                    <span class="map-accent"></span>
                    <div class="map-content">
                      <strong>${escapeHtml(task.title)}</strong>
                      <span>${priorityText(rank.score)} · ${slotText(rank.slot)}</span>
                    </div>
                  </button>
                `)
                .join("")
            : `<div class="map-item ${lane.id}">
                <span class="map-accent"></span>
                <div class="map-content"><span>vuoto</span></div>
              </div>`
        }
      </div>
    `)
    .join("");
}

function renderRewards() {
  const level = levelFromXp(state.profile.xp);
  els.rewardGrid.innerHTML = rewards
    .map((reward) => {
      const unlocked = level >= reward.level;
      const canUseTheme = unlocked && reward.theme;
      const activeTheme = state.profile.theme === reward.theme;
      return `
        <button class="reward-card ${unlocked ? "" : "locked"}" data-theme-choice="${reward.theme || ""}" ${canUseTheme ? "" : "disabled"} type="button">
          <strong>${escapeHtml(reward.name)}</strong>
          <span class="reward-meta">Lv ${reward.level} · ${escapeHtml(reward.meta)}</span>
          <span class="tag ${unlocked ? "good" : ""}">${unlocked ? (activeTheme ? "attiva" : "sbloccata") : "bloccata"}</span>
        </button>
      `;
    })
    .join("");
}

function renderNoScript() {
  els.noScript.value = noScripts[els.noReason.value] || noScripts.capacity;
}

function renderLog() {
  if (!state.history.length) {
    els.activityLog.innerHTML = `<div class="empty-state"><span>Cronaca vuota.</span></div>`;
    return;
  }
  els.activityLog.innerHTML = state.history
    .slice(0, 10)
    .map((entry) => {
      const time = new Date(entry.at).toLocaleTimeString("it-IT", {
        hour: "2-digit",
        minute: "2-digit",
      });
      return `<div class="log-entry"><strong>${time}</strong> ${escapeHtml(entry.text)}</div>`;
    })
    .join("");
}

function taskById(id) {
  return state.tasks.find((task) => task.id === id) || null;
}

function openCoach(taskId) {
  const task = taskById(taskId);
  if (!task) return;
  selectedCoachTaskId = taskId;
  renderCoach();
  refreshCoachStatus();
  els.coachPanel.classList.add("open");
  els.coachPanel.setAttribute("aria-hidden", "false");
  els.coachBackdrop.hidden = false;
}

function closeCoach() {
  selectedCoachTaskId = null;
  els.coachPanel.classList.remove("open");
  els.coachPanel.setAttribute("aria-hidden", "true");
  els.coachBackdrop.hidden = true;
}

function renderCoach() {
  if (!selectedCoachTaskId) return;
  const task = taskById(selectedCoachTaskId);
  if (!task) {
    closeCoach();
    return;
  }
  const rank = scoreTask(task);
  const cards = coachCards(task, rank);
  updateCoachMode(task);
  els.coachTitle.textContent = task.title;
  els.coachHero.innerHTML = `
    <div class="coach-orb ${rank.band}">
      <strong>${priorityText(rank.score).replace("Priorità ", "")}</strong>
      <span>${slotText(rank.slot)}</span>
    </div>
    <div class="coach-hero-copy">
      <div class="tag-row">
        <span class="tag">${sourceText(task)}</span>
        <span class="tag">Durata: ${task.duration || 20} min</span>
        <span class="tag">Scadenza: ${formatDateTime(task.due)}</span>
        ${task.missedCount ? '<span class="tag recover">Recupero</span>' : ""}
      </div>
      <p>${escapeHtml(generatedAction(task))}</p>
    </div>
  `;
  els.coachSteps.innerHTML = cards
    .map((card, index) => `
      <article class="coach-step">
        <span class="step-number">${index + 1}</span>
        <div>
          <strong>${escapeHtml(card.title)}</strong>
          <p>${escapeHtml(card.text)}</p>
        </div>
      </article>
    `)
    .join("");

  const messages = Array.isArray(task.coachMessages) ? task.coachMessages : [];
  els.coachMessages.innerHTML = messages.length
    ? messages
        .slice(-10)
        .map((message) => `
          <div class="coach-message ${message.role} ${message.pending ? "pending" : ""} ${message.mode === "offline" ? "offline" : ""}">
            <strong>${escapeHtml(coachSpeaker(message))}</strong>
            <span>${escapeHtml(message.text)}</span>
          </div>
        `)
        .join("")
    : `<div class="coach-message assistant">
        <strong>Coach</strong>
        <span>Dimmi cosa vuoi preparare, cosa ti blocca o quale scelta non è chiara.</span>
      </div>`;
  requestAnimationFrame(() => {
    els.coachMessages.scrollTop = els.coachMessages.scrollHeight;
  });
}

function coachSpeaker(message) {
  if (message.role === "user") return "Tu";
  if (message.pending) return "Coach AI";
  if (message.mode === "ai") return "Coach AI";
  if (message.mode === "offline") return "Guida locale";
  return "Coach";
}

function updateCoachMode(task = taskById(selectedCoachTaskId)) {
  if (!els.coachMode) return;
  const isOffline = coachAiReady === false || (coachAiReady === null && task?.aiFallback === true);
  els.coachMode.textContent = isOffline ? "Offline" : "AI";
  els.coachMode.title = isOffline
    ? "Coach locale: collega OpenAI per risposte AI vere"
    : "Coach AI";
  els.coachMode.classList.toggle("offline", isOffline);
}

async function refreshCoachStatus() {
  try {
    const response = await fetch(`${COACH_ENDPOINT}/status`, { cache: "no-store" });
    if (!response.ok) throw new Error("Status non disponibile");
    const data = await response.json();
    coachAiReady = Boolean(data.configured);
    const task = taskById(selectedCoachTaskId);
    if (coachAiReady && task) task.aiFallback = false;
  } catch {
    coachAiReady = false;
  }
  updateCoachMode();
}

function coachCards(task, rank) {
  const cards = [
    { title: "Primo passo", text: generatedAction(task) },
    { title: "Prepara", text: preparationText(task) },
    { title: "Evita il blocco", text: riskText(task, rank) },
    { title: "Chiusura", text: finishText(task) },
  ];
  if (task.missedCount) {
    cards.unshift({
      title: "Recupero",
      text: recoveryCoachText(task, task.missedReason || ""),
    });
  }
  return cards;
}

function preparationText(task) {
  const inferred = inferredPreparation(task);
  if (inferred) return inferred;
  if (task.source === "calendar") {
    return "Controlla orario, contesto e obiettivo dell'evento. Prepara una nota, domanda o materiale da portare.";
  }
  if (task.area === "relazioni") {
    return "Scrivi una bozza imperfetta. Non correggerla finché non esiste.";
  }
  if (task.area === "salute") {
    return "Prepara documento, numero o app. Tieni vicino solo ciò che serve.";
  }
  if ((Number(task.friction) || 1) >= 4) {
    return "Riduci il campo: un file, una telefonata, una frase. Vietato risolvere tutto subito.";
  }
  return "Libera il piano, apri lo strumento giusto, avvia un timer breve.";
}

function inferredPreparation(task) {
  const text = `${task.title || ""} ${task.area || ""}`.toLowerCase();
  if (text.includes("commercialista") || text.includes("tasse") || text.includes("fisc") || text.includes("contabil")) {
    return "Prepara tre cose: documenti o ricevute, una lista di domande, e il punto più urgente da chiarire.";
  }
  if (text.includes("riunione") || text.includes("meeting") || text.includes("call")) {
    return "Scrivi obiettivo della riunione, 3 punti da dire e una domanda da fare se perdi il filo.";
  }
  if (text.includes("visita") || text.includes("medic") || text.includes("dottor") || text.includes("salute")) {
    return "Tieni pronti documento, eventuali referti e una lista breve di sintomi o domande.";
  }
  if (text.includes("bollett") || text.includes("pag") || text.includes("fattur")) {
    return "Metti davanti importo, scadenza e app o sito per pagare. Chiudi solo quel pagamento.";
  }
  if (text.includes("mail") || text.includes("email") || text.includes("messaggio") || text.includes("rispond")) {
    return "Apri una bozza con destinatario, una frase centrale e una richiesta finale chiara.";
  }
  if (text.includes("spesa")) {
    return "Scrivi solo le 5 cose indispensabili e decidi il negozio prima di uscire.";
  }
  if (text.includes("pul") || text.includes("casa")) {
    return "Scegli una sola zona, prepara sacco o panno, e fai 10 minuti senza cambiare stanza.";
  }
  return "";
}

function riskText(task, rank) {
  if ((Number(task.energy) || 2) > (Number(state.prefs.energyToday) || 2)) {
    return "Richiede energia: fai solo la versione minima e poi rivaluti.";
  }
  if (rank.band === "now") {
    return "Non ottimizzare. Fai la cosa utile, non quella perfetta.";
  }
  if ((Number(task.duration) || 20) >= 60) {
    return "È grande: spezzala in blocchi da 15 minuti.";
  }
  return "Se ti perdi, torna al primo passo e ignora il resto.";
}

function finishText(task) {
  if (task.source === "calendar") {
    return "Quando finisce, segna fatto o parcheggia il seguito come nuova quest.";
  }
  return "Quando hai completato il primo risultato visibile, premi Fatto e incassa XP.";
}

function coachReply(task, text) {
  const lower = text.toLowerCase();
  const rank = scoreTask(task);
  const action = generatedAction(task);
  const prep = preparationText(task);
  const minutes = Math.min(Number(task.duration) || 20, 25);

  if (lower.includes("ansia") || lower.includes("paura") || lower.includes("blocc")) {
    return [
      `Non devi chiudere "${task.title}" adesso: devi solo renderla meno minacciosa.`,
      `Prima mossa: ${action}.`,
      "Versione minima: 5 minuti, risultato anche imperfetto, poi stop e rivaluti.",
    ].join("\n");
  }
  if (lower.includes("tempo") || lower.includes("quanto") || lower.includes("quando")) {
    return [
      `Slot consigliato: ${slotText(rank.slot).toLowerCase()}.`,
      `Timer: ${minutes} minuti.`,
      `Prima cosa da fare quando parte il timer: ${action}.`,
    ].join("\n");
  }
  if (lower.includes("prepar") || lower.includes("serve") || lower.includes("material")) {
    return [`Preparazione per "${task.title}":`, prep, "Tieni fuori solo ciò che serve al primo passo."].join("\n");
  }
  if (lower.includes("messaggio") || lower.includes("scriv") || lower.includes("rispond")) {
    return [
      "Bozza minima:",
      "Ciao, ti rispondo ora in modo sintetico: ...",
      "Prima metti il senso. Solo dopo sistemi tono e dettagli.",
    ].join("\n");
  }
  if (lower.includes("perché") || lower.includes("prior")) {
    return [`Perché viene prima:`, ...rank.reasons.slice(0, 3)].join("\n");
  }
  return [
    `Per "${task.title}" farei così:`,
    `1. Prima: ${action}.`,
    `2. Prepara: ${prep}`,
    `3. Timer: ${minutes} minuti, poi scegli se continuare o parcheggiare.`,
    `Motivo: ${rank.reasons[0] || priorityText(rank.score).toLowerCase()}.`,
  ].join("\n");
}

function coachHistory(task) {
  return (Array.isArray(task.coachMessages) ? task.coachMessages : [])
    .filter((message) => !message.pending && message.text)
    .slice(-8)
    .map((message) => ({
      role: message.role === "user" ? "user" : "assistant",
      text: message.text,
    }));
}

function coachContext(task) {
  const rank = scoreTask(task);
  return {
    title: task.title,
    area: task.area,
    source: sourceText(task),
    status: task.status || "open",
    dueIso: task.due || "",
    dueHuman: formatDateTime(task.due),
    durationMinutes: Number(task.duration) || 20,
    importance: Number(task.importance) || 3,
    friction: Number(task.friction) || 3,
    consequence: Number(task.consequence) || 3,
    energyRequired: Number(task.energy) || 2,
    energyToday: Number(state.prefs.energyToday) || 2,
    blocksOtherThings: Boolean(task.blocker),
    nextAction: generatedAction(task),
    missedCount: Number(task.missedCount) || 0,
    missedReason: task.missedReason || "",
    priority: {
      score: rank.score,
      label: priorityText(rank.score),
      slot: slotText(rank.slot),
      reasons: rank.reasons,
    },
  };
}

async function requestAiCoachReply(task, userText) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), COACH_TIMEOUT_MS);
  const response = await fetch(COACH_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: controller.signal,
    body: JSON.stringify({
      userText,
      task: coachContext(task),
      history: coachHistory(task),
    }),
  }).finally(() => clearTimeout(timeoutId));
  const raw = await response.text();
  let data = {};
  try {
    data = raw ? JSON.parse(raw) : {};
  } catch {
    data = {};
  }
  if (!response.ok) {
    throw new Error(data.message || "Coach AI non collegato");
  }
  const reply = String(data.reply || "").trim();
  if (!reply) throw new Error("Risposta vuota");
  return reply;
}

function coachErrorText(error) {
  if (error?.name === "AbortError") {
    return "L'AI ci sta mettendo troppo. Non ti lascio in attesa.";
  }
  const message = String(error?.message || "").trim();
  const lower = message.toLowerCase();
  if (lower.includes("quota") || lower.includes("limite") || lower.includes("limit") || lower.includes("429")) {
    return "L'AI è collegata, ma OpenAI sta limitando questa richiesta o la quota non è disponibile.";
  }
  if (lower.includes("chiave") || lower.includes("api key") || lower.includes("401")) {
    return "La chiave AI non è valida o va rigenerata.";
  }
  if (message) {
    return `L'AI non ha risposto: ${message}`;
  }
  return "L'AI non ha risposto. Non ti lascio bloccato.";
}

function updateSegmentState() {
  $$("[data-focus-minutes]").forEach((button) => {
    button.classList.toggle("active", Number(button.dataset.focusMinutes) === Number(state.prefs.focusMinutes));
  });
  $$("[data-energy-day]").forEach((button) => {
    button.classList.toggle("active", Number(button.dataset.energyDay) === Number(state.prefs.energyToday));
  });
  $$("[data-filter]").forEach((button) => {
    button.classList.toggle("active", button.dataset.filter === state.prefs.filter);
  });
}

function createTaskFromForm(event) {
  event.preventDefault();
  const title = els.taskTitle.value.trim();
  if (!title) return;
  const dueValue = els.taskDue.value ? new Date(els.taskDue.value).toISOString() : "";
  state.tasks.push({
    id: uid(),
    title,
    area: els.taskArea.value,
    due: dueValue,
    duration: Number(els.taskDuration.value) || 20,
    importance: Number(els.taskImportance.value) || 3,
    friction: Number(els.taskFriction.value) || 3,
    consequence: Number(els.taskConsequence.value) || 3,
    energy: Number(els.taskEnergy.value) || 2,
    blocker: els.taskBlocker.checked,
    nextAction: els.taskAction.value.trim(),
    status: "open",
    source: "manual",
    createdAt: new Date().toISOString(),
  });
  addHistory(`Nuova missione: ${title}`, "quiet");
  els.taskForm.reset();
  setDefaultTaskFields();
  saveAndRender();
}

function setDefaultTaskFields() {
  els.taskArea.value = "personale";
  els.taskDuration.value = 20;
  els.taskImportance.value = 3;
  els.taskFriction.value = 3;
  els.taskConsequence.value = 3;
  els.taskEnergy.value = 2;
  els.taskBlocker.checked = false;
  els.taskAction.value = "";
  $$("[data-preset]").forEach((button) => button.classList.remove("active"));
}

function applyPreset(name) {
  const presets = {
    tiny: {
      duration: 5,
      importance: 2,
      friction: 1,
      consequence: 2,
      energy: 1,
      action: "faccio solo 5 minuti, poi decido se continuare",
    },
    urgent: {
      duration: 15,
      importance: 5,
      friction: 3,
      consequence: 5,
      energy: 2,
      action: "faccio il primo passo che evita il danno peggiore",
    },
    heavy: {
      duration: 45,
      importance: 4,
      friction: 5,
      consequence: 4,
      energy: 3,
      blocker: true,
      action: "lo spezzo e apro solo il primo pezzo",
    },
    social: {
      area: "relazioni",
      duration: 10,
      importance: 3,
      friction: 3,
      consequence: 3,
      energy: 2,
      action: "scrivo una bozza imperfetta di 2 righe",
    },
  };
  const preset = presets[name];
  if (!preset) return;
  els.taskArea.value = preset.area || els.taskArea.value;
  els.taskDuration.value = preset.duration;
  els.taskImportance.value = preset.importance;
  els.taskFriction.value = preset.friction;
  els.taskConsequence.value = preset.consequence;
  els.taskEnergy.value = preset.energy;
  els.taskBlocker.checked = Boolean(preset.blocker);
  els.taskAction.value = preset.action;
  $$("[data-preset]").forEach((button) => {
    button.classList.toggle("active", button.dataset.preset === name);
  });
}

function resetGame() {
  const confirmed = window.confirm("Iniziare una nuova partita e cancellare le quest salvate?");
  if (!confirmed) return;
  state = defaultState();
  closeCoach();
  setDefaultTaskFields();
  localStorage.removeItem(STORAGE_KEY);
  LEGACY_STORAGE_KEYS.forEach((key) => localStorage.removeItem(key));
  saveAndRender();
  showToast("Nuova partita pronta");
}

function startTimer() {
  const primary = primaryQuest();
  if (!primary) return;
  state.timer.taskId = primary.task.id;
  state.timer.running = true;
  if (!state.timer.remaining || state.timer.remaining <= 0) {
    state.timer.remaining = Number(state.prefs.focusMinutes) * 60;
  }
  saveAndRender();
  ensureTimerHandle();
}

function pauseTimer() {
  state.timer.running = false;
  saveAndRender();
}

function resetTimer() {
  stopTimer(true);
  saveAndRender();
}

function stopTimer(resetRemaining) {
  state.timer.running = false;
  state.timer.taskId = null;
  if (resetRemaining) state.timer.remaining = Number(state.prefs.focusMinutes) * 60;
}

function ensureTimerHandle() {
  clearInterval(timerHandle);
  timerHandle = setInterval(() => {
    if (!state.timer.running) return;
    state.timer.remaining -= 1;
    if (state.timer.remaining <= 0) {
      state.timer.running = false;
      state.timer.remaining = Number(state.prefs.focusMinutes) * 60;
      const task = state.tasks.find((item) => item.id === state.timer.taskId);
      const label = task ? task.title : "Sprint";
      award({ xp: 8, coins: 1, text: `Sprint completato: ${label} (+8 XP)` });
      state.timer.taskId = null;
      chime();
      showToast("Sprint completato: +8 XP");
    }
    saveState();
    renderTimer();
    renderProfile();
    renderLog();
  }, 1000);
}

function chime() {
  try {
    const ctx = new AudioContext();
    const gain = ctx.createGain();
    const osc = ctx.createOscillator();
    osc.frequency.value = 740;
    gain.gain.value = 0.05;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.16);
  } catch {
    /* Audio can be unavailable in some browsers. */
  }
}

function importIcsFile(file) {
  const reader = new FileReader();
  reader.onload = () => {
    const parsed = parseIcs(String(reader.result || ""));
    const tasks = parsed.filter(isUpcomingCalendarTask);
    const skippedPast = parsed.length - tasks.length;
    const existingExternalIds = new Set(state.tasks.map((task) => task.externalId).filter(Boolean));
    const fresh = tasks.filter((task) => !existingExternalIds.has(task.externalId));
    const cleaned = cleanupOldCalendarTasks();
    state.tasks.push(...fresh);
    const ignoredText = skippedPast || cleaned ? `, ${skippedPast + cleaned} vecchi ignorati` : "";
    addHistory(`Import calendario: ${fresh.length} missioni${ignoredText}`, "quiet");
    saveAndRender();
    showToast(`${fresh.length} eventi importati${ignoredText}`);
  };
  reader.readAsText(file);
}

function isUpcomingCalendarTask(task) {
  if (!task.due) return false;
  const due = new Date(task.due);
  if (Number.isNaN(due.getTime())) return false;
  return due >= startOfToday();
}

function cleanupOldCalendarTasks() {
  const before = state.tasks.length;
  state.tasks = state.tasks.filter((task) => {
    if (task.source !== "calendar" || task.status === "done") return true;
    return isUpcomingCalendarTask(task);
  });
  return before - state.tasks.length;
}

function parseIcs(text) {
  const normalized = text.replace(/\r?\n[ \t]/g, "");
  const blocks = normalized.match(/BEGIN:VEVENT[\s\S]*?END:VEVENT/g) || [];
  return blocks
    .map((block) => {
      const summary = readIcsProp(block, "SUMMARY") || "Evento calendario";
      const startRaw = readIcsProp(block, "DTSTART");
      const endRaw = readIcsProp(block, "DTEND");
      const uidRaw = readIcsProp(block, "UID") || `${summary}-${startRaw}`;
      const start = parseIcsDate(startRaw);
      const end = parseIcsDate(endRaw);
      const duration = start && end ? clamp(Math.round((end - start) / 60000), 10, 240) : 30;
      return {
        id: uid("cal"),
        externalId: `ics:${uidRaw}`,
        title: unescapeIcs(summary),
        area: "admin",
        due: start ? start.toISOString() : "",
        duration,
        importance: 3,
        friction: 2,
        consequence: 3,
        energy: 2,
        blocker: false,
        nextAction: "Preparati e proteggi il tempo per questo evento",
        status: "open",
        source: "calendar",
        createdAt: new Date().toISOString(),
      };
    })
    .filter((task) => task.due);
}

function readIcsProp(block, key) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = block.match(new RegExp(`^${escaped}(?:;[^:]*)?:(.*)$`, "m"));
  return match ? match[1].trim() : "";
}

function parseIcsDate(value) {
  if (!value) return null;
  const clean = value.trim();
  if (/^\d{8}$/.test(clean)) {
    const year = Number(clean.slice(0, 4));
    const month = Number(clean.slice(4, 6)) - 1;
    const day = Number(clean.slice(6, 8));
    return new Date(year, month, day, 9, 0, 0);
  }
  const match = clean.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/);
  if (!match) return null;
  const [, year, month, day, hour, minute, second, utc] = match;
  if (utc) {
    return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second)));
  }
  return new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second));
}

function unescapeIcs(value) {
  return value
    .replace(/\\n/g, " ")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\");
}

function exportBackup() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `progetto-adhd-backup-${todayKey()}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

function importBackup(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(String(reader.result || ""));
      state = mergeState(defaultState(), parsed);
      addHistory("Backup importato", "quiet");
      saveAndRender();
      showToast("Backup importato");
    } catch {
      showToast("Backup non valido");
    }
  };
  reader.readAsText(file);
}

function setAvatarFromFile(file) {
  if (!file || !file.type.startsWith("image/")) {
    showToast("Scegli un'immagine");
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    const image = new Image();
    image.onload = () => {
      const size = 256;
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      canvas.width = size;
      canvas.height = size;
      const scale = Math.max(size / image.width, size / image.height);
      const width = image.width * scale;
      const height = image.height * scale;
      const x = (size - width) / 2;
      const y = (size - height) / 2;
      ctx.drawImage(image, x, y, width, height);
      state.profile.avatar = canvas.toDataURL("image/jpeg", 0.86);
      saveAndRender();
      showToast("Immagine profilo aggiornata");
    };
    image.src = String(reader.result || "");
  };
  reader.readAsDataURL(file);
}

function activePrimaryId() {
  const primary = primaryQuest();
  return primary ? primary.task.id : null;
}

function shortText(text, max) {
  if (!text) return "";
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function bindEvents() {
  els.googleLogin?.addEventListener("click", signInWithGoogle);

  els.profileName.addEventListener("change", () => {
    state.profile.name = els.profileName.value.trim();
    saveAndRender();
  });

  els.avatarButton.addEventListener("click", () => els.avatarInput.click());
  els.avatarInput.addEventListener("change", () => {
    const file = els.avatarInput.files?.[0];
    if (file) setAvatarFromFile(file);
    els.avatarInput.value = "";
  });

  els.taskForm.addEventListener("submit", createTaskFromForm);

  $$("[data-preset]").forEach((button) => {
    button.addEventListener("click", () => applyPreset(button.dataset.preset));
  });

  els.startFocus.addEventListener("click", startTimer);
  els.pauseFocus.addEventListener("click", pauseTimer);
  els.resetFocus.addEventListener("click", resetTimer);
  els.completePrimary.addEventListener("click", () => {
    const id = activePrimaryId();
    if (id) completeTask(id);
  });
  els.parkPrimary.addEventListener("click", () => {
    const id = activePrimaryId();
    if (id) parkTask(id);
  });
  els.missPrimary.addEventListener("click", () => {
    const id = activePrimaryId();
    if (id) missTask(id);
  });
  els.splitPrimary.addEventListener("click", () => {
    const id = activePrimaryId();
    if (id) splitTask(id);
  });
  els.coachPrimary.addEventListener("click", () => {
    const id = activePrimaryId();
    if (id) openCoach(id);
  });
  els.missionState.addEventListener("click", (event) => {
    const guide = event.target.closest("[data-guide-task-id]");
    const id = guide?.dataset.guideTaskId;
    if (id) openCoach(id);
  });

  $$("[data-focus-minutes]").forEach((button) => {
    button.addEventListener("click", () => {
      state.prefs.focusMinutes = Number(button.dataset.focusMinutes);
      state.timer.remaining = state.prefs.focusMinutes * 60;
      saveAndRender();
    });
  });

  $$("[data-energy-day]").forEach((button) => {
    button.addEventListener("click", () => {
      state.prefs.energyToday = Number(button.dataset.energyDay);
      saveAndRender();
    });
  });

  $$("[data-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      state.prefs.filter = button.dataset.filter;
      saveAndRender();
    });
  });

  els.capacityHours.addEventListener("input", () => {
    state.prefs.capacityHours = Number(els.capacityHours.value);
    saveAndRender();
  });

  els.taskList.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-action]");
    const card = event.target.closest("[data-task-id]");
    const id = card?.dataset.taskId;
    if (!id) return;
    if (!button) {
      openCoach(id);
      return;
    }
    const action = button.dataset.action;
    if (action === "coach") openCoach(id);
    if (action === "done") completeTask(id);
    if (action === "miss") missTask(id);
    if (action === "park") parkTask(id);
    if (action === "delete") deleteTask(id);
    if (action === "restore") restoreTask(id);
  });

  els.taskList.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    const card = event.target.closest("[data-task-id]");
    const id = card?.dataset.taskId;
    if (!id) return;
    event.preventDefault();
    openCoach(id);
  });

  els.dayMap.addEventListener("click", (event) => {
    const item = event.target.closest("[data-map-task-id]");
    const id = item?.dataset.mapTaskId;
    if (id) openCoach(id);
  });

  els.icsButton.addEventListener("click", () => els.icsInput.click());
  els.icsInput.addEventListener("change", () => {
    const file = els.icsInput.files?.[0];
    if (file) importIcsFile(file);
    els.icsInput.value = "";
  });

  els.exportButton.addEventListener("click", exportBackup);
  els.backupButton.addEventListener("click", () => els.backupInput.click());
  els.backupInput.addEventListener("change", () => {
    const file = els.backupInput.files?.[0];
    if (file) importBackup(file);
    els.backupInput.value = "";
  });

  els.clearDone.addEventListener("click", () => {
    const before = state.tasks.length;
    state.tasks = state.tasks.filter((task) => task.status !== "done");
    addHistory(`Ripulite ${before - state.tasks.length} missioni fatte`, "quiet");
    saveAndRender();
  });

  els.newRun.addEventListener("click", resetGame);

  els.closeCoach.addEventListener("click", closeCoach);
  els.clearCoach.addEventListener("click", () => {
    const task = taskById(selectedCoachTaskId);
    if (!task) return;
    task.coachMessages = [];
    saveState();
    renderCoach();
  });
  els.coachBackdrop.addEventListener("click", closeCoach);
  els.coachForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const task = taskById(selectedCoachTaskId);
    const text = els.coachInput.value.trim();
    if (!task || !text) return;
    if ((Array.isArray(task.coachMessages) ? task.coachMessages : []).some((message) => message.pending)) {
      showToast("Il coach sta già preparando una risposta");
      return;
    }
    const pendingId = uid("coach");
    task.coachMessages = Array.isArray(task.coachMessages) ? task.coachMessages : [];
    task.coachMessages.push({ role: "user", text, at: new Date().toISOString() });
    task.coachMessages.push({
      id: pendingId,
      role: "assistant",
      mode: "ai",
      pending: true,
      text: "Sto leggendo la quest e preparo una risposta precisa...",
      at: new Date().toISOString(),
    });
    task.coachMessages = task.coachMessages.slice(-COACH_HISTORY_LIMIT);
    task.aiFallback = false;
    els.coachInput.value = "";
    if (els.coachSend) els.coachSend.disabled = true;
    saveState();
    renderCoach();

    try {
      const reply = await requestAiCoachReply(task, text);
      const freshTask = taskById(task.id);
      if (!freshTask) return;
      const pending = freshTask.coachMessages.find((message) => message.id === pendingId);
      if (pending) {
        pending.text = reply;
        pending.pending = false;
        pending.mode = "ai";
      }
      freshTask.aiFallback = false;
      coachAiReady = true;
    } catch (error) {
      const freshTask = taskById(task.id);
      if (!freshTask) return;
      const pending = freshTask.coachMessages.find((message) => message.id === pendingId);
      if (pending) {
        pending.text = `${coachErrorText(error)}\n\nGuida immediata:\n${coachReply(freshTask, text)}`;
        pending.pending = false;
        pending.mode = "offline";
      }
      freshTask.aiFallback = true;
      coachAiReady = false;
      showToast("Risposta AI non disponibile: uso guida locale");
    } finally {
      if (els.coachSend) els.coachSend.disabled = false;
      saveState();
      if (selectedCoachTaskId === task.id) renderCoach();
    }
  });

  els.noReason.addEventListener("change", renderNoScript);
  els.copyNo.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(els.noScript.value);
      showToast("Testo copiato");
    } catch {
      els.noScript.select();
      document.execCommand("copy");
      showToast("Testo copiato");
    }
  });

  els.scoreNo.addEventListener("click", () => {
    award({ xp: 25, coins: 4, text: "Allenamento del no completato (+25 XP)" });
    saveAndRender();
    showToast("+25 XP per aver protetto la capienza");
  });

  els.rewardGrid.addEventListener("click", (event) => {
    const card = event.target.closest("[data-theme-choice]");
    if (!card) return;
    const theme = card.dataset.themeChoice;
    if (!theme) return;
    state.profile.theme = state.profile.theme === theme ? "default" : theme;
    saveAndRender();
  });
}

function setupStarfield() {
  const canvas = els.starfield;
  const ctx = canvas.getContext("2d");
  const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.floor(window.innerWidth * ratio);
    canvas.height = Math.floor(window.innerHeight * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    const count = Math.min(130, Math.max(55, Math.floor(window.innerWidth / 10)));
    stars = Array.from({ length: count }, () => ({
      x: Math.random() * window.innerWidth,
      y: Math.random() * window.innerHeight,
      size: Math.random() * 1.8 + 0.4,
      speed: Math.random() * 0.28 + 0.04,
      hue: ["#39e89a", "#ffd166", "#ff4f86", "#68a9ff"][Math.floor(Math.random() * 4)],
    }));
    draw();
  }

  function draw() {
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    stars.forEach((star) => {
      ctx.beginPath();
      ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
      ctx.fillStyle = star.hue;
      ctx.globalAlpha = 0.35 + star.size * 0.16;
      ctx.fill();
      ctx.globalAlpha = 1;
      if (!prefersReduced) {
        star.y += star.speed;
        if (star.y > window.innerHeight + 4) {
          star.y = -4;
          star.x = Math.random() * window.innerWidth;
        }
      }
    });
    if (!prefersReduced) requestAnimationFrame(draw);
  }

  resize();
  window.addEventListener("resize", resize);
}

bindEvents();
setDefaultTaskFields();
cleanupOldCalendarTasks();
render();
initFirebaseSync();
setupStarfield();
ensureTimerHandle();
