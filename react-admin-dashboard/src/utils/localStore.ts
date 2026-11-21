import { ManagedUser, PlatformState, SmsMessage, WithdrawalOrder } from '../types';

const STORAGE_KEY = 'egyptpay_trader_state_v3';
export const FIXED_PLATFORM_NAME = 'Nexus Agency';

function minsFromNow(m: number): string {
  return new Date(Date.now() + m * 60_000).toISOString();
}

export function createSeedAdminState(): PlatformState {
  return {
    config: {
      platformName: FIXED_PLATFORM_NAME,
      countryCode: 'EG',
      currencyCode: 'EGP',
      usdRate: 49.85,
      adminPassword: 'admin123',
    },
    users: [],
    onlinePresence: [],
    onlineCount: 0,
    deposits: [],
    withdrawals: [],
    messages: [],
    settings: {
      lang: 'ar',
      tzOffset: 2,
      dateFormat: 'DD.MM.YYYY',
      clockFormat: '24h',
      notificationPosition: 'bottom-left',
    },
  };
}

export function normalizeAdminUser(raw: Partial<ManagedUser>): ManagedUser {
  const email = String(raw.email || '').trim();
  const prefix = email.split('@')[0].replace(/[^a-zA-Z0-9_]/g, '') || 'agent';
  const id = String(raw.id || `usr_${Date.now()}`).trim();
  const playerId =
    typeof raw.playerId === 'string' && raw.playerId.trim()
      ? raw.playerId.trim()
      : `PL-${id.replace(/\D/g, '').slice(-8).padStart(8, '4')}`;
  const bal = Number(raw.balanceEgp);
  const frozen = Number(raw.frozenEgp);
  return {
    id,
    playerId,
    uuid:
      typeof raw.uuid === 'string' && raw.uuid.trim()
        ? raw.uuid.trim()
        : `01a1a848-${Math.random().toString(16).slice(2, 6)}-4533-a6f9-${Math.random().toString(16).slice(2, 14)}`,
    username: String(raw.username || `${prefix}_egp`).trim(),
    displayName: String(raw.displayName || prefix).trim(),
    email,
    emailLower: email.toLowerCase(),
    password: String(raw.password || '').trim(),
    telegramHandle: String(raw.telegramHandle || `@${prefix}`).trim(),
    balanceEgp: Number.isFinite(bal) ? bal : 0,
    frozenEgp: Number.isFinite(frozen) ? frozen : 0,
    insuranceEgp: raw.insuranceEgp ?? null,
    canTrade: raw.canTrade !== false,
    active: raw.active !== false,
    depositFeePct: Number.isFinite(Number(raw.depositFeePct)) ? Number(raw.depositFeePct) : 3.0,
    withdrawalFeePct: Number.isFinite(Number(raw.withdrawalFeePct)) ? Number(raw.withdrawalFeePct) : 1.8,
    referralCode: String(raw.referralCode || `EG-${playerId.replace('PL-', '')}`).trim(),
    referralRatePct: Number.isFinite(Number(raw.referralRatePct)) ? Number(raw.referralRatePct) : 0.5,
    twoFactorEnabled: raw.twoFactorEnabled !== false,
    trc20Address: String(raw.trc20Address || 'TY9xK8mPq7VwRz4nLp3JdXs2kF9aBc7eW1').trim(),
    createdAt: String(raw.createdAt || new Date().toISOString()),
    ...(raw.lastSeenAt ? { lastSeenAt: raw.lastSeenAt } : {}),
  };
}

export function loadAdminDb(): PlatformState {
  const seed = createSeedAdminState();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<PlatformState>;
      if (parsed.config && Array.isArray(parsed.users)) {
        return {
          ...seed,
          ...parsed,
          config: {
            ...seed.config,
            ...parsed.config,
            platformName: FIXED_PLATFORM_NAME,
          },
          settings: {
            ...seed.settings,
            ...(parsed.settings || {}),
          },
          users: parsed.users.map(normalizeAdminUser),
          onlinePresence: Array.isArray(parsed.onlinePresence) ? parsed.onlinePresence : [],
          deposits: Array.isArray(parsed.deposits) ? parsed.deposits : [],
          withdrawals: Array.isArray(parsed.withdrawals) ? parsed.withdrawals : [],
          messages: Array.isArray(parsed.messages) ? parsed.messages : [],
        };
      }
    }
  } catch {
    // ignore
  }
  saveAdminDb(seed);
  return seed;
}

export function saveAdminDb(db: PlatformState): void {
  try {
    db.config.platformName = FIXED_PLATFORM_NAME;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
  } catch {
    // ignore
  }
}

export function upsertUserInLocalDb(rawUser: ManagedUser): PlatformState {
  const user = normalizeAdminUser(rawUser);
  const db = loadAdminDb();
  const list = db.users ?? [];
  const idx = list.findIndex((u) => u.id === user.id);
  if (idx >= 0) list[idx] = user;
  else list.unshift(user);
  db.users = list;
  saveAdminDb(db);
  return db;
}

