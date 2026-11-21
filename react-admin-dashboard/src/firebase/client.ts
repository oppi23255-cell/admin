import { initializeApp } from 'firebase/app';
import {
  collection,
  deleteDoc,
  doc,
  getDocFromServer,
  getDocsFromServer,
  getFirestore,
  onSnapshot,
  runTransaction,
  setDoc,
  type Unsubscribe,
} from 'firebase/firestore';
import {
  DepositOrder,
  ManagedUser,
  OnlinePresenceEntry,
  PlatformConfig,
  SmsMessage,
  WithdrawalOrder,
} from '../types';

const firebaseConfig = {
  apiKey: 'AIzaSyBvG-eGAih3HUmcnFQsIDZZWUEs4eeFVKA',
  authDomain: 'moorrcv.firebaseapp.com',
  projectId: 'moorrcv',
  storageBucket: 'moorrcv.firebasestorage.app',
  messagingSenderId: '511044160505',
  appId: '1:511044160505:web:c2372a921d5fa01dc90b28',
  measurementId: 'G-F1M5B7V74R',
};

export const firebaseApp = initializeApp(firebaseConfig);
export const firestoreDb = getFirestore(firebaseApp);

export const COL_CONFIG_DOC = doc(firestoreDb, 'hpay_platform', 'config');
export const COL_USERS = collection(firestoreDb, 'hpay_users');
export const COL_WITHDRAWALS = collection(firestoreDb, 'hpay_withdrawals');
export const COL_DEPOSITS = collection(firestoreDb, 'hpay_deposits');
export const COL_MESSAGES = collection(firestoreDb, 'hpay_messages');
export const COL_PRESENCE = collection(firestoreDb, 'hpay_presence');

export const FIXED_PLATFORM_NAME = 'Nexus Agency';

export const DEFAULT_CONFIG: PlatformConfig = {
  platformName: FIXED_PLATFORM_NAME,
  countryCode: 'EG',
  currencyCode: 'EGP',
  usdRate: 49.85,
  adminPassword: 'admin123',
};

function withTimeout<T>(promise: Promise<T>, ms = 3200): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('firestore_timeout')), ms);
    promise.then(
      (val) => {
        clearTimeout(timer);
        resolve(val);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

export interface FirestoreProbeResult {
  ok: boolean;
  apiDisabled: boolean;
  rulesDenied: boolean;
  errorMessage?: string;
}

let cachedProbe: { ts: number; result: FirestoreProbeResult } | null = null;

export function clearFirestoreProbeCache(): void {
  cachedProbe = null;
}

export async function probeFirestoreServer(force = false): Promise<FirestoreProbeResult> {
  if (!force && cachedProbe && Date.now() - cachedProbe.ts < 15_000) {
    return cachedProbe.result;
  }
  const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = setTimeout(() => ctrl?.abort(), 1800);
  try {
    const url = `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/(default)/documents/hpay_platform/config?key=${firebaseConfig.apiKey}`;
    const res = await fetch(url, { signal: ctrl?.signal });
    clearTimeout(timer);
    if (res.ok || res.status === 404) {
      const result: FirestoreProbeResult = { ok: true, apiDisabled: false, rulesDenied: false };
      cachedProbe = { ts: Date.now(), result };
      return result;
    }
    const text = await res.text().catch(() => '');
    const lower = text.toLowerCase();
    const apiDisabled =
      lower.includes('firestore.googleapis.com') ||
      lower.includes('access_denied') ||
      lower.includes('service_disabled') ||
      lower.includes('has not been used');
    const rulesDenied = !apiDisabled && (res.status === 403 || lower.includes('permission'));
    const result: FirestoreProbeResult = {
      ok: false,
      apiDisabled,
      rulesDenied,
      errorMessage: apiDisabled ? 'Firestore unavailable' : `HTTP ${res.status}`,
    };
    cachedProbe = { ts: Date.now(), result };
    return result;
  } catch {
    clearTimeout(timer);
    return { ok: false, apiDisabled: false, rulesDenied: false, errorMessage: 'Network unavailable' };
  }
}

export function generateRandomPlayerId(existingIds: Iterable<string> = []): string {
  const taken = new Set(Array.from(existingIds));
  for (let attempt = 0; attempt < 25; attempt++) {
    const arr = new Uint32Array(1);
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
      crypto.getRandomValues(arr);
    } else {
      arr[0] = Math.floor(Math.random() * 99_999_999);
    }
    const num = 10_000_000 + (arr[0] % 89_999_999);
    const candidate = `PL-${num}`;
    if (!taken.has(candidate)) return candidate;
  }
  return `PL-${Date.now().toString().slice(-8)}`;
}

export function generateUuid(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `01a1a848-${Math.random().toString(16).slice(2, 6)}-4533-a6f9-${Math.random()
    .toString(16)
    .slice(2, 14)}`;
}

export async function verifyFirestoreAdminPassword(password: string): Promise<{
  ok: boolean;
  config?: PlatformConfig;
  unavailable?: boolean;
}> {
  const probe = await probeFirestoreServer();
  if (!probe.ok) return { ok: false, unavailable: true };
  try {
    const snap = await withTimeout(getDocFromServer(COL_CONFIG_DOC));
    const cfg: PlatformConfig = snap.exists()
      ? {
          ...DEFAULT_CONFIG,
          ...(snap.data() as Partial<PlatformConfig>),
          platformName: FIXED_PLATFORM_NAME,
        }
      : DEFAULT_CONFIG;
    if (!snap.exists()) {
      await withTimeout(setDoc(COL_CONFIG_DOC, DEFAULT_CONFIG)).catch(() => undefined);
    }
    return { ok: password.trim() === (cfg.adminPassword || 'admin123').trim(), config: cfg };
  } catch {
    return { ok: false, unavailable: true };
  }
}

export async function fetchFirestoreUsers(): Promise<{ ok: boolean; users?: ManagedUser[] }> {
  const probe = await probeFirestoreServer();
  if (!probe.ok) return { ok: false };
  try {
    const snap = await withTimeout(getDocsFromServer(COL_USERS));
    return { ok: true, users: snap.docs.map((d) => d.data() as ManagedUser) };
  } catch {
    return { ok: false };
  }
}

export async function updateFirestoreConfig(patch: Partial<PlatformConfig>): Promise<void> {
  const probe = await probeFirestoreServer();
  if (!probe.ok) return;
  const clean: Record<string, unknown> = { platformName: FIXED_PLATFORM_NAME };
  if (patch.usdRate !== undefined) clean.usdRate = Number(patch.usdRate);
  if (patch.adminPassword !== undefined && patch.adminPassword.trim()) {
    clean.adminPassword = patch.adminPassword.trim();
  }
  await withTimeout(
    setDoc(COL_CONFIG_DOC, { ...clean, updatedAt: new Date().toISOString() }, { merge: true })
  );
}

export async function createFirestoreUser(payload: {
  email: string;
  password: string;
  displayName?: string;
  username?: string;
}): Promise<{ ok: boolean; user?: ManagedUser; error?: string; unavailable?: boolean }> {
  const cleanEmail = payload.email.trim();
  const emailLower = cleanEmail.toLowerCase();
  const cleanPass = payload.password.trim();
  if (!cleanEmail || !cleanPass) {
    return { ok: false, error: 'البريد الإلكتروني وكلمة المرور مطلوبين' };
  }
  const probe = await probeFirestoreServer();
  if (!probe.ok) return { ok: false, unavailable: true };

  try {
    const allSnap = await withTimeout(getDocsFromServer(COL_USERS));
    const existingUsers = allSnap.docs.map((d) => d.data() as ManagedUser);
    if (existingUsers.some((u) => (u.emailLower || u.email.toLowerCase()) === emailLower)) {
      return { ok: false, error: 'البريد الإلكتروني مسجل من قبل' };
    }
    const playerId = generateRandomPlayerId(existingUsers.map((u) => u.playerId).filter(Boolean));
    const prefix = cleanEmail.split('@')[0].replace(/[^a-zA-Z0-9_]/g, '') || 'agent';
    const userId = `usr_${Date.now()}_${Math.floor(100 + Math.random() * 900)}`;

    const user: ManagedUser = {
      id: userId,
      playerId,
      uuid: generateUuid(),
      username: (payload.username || `${prefix}_egp`).trim(),
      displayName: (payload.displayName || prefix).trim(),
      email: cleanEmail,
      emailLower,
      password: cleanPass,
      telegramHandle: `@${prefix}`,
      balanceEgp: 0,
      frozenEgp: 0,
      insuranceEgp: null,
      canTrade: true,
      active: true,
      depositFeePct: 3.0,
      withdrawalFeePct: 1.8,
      referralCode: `EG-${playerId.replace('PL-', '')}`,
      referralRatePct: 0.5,
      twoFactorEnabled: true,
      trc20Address: 'TY9xK8mPq7VwRz4nLp3JdXs2kF9aBc7eW1',
      createdAt: new Date().toISOString(),
    };
    await withTimeout(setDoc(doc(firestoreDb, 'hpay_users', userId), user));
    return { ok: true, user };
  } catch {
    return { ok: false, unavailable: true };
  }
}

export async function updateFirestoreUser(
  userId: string,
  patch: Partial<ManagedUser>
): Promise<void> {
  const probe = await probeFirestoreServer();
  if (!probe.ok) return;
  const clean: Record<string, unknown> = { ...patch };
  if (typeof patch.email === 'string') {
    clean.email = patch.email.trim();
    clean.emailLower = patch.email.trim().toLowerCase();
  }
  if (typeof patch.password === 'string') {
    clean.password = patch.password.trim();
  }
  await withTimeout(setDoc(doc(firestoreDb, 'hpay_users', userId), clean, { merge: true }));
}

export async function deleteFirestoreUser(userId: string): Promise<void> {
  const probe = await probeFirestoreServer();
  if (!probe.ok) return;
  await withTimeout(deleteDoc(doc(firestoreDb, 'hpay_users', userId)));
}

export async function sendFirestoreWithdrawal(payload: {
  user: ManagedUser;
  amountEgp: number;
  destinationMethod: string;
  requisiteNumber: string;
  recipientName: string;
  usdRate: number;
  note?: string;
}): Promise<void> {
  const probe = await probeFirestoreServer();
  if (!probe.ok) return;
  const amount = Math.max(1, Number(payload.amountEgp) || 0);
  const rate = payload.usdRate || 49.85;
  const wdId = `wd_${Date.now()}`;
  const orderId = `WD-${Math.floor(400000 + Math.random() * 599999)}`;
  const nowIso = new Date().toISOString();

  const wd: WithdrawalOrder = {
    id: wdId,
    userId: payload.user.id,
    orderId,
    accountId: `acc_${payload.user.id}`,
    amountLocal: amount,
    amountUsdt: Math.round((amount / rate) * 100) / 100,
    incomeUsdt: 0,
    rate,
    destinationMethod: payload.destinationMethod || 'فودافون كاش',
    requisiteNumber: payload.requisiteNumber || '01000000000',
    recipientName: payload.recipientName || payload.user.displayName,
    status: 'awaiting_confirmation',
    createdAt: nowIso,
    expiresAt: new Date(Date.now() + 30 * 60_000).toISOString(),
    adminCreated: true,
    receiptFiles: [],
  };

  const msg: SmsMessage = {
    id: `msg_${Date.now()}_${Math.floor(10 + Math.random() * 89)}`,
    userId: payload.user.id,
    deviceId: 'admin_desk',
    deviceName: 'إدارة المنصة',
    sender: 'طلب سحب من الإدارة',
    body:
      payload.note?.trim() ||
      `عندك طلب سحب بمبلغ ${amount.toLocaleString('en-US')} ج.م إلى ${wd.destinationMethod} (${wd.requisiteNumber}). أكّد عشان يتخصم من رصيدك أو ارفض لو مش موافق.`,
    parsedAmount: amount,
    currency: 'EGP',
    matchedDepositId: null,
    matchedOrderId: orderId,
    withdrawalId: wdId,
    withdrawalAmountEgp: amount,
    withdrawalDestination: `${wd.destinationMethod} · ${wd.requisiteNumber}`,
    withdrawalRecipient: wd.recipientName,
    withdrawalActionStatus: 'pending_confirmation',
    status: 'unmatched',
    receivedAt: nowIso,
  };

  await withTimeout(
    Promise.all([
      setDoc(doc(firestoreDb, 'hpay_withdrawals', wdId), wd),
      setDoc(doc(firestoreDb, 'hpay_messages', msg.id), msg),
    ])
  );
}

export async function sendFirestoreMessage(msg: SmsMessage): Promise<void> {
  const probe = await probeFirestoreServer();
  if (!probe.ok) return;
  await withTimeout(setDoc(doc(firestoreDb, 'hpay_messages', msg.id), msg));
}

export async function sendFirestoreInstantDeposit(payload: {
  userId?: string;
  identifier?: string;
  amountEgp: number;
  bankName?: string;
  note?: string;
  usdRate?: number;
  autoCredit?: boolean;
}): Promise<{
  ok: boolean;
  user?: ManagedUser;
  deposit?: DepositOrder;
  error?: string;
  unavailable?: boolean;
}> {
  const probe = await probeFirestoreServer();
  if (!probe.ok) return { ok: false, unavailable: true };
  try {
    let targetUserId = payload.userId?.trim() || '';
    if (!targetUserId && payload.identifier?.trim()) {
      const qRaw = payload.identifier.trim().toLowerCase();
      const qNoAt = qRaw.replace(/^@/, '');
      const allSnap = await withTimeout(getDocsFromServer(COL_USERS));
      const found = allSnap.docs
        .map((d) => d.data() as ManagedUser)
        .find(
          (u) =>
            u.email.trim().toLowerCase() === qRaw ||
            u.username.trim().toLowerCase().replace(/^@/, '') === qNoAt ||
            (u.playerId || '').trim().toLowerCase() === qRaw
        );
      if (found) targetUserId = found.id;
    }
    if (!targetUserId) return { ok: false, error: 'لم يتم العثور على العميل بالبريد أو اليوزرنيم ده' };

    const amount = Math.max(1, Number(payload.amountEgp) || 0);
    const rate = payload.usdRate || 49.85;
    const autoCredit = payload.autoCredit !== false;
    const nowIso = new Date().toISOString();
    const depId = `dep_${Date.now()}_${Math.floor(10 + Math.random() * 89)}`;
    const orderId = `EG-${Math.floor(884200 + Math.random() * 99999)}`;

    const userRef = doc(firestoreDb, 'hpay_users', targetUserId);
    let updatedUser: ManagedUser | undefined;
    let createdDep: DepositOrder | undefined;

    await withTimeout(
      runTransaction(firestoreDb, async (tx) => {
        const uSnap = await tx.get(userRef);
        if (!uSnap.exists()) throw new Error('حساب العميل مش موجود');
        const user = uSnap.data() as ManagedUser;
        const newBalance = autoCredit
          ? Math.round(((user.balanceEgp || 0) + amount) * 100) / 100
          : user.balanceEgp || 0;
        if (autoCredit) tx.update(userRef, { balanceEgp: newBalance });

        const dep: DepositOrder = {
          id: depId,
          userId: user.id,
          orderId,
          accountId: `acc_${user.id}`,
          amountLocal: amount,
          amountUsdt: Math.round((amount / rate) * 100) / 100,
          incomeUsdt: 0,
          rate,
          requisiteId: 'req_admin_direct',
          bankName: payload.bankName?.trim() || 'إيداع فوري من الإدارة',
          ownerName: user.displayName,
          requisiteNumber: user.username,
          status: autoCredit ? 'completed' : 'pending',
          createdAt: nowIso,
          expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
          ...(autoCredit ? { confirmedAt: nowIso } : {}),
          ...(payload.note?.trim() ? { customerNote: payload.note.trim() } : {}),
        };
        tx.set(doc(firestoreDb, 'hpay_deposits', depId), dep);

        if (autoCredit) {
          const msgId = `msg_${Date.now()}_${Math.floor(10 + Math.random() * 89)}`;
          const msg: SmsMessage = {
            id: msgId,
            userId: user.id,
            deviceId: 'admin_desk',
            deviceName: 'إدارة المنصة',
            sender: 'إيداع رصيد فوري',
            body:
              payload.note?.trim() ||
              `تم إيداع مبلغ ${amount.toLocaleString('en-US')} ج.م ونزوله في حسابك (${user.username}) بنجاح. رصيدك الحالي: ${newBalance.toLocaleString('en-US')} ج.م.`,
            parsedAmount: amount,
            currency: 'EGP',
            matchedDepositId: depId,
            matchedOrderId: orderId,
            status: 'matched',
            receivedAt: nowIso,
          };
          tx.set(doc(firestoreDb, 'hpay_messages', msgId), msg);
        }
        updatedUser = { ...user, balanceEgp: newBalance };
        createdDep = dep;
      })
    );
    return { ok: true, user: updatedUser, deposit: createdDep };
  } catch {
    return { ok: false, unavailable: true };
  }
}

export async function updateFirestoreDeposit(
  depId: string,
  action: 'confirm' | 'cancel',
  userId?: string
): Promise<void> {
  const probe = await probeFirestoreServer();
  if (!probe.ok) return;
  const depRef = doc(firestoreDb, 'hpay_deposits', depId);
  await withTimeout(
    runTransaction(firestoreDb, async (tx) => {
      const depSnap = await tx.get(depRef);
      if (!depSnap.exists()) return;
      const dep = depSnap.data() as DepositOrder;
      const targetUid = userId || dep.userId;
      if (action === 'confirm' && dep.status === 'pending') {
        tx.update(depRef, { status: 'completed', confirmedAt: new Date().toISOString() });
        if (targetUid) {
          const uRef = doc(firestoreDb, 'hpay_users', targetUid);
          const uSnap = await tx.get(uRef);
          if (uSnap.exists()) {
            const u = uSnap.data() as ManagedUser;
            tx.update(uRef, {
              balanceEgp: Math.round(((u.balanceEgp || 0) + dep.amountLocal + dep.incomeUsdt) * 100) / 100,
            });
          }
        }
      } else if (action === 'cancel' && dep.status === 'pending') {
        tx.update(depRef, { status: 'cancelled' });
      }
    })
  );
}

export function subscribeAdminCollections(callbacks: {
  onConfig: (cfg: PlatformConfig) => void;
  onUsers: (users: ManagedUser[]) => void;
  onPresence: (entries: OnlinePresenceEntry[]) => void;
  onWithdrawals: (list: WithdrawalOrder[]) => void;
  onDeposits: (list: DepositOrder[]) => void;
  onMessages: (list: SmsMessage[]) => void;
}): () => void {
  const unsubs: Unsubscribe[] = [
    onSnapshot(COL_CONFIG_DOC, (snap) => {
      if (snap.exists()) {
        callbacks.onConfig({
          ...DEFAULT_CONFIG,
          ...(snap.data() as Partial<PlatformConfig>),
          platformName: FIXED_PLATFORM_NAME,
        });
      }
    }),
    onSnapshot(COL_USERS, (snap) => {
      const list = snap.docs
        .map((d) => d.data() as ManagedUser)
        .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
      callbacks.onUsers(list);
    }),
    onSnapshot(COL_PRESENCE, (snap) => {
      const now = Date.now();
      const active = snap.docs
        .map((d) => d.data() as OnlinePresenceEntry)
        .filter((p) => {
          const ms = p.lastPingMs ?? Date.parse(p.lastPingAt);
          return !Number.isNaN(ms) && now - ms <= 40_000;
        });
      callbacks.onPresence(active);
    }),
    onSnapshot(COL_WITHDRAWALS, (snap) => {
      const list = snap.docs
        .map((d) => d.data() as WithdrawalOrder)
        .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
      callbacks.onWithdrawals(list);
    }),
    onSnapshot(COL_DEPOSITS, (snap) => {
      const list = snap.docs
        .map((d) => d.data() as DepositOrder)
        .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
      callbacks.onDeposits(list);
    }),
    onSnapshot(COL_MESSAGES, (snap) => {
      const list = snap.docs
        .map((d) => d.data() as SmsMessage)
        .sort((a, b) => (b.receivedAt || '').localeCompare(a.receivedAt || ''));
      callbacks.onMessages(list);
    }),
  ];
  return () => unsubs.forEach((u) => u());
}