export function runLocalAdminAction(
  action: string,
  body?: Record<string, unknown>
): Record<string, unknown> {
  const db = loadAdminDb();

  if (action === 'auth' && body) {
    const pass = String(body.password || '').trim();
    if (pass === (db.config.adminPassword || 'admin123').trim()) {
      return { ok: true, state: db };
    }
    return { ok: false, error: 'كلمة مرور الأدمن مش صح' };
  }

  if (action === 'state') {
    return { ok: true, state: db };
  }

  if (action === 'create_user' && body) {
    const email = String(body.email || '').trim();
    const password = String(body.password || '').trim();
    if (!email || !password) return { ok: false, error: 'البريد وكلمة المرور مطلوبين' };
    if ((db.users ?? []).some((u) => u.email.trim().toLowerCase() === email.toLowerCase())) {
      return { ok: false, error: 'البريد الإلكتروني مسجل من قبل' };
    }
    const prefix = email.split('@')[0].replace(/[^a-zA-Z0-9_]/g, '') || 'agent';
    const taken = new Set((db.users ?? []).map((u) => u.playerId).filter(Boolean));
    let playerId =
      typeof body.playerId === 'string' && body.playerId.trim()
        ? body.playerId.trim()
        : `PL-${Math.floor(10000000 + Math.random() * 89999999)}`;
    while (!body.playerId && taken.has(playerId)) {
      playerId = `PL-${Math.floor(10000000 + Math.random() * 89999999)}`;
    }
    const user: ManagedUser = {
      id: typeof body.id === 'string' && body.id.trim() ? body.id.trim() : `usr_${Date.now()}`,
      playerId,
      uuid:
        typeof body.uuid === 'string' && body.uuid.trim()
          ? body.uuid.trim()
          : `01a1a848-${Math.random().toString(16).slice(2, 6)}-4533-a6f9-${Math.random()
              .toString(16)
              .slice(2, 14)}`,
      username: String(body.username || `${prefix}_egp`).trim(),
      displayName: String(body.displayName || prefix).trim(),
      email,
      emailLower: email.toLowerCase(),
      password,
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
    db.users = [user, ...(db.users ?? [])];
    saveAdminDb(db);
    return { ok: true, user, state: db };
  }

  if (action === 'update_user' && body) {
    const uid = String(body.userId || '');
    const patch = (body.patch || {}) as Partial<ManagedUser>;
    const user = (db.users ?? []).find((u) => u.id === uid);
    if (user) {
      if (typeof patch.email === 'string') {
        patch.email = patch.email.trim();
        patch.emailLower = patch.email.toLowerCase();
      }
      if (typeof patch.password === 'string') patch.password = patch.password.trim();
      Object.assign(user, patch);
      saveAdminDb(db);
      return { ok: true, user, state: db };
    }
    return { ok: false, error: 'اللاعب غير موجود' };
  }

  if (action === 'delete_user' && body) {
    const uid = String(body.userId || '');
    db.users = (db.users ?? []).filter((u) => u.id !== uid);
    saveAdminDb(db);
    return { ok: true, state: db };
  }

  if (action === 'send_withdrawal' && body) {
    const uid = String(body.userId || '');
    const user = (db.users ?? []).find((u) => u.id === uid);
    if (!user) return { ok: false, error: 'اختر مستخدم صحيح أولاً' };
    const amount = Math.max(1, Number(body.amountEgp) || 0);
    const rate = db.config.usdRate || 49.85;
    const wdId = `wd_${Date.now()}`;
    const orderId = `WD-${Math.floor(400000 + Math.random() * 599999)}`;
    const nowIso = new Date().toISOString();
    const methodLabel = String(body.destinationMethod || 'فودافون كاش');
    const reqNum = String(body.requisiteNumber || '01000000000');
    const recName = String(body.recipientName || user.displayName);

    const wd: WithdrawalOrder = {
      id: wdId,
      userId: user.id,
      orderId,
      accountId: `acc_${user.id}`,
      amountLocal: amount,
      amountUsdt: Math.round((amount / rate) * 100) / 100,
      incomeUsdt: 0,
      rate,
      destinationMethod: methodLabel,
      requisiteNumber: reqNum,
      recipientName: recName,
      status: 'awaiting_confirmation',
      createdAt: nowIso,
      expiresAt: minsFromNow(30),
      adminCreated: true,
      receiptFiles: [],
    };
    db.withdrawals.unshift(wd);

    const msg: SmsMessage = {
      id: `msg_${Date.now()}`,
      userId: user.id,
      deviceId: 'admin_desk',
      deviceName: 'إدارة المنصة',
      sender: 'طلب سحب من الإدارة',
      body:
        typeof body.note === 'string' && body.note.trim()
          ? body.note.trim()
          : `عندك طلب سحب بمبلغ ${amount.toLocaleString('en-US')} ج.م إلى ${methodLabel} (${reqNum}). أكّد عشان يتخصم من رصيدك أو ارفض لو مش موافق.`,
      parsedAmount: amount,
      currency: 'EGP',
      matchedDepositId: null,
      matchedOrderId: orderId,
      withdrawalId: wdId,
      withdrawalAmountEgp: amount,
      withdrawalDestination: `${methodLabel} · ${reqNum}`,
      withdrawalRecipient: recName,
      withdrawalActionStatus: 'pending_confirmation',
      status: 'unmatched',
      receivedAt: nowIso,
    };
    db.messages.unshift(msg);
    saveAdminDb(db);
    return { ok: true, state: db };
  }

  if (action === 'send_message' && body) {
    db.messages.unshift({
      id: `msg_${Date.now()}`,
      userId: String(body.userId || ''),
      deviceId: 'admin_desk',
      deviceName: 'لوحة الإدارة',
      sender: String(body.sender || 'إدارة المنصة'),
      body: String(body.body || ''),
      parsedAmount: null,
      currency: 'EGP',
      matchedDepositId: null,
      matchedOrderId: null,
      status: 'unmatched',
      receivedAt: new Date().toISOString(),
    });
    saveAdminDb(db);
    return { ok: true, state: db };
  }

  if (action === 'create_deposit' && body) {
    const targetId = String(body.userId || '').trim();
    const qVal = String(body.identifier || '').trim().toLowerCase();
    const qNoAt = qVal.replace(/^@/, '');
    const user = (db.users ?? []).find(
      (u) =>
        (targetId && u.id === targetId) ||
        (qVal &&
          (u.email.trim().toLowerCase() === qVal ||
            u.username.trim().toLowerCase().replace(/^@/, '') === qNoAt ||
            (u.playerId || '').trim().toLowerCase() === qVal))
    );
    if (!user) {
      return { ok: false, error: 'لم يتم العثور على العميل بالبريد أو اليوزرنيم ده' };
    }
    const autoCredit = body.autoCredit !== false;
    const amount = Math.max(1, Number(body.amountEgp) || 0);
    const rate = db.config.usdRate || 49.85;
    const nowIso = new Date().toISOString();
    const depId = `dep_${Date.now()}`;
    const orderId = `EG-${Math.floor(884200 + Math.random() * 90000)}`;
    if (autoCredit) {
      user.balanceEgp = Math.round(((user.balanceEgp || 0) + amount) * 100) / 100;
    }
    db.deposits.unshift({
      id: depId,
      userId: user.id,
      orderId,
      accountId: `acc_${user.id}`,
      amountLocal: amount,
      amountUsdt: Math.round((amount / rate) * 100) / 100,
      incomeUsdt: 0,
      rate,
      requisiteId: 'req_admin',
      bankName:
        typeof body.bankName === 'string' && body.bankName.trim()
          ? body.bankName.trim()
          : 'إيداع فوري من الإدارة',
      ownerName: user.displayName,
      requisiteNumber: user.username,
      status: autoCredit ? 'completed' : 'pending',
      createdAt: nowIso,
      expiresAt: minsFromNow(15),
      ...(autoCredit ? { confirmedAt: nowIso } : {}),
      ...(typeof body.note === 'string' && body.note.trim() ? { customerNote: body.note.trim() } : {}),
    });
    if (autoCredit) {
      db.messages.unshift({
        id: `msg_${Date.now()}`,
        userId: user.id,
        deviceId: 'admin_desk',
        deviceName: 'إدارة المنصة',
        sender: 'إيداع رصيد فوري',
        body:
          typeof body.note === 'string' && body.note.trim()
            ? body.note.trim()
            : `تم إيداع مبلغ ${amount.toLocaleString('en-US')} ج.م ونزوله في حسابك (${user.username}) بنجاح. رصيدك الحالي: ${user.balanceEgp.toLocaleString('en-US')} ج.م.`,
        parsedAmount: amount,
        currency: 'EGP',
        matchedDepositId: depId,
        matchedOrderId: orderId,
        status: 'matched',
        receivedAt: nowIso,
      });
    }
    saveAdminDb(db);
    return { ok: true, user, state: db };
  }

  if (action === 'deposit_action' && body) {
    const dep = db.deposits.find((d) => d.id === body.id);
    if (dep && dep.status === 'pending') {
      if (body.action === 'confirm') {
        dep.status = 'completed';
        dep.confirmedAt = new Date().toISOString();
        const u = (db.users ?? []).find((usr) => usr.id === dep.userId);
        if (u) {
          u.balanceEgp = Math.round(((u.balanceEgp || 0) + dep.amountLocal) * 100) / 100;
        }
      } else if (body.action === 'cancel') {
        dep.status = 'cancelled';
      }
      saveAdminDb(db);
    }
    return { ok: true, state: db };
  }

  if (action === 'update_config' && body) {
    db.config.platformName = FIXED_PLATFORM_NAME;
    if (body.usdRate && Number(body.usdRate) > 0) db.config.usdRate = Number(body.usdRate);
    if (typeof body.adminPassword === 'string' && body.adminPassword.trim()) {
      db.config.adminPassword = body.adminPassword.trim();
    }
    saveAdminDb(db);
    return { ok: true, state: db };
  }

  return { ok: true, state: db };
}
