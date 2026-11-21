import React, { useCallback, useEffect, useState } from 'react';
import { ToastContainer } from './components/ToastContainer';
import {
  clearFirestoreProbeCache,
  createFirestoreUser,
  deleteFirestoreUser,
  fetchFirestoreUsers,
  FIXED_PLATFORM_NAME,
  probeFirestoreServer,
  sendFirestoreInstantDeposit,
  sendFirestoreMessage,
  sendFirestoreWithdrawal,
  subscribeAdminCollections,
  updateFirestoreConfig,
  updateFirestoreDeposit,
  updateFirestoreUser,
  verifyFirestoreAdminPassword,
} from './firebase/client';
import { AdminDashboardPage, FirebaseConnectionStatus } from './pages/AdminDashboardPage';
import { ManagedUser, PlatformState, SmsMessage, ToastMessage } from './types';
import { loadAdminDb, runLocalAdminAction, saveAdminDb, upsertUserInLocalDb } from './utils/localStore';

const ADMIN_SESSION_KEY = 'egyptpay_admin_pass_v1';

class AdminErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; message: string }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(err: Error) {
    return { hasError: true, message: err?.message || 'Render error' };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div dir="rtl" className="min-h-dvh bg-[#0e0e10] text-white flex items-center justify-center p-4">
          <div className="max-w-md w-full rounded-2xl border border-[#28282d] bg-[#151518] p-6 text-center space-y-4">
            <div className="text-[17px] font-bold">حدث خطأ مؤقت في لوحة الإدارة</div>
            <div className="text-[12.5px] text-[#8d8d95] font-mono-num">{this.state.message}</div>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="rounded-xl bg-[#e25d0a] px-5 py-2 text-[13px] font-semibold text-white cursor-pointer"
            >
              إعادة التحميل
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  return (
    <AdminErrorBoundary>
      <AdminAppInner />
    </AdminErrorBoundary>
  );
}

function AdminAppInner() {
  const [state, setState] = useState<PlatformState>(() => loadAdminDb());
  const [adminPassword, setAdminPassword] = useState<string | null>(() => {
    try {
      return sessionStorage.getItem(ADMIN_SESSION_KEY);
    } catch {
      return null;
    }
  });
  const [firebaseStatus, setFirebaseStatus] = useState<FirebaseConnectionStatus>('connecting');
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const notify = useCallback(
    (type: ToastMessage['type'], title: string, message?: string) => {
      const id = `toast_${Date.now()}_${Math.random().toString(16).slice(2, 6)}`;
      setToasts((prev) => [...prev, { id, type, title, message }]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 4200);
    },
    []
  );

  // Call optional PHP bridge (./admin-api.php) when deployed on cPanel / Apache / Nginx with PHP
  const callPhpBridge = useCallback(
    async (action: string, payload?: Record<string, unknown>, passOverride?: string) => {
      const pass = passOverride ?? adminPassword ?? '';
      try {
        const res = await fetch(`./admin-api.php?action=${encodeURIComponent(action)}`, {
          method: payload ? 'POST' : 'GET',
          headers: {
            ...(payload ? { 'Content-Type': 'application/json' } : {}),
            ...(pass ? { 'x-admin-password': pass } : {}),
          },
          body: payload ? JSON.stringify(payload) : undefined,
        });
        const ct = res.headers.get('content-type') || '';
        if (!ct.includes('application/json')) return null;
        return (await res.json()) as Record<string, unknown>;
      } catch {
        return null;
      }
    },
    [adminPassword]
  );

  // Boot check: probe Firestore & PHP bridge
  useEffect(() => {
    probeFirestoreServer().then((probe) => {
      setFirebaseStatus(probe.ok ? 'connected' : 'offline');
    });
  }, []);

  // Subscribe to Firestore when authenticated
  useEffect(() => {
    if (!adminPassword) return;
    let unsub = () => {};
    probeFirestoreServer().then((probe) => {
      if (!probe.ok) {
        setFirebaseStatus('offline');
        return;
      }
      setFirebaseStatus('connected');
      unsub = subscribeAdminCollections({
        onConfig: (cfg) => {
          setState((prev) => ({
            ...prev,
            config: { ...cfg, platformName: FIXED_PLATFORM_NAME },
          }));
        },
        onUsers: (fsUsers) => {
          setState((prev) => {
            const existing = prev.users ?? [];
            if (fsUsers.length === 0 && existing.length > 0) return prev;
            const byId = new Map<string, ManagedUser>();
            for (const u of existing) byId.set(u.id, u);
            for (const u of fsUsers) byId.set(u.id, u);
            const next = { ...prev, users: Array.from(byId.values()) };
            saveAdminDb(next);
            return next;
          });
        },
        onPresence: (entries) => {
          setState((prev) => ({
            ...prev,
            onlinePresence: entries,
            onlineCount: entries.length,
          }));
        },
        onWithdrawals: (withdrawals) => {
          setState((prev) =>
            withdrawals.length === 0 && prev.withdrawals.length > 0 ? prev : { ...prev, withdrawals }
          );
        },
        onDeposits: (deposits) => {
          setState((prev) =>
            deposits.length === 0 && prev.deposits.length > 0 ? prev : { ...prev, deposits }
          );
        },
        onMessages: (messages) => {
          setState((prev) =>
            messages.length === 0 && prev.messages.length > 0 ? prev : { ...prev, messages }
          );
        },
      });
    });
    return () => unsub();
  }, [adminPassword]);

  const applyReturnedState = (res: Record<string, unknown> | null) => {
    if (res?.state) {
      const next = res.state as PlatformState;
      next.config.platformName = FIXED_PLATFORM_NAME;
      saveAdminDb(next);
      setState(next);
    }
  };

  return (
    <>
      <AdminDashboardPage
        state={state}
        adminAuthed={Boolean(adminPassword)}
        firebaseStatus={firebaseStatus}
        onAdminLogin={async (pass) => {
          const cleanPass = pass.trim();
          const [fsAuth, phpAuth] = await Promise.all([
            verifyFirestoreAdminPassword(cleanPass),
            callPhpBridge('auth', { password: cleanPass }, cleanPass),
          ]);
          const localAuth = runLocalAdminAction('auth', { password: cleanPass });

          if (fsAuth.ok || phpAuth?.ok || localAuth.ok) {
            setAdminPassword(cleanPass);
            try {
              sessionStorage.setItem(ADMIN_SESSION_KEY, cleanPass);
            } catch {
              // ignore
            }
            if (phpAuth?.ok && phpAuth.state) {
              applyReturnedState(phpAuth);
            } else {
              setState(loadAdminDb());
            }
            if (fsAuth.ok) setFirebaseStatus('connected');
            return { ok: true };
          }
          return {
            ok: false,
            error:
              (phpAuth?.error as string | undefined) ||
              (localAuth.error as string | undefined) ||
              'كلمة مرور الأدمن مش صح',
          };
        }}
        onAdminLogout={() => {
          setAdminPassword(null);
          try {
            sessionStorage.removeItem(ADMIN_SESSION_KEY);
          } catch {
            // ignore
          }
        }}
        onRefreshAdmin={async () => {
          clearFirestoreProbeCache();
          const fsUsers = await fetchFirestoreUsers();
          if (fsUsers.ok && fsUsers.users) {
            setFirebaseStatus('connected');
            for (const u of fsUsers.users) upsertUserInLocalDb(u);
          }
          const phpState = await callPhpBridge('state');
          if (phpState?.ok) {
            applyReturnedState(phpState);
          } else {
            setState(loadAdminDb());
          }
        }}
        onCreateUser={async (payload) => {
          const fsRes = await createFirestoreUser(payload);
          if (fsRes.ok && fsRes.user) {
            upsertUserInLocalDb(fsRes.user);
            callPhpBridge('create_user', {
              ...payload,
              id: fsRes.user.id,
              playerId: fsRes.user.playerId,
              uuid: fsRes.user.uuid,
            }).catch(() => undefined);
            setState((prev) => ({
              ...prev,
              users: [fsRes.user!, ...(prev.users ?? []).filter((u) => u.id !== fsRes.user!.id)],
            }));
            return { ok: true, user: fsRes.user };
          }
          if (fsRes.error) return { ok: false, error: fsRes.error };

          const phpRes = await callPhpBridge('create_user', payload);
          if (phpRes?.ok && phpRes.user) {
            upsertUserInLocalDb(phpRes.user as ManagedUser);
            applyReturnedState(phpRes);
            return { ok: true, user: phpRes.user as ManagedUser };
          }
          if (phpRes && !phpRes.ok && phpRes.error) {
            return { ok: false, error: String(phpRes.error) };
          }

          const localRes = runLocalAdminAction('create_user', payload);
          if (localRes.ok) applyReturnedState(localRes);
          return {
            ok: Boolean(localRes.ok),
            error: localRes.error as string | undefined,
            user: localRes.user as ManagedUser | undefined,
          };
        }}
        onUpdateUser={async (userId, patch) => {
          await updateFirestoreUser(userId, patch).catch(() => undefined);
          const phpRes = await callPhpBridge('update_user', { userId, patch });
          if (phpRes?.ok) {
            applyReturnedState(phpRes);
          } else {
            const localRes = runLocalAdminAction('update_user', { userId, patch });
            applyReturnedState(localRes);
          }
          return { ok: true };
        }}
        onDeleteUser={async (userId) => {
          await deleteFirestoreUser(userId).catch(() => undefined);
          const phpRes = await callPhpBridge('delete_user', { userId });
          if (phpRes?.ok) {
            applyReturnedState(phpRes);
          } else {
            const localRes = runLocalAdminAction('delete_user', { userId });
            applyReturnedState(localRes);
          }
        }}
        onSendWithdrawalToUser={async (payload) => {
          const targetUser = (state.users ?? []).find((u) => u.id === payload.userId);
          if (!targetUser) return { ok: false, error: 'اختر مستخدم صحيح أولاً' };
          await sendFirestoreWithdrawal({
            user: targetUser,
            amountEgp: payload.amountEgp,
            destinationMethod: payload.destinationMethod,
            requisiteNumber: payload.requisiteNumber,
            recipientName: payload.recipientName,
            usdRate: state.config.usdRate,
            note: payload.note,
          }).catch(() => undefined);
          const phpRes = await callPhpBridge('send_withdrawal', payload);
          if (phpRes?.ok) {
            applyReturnedState(phpRes);
            return { ok: true };
          }
          const localRes = runLocalAdminAction('send_withdrawal', payload);
          applyReturnedState(localRes);
          return { ok: Boolean(localRes.ok), error: localRes.error as string | undefined };
        }}
        onSendMessageToUser={async (payload) => {
          const msg: SmsMessage = {
            id: `msg_${Date.now()}_${Math.floor(10 + Math.random() * 89)}`,
            userId: payload.userId,
            deviceId: 'admin_desk',
            deviceName: 'لوحة الإدارة',
            sender: payload.sender || 'إدارة المنصة',
            body: payload.body,
            parsedAmount: payload.amountEgp ?? null,
            currency: 'EGP',
            matchedDepositId: null,
            matchedOrderId: null,
            status: 'unmatched',
            receivedAt: new Date().toISOString(),
          };
          await sendFirestoreMessage(msg).catch(() => undefined);
          const phpRes = await callPhpBridge('send_message', payload);
          if (phpRes?.ok) {
            applyReturnedState(phpRes);
          } else {
            const localRes = runLocalAdminAction('send_message', payload);
            applyReturnedState(localRes);
          }
        }}
        onCreateDepositForUser={async (payload) => {
          const fsRes = await sendFirestoreInstantDeposit({
            ...payload,
            usdRate: state.config.usdRate,
          });
          if (fsRes.ok && fsRes.user) {
            upsertUserInLocalDb(fsRes.user);
            callPhpBridge('create_deposit', payload).catch(() => undefined);
            setState((prev) => ({
              ...prev,
              users: (prev.users ?? []).map((u) => (u.id === fsRes.user!.id ? fsRes.user! : u)),
              deposits: fsRes.deposit ? [fsRes.deposit, ...prev.deposits] : prev.deposits,
            }));
            return { ok: true, user: fsRes.user };
          }

          const phpRes = await callPhpBridge('create_deposit', payload);
          if (phpRes?.ok) {
            applyReturnedState(phpRes);
            return { ok: true, user: phpRes.user as ManagedUser | undefined };
          }
          if (phpRes && !phpRes.ok && phpRes.error) {
            return { ok: false, error: String(phpRes.error) };
          }

          const localRes = runLocalAdminAction('create_deposit', payload);
          if (localRes.ok) applyReturnedState(localRes);
          return {
            ok: Boolean(localRes.ok),
            error: localRes.error as string | undefined,
            user: localRes.user as ManagedUser | undefined,
          };
        }}
        onDepositAction={async (id, action) => {
          const dep = state.deposits.find((d) => d.id === id);
          await updateFirestoreDeposit(id, action, dep?.userId).catch(() => undefined);
          const phpRes = await callPhpBridge('deposit_action', { id, action });
          if (phpRes?.ok) {
            applyReturnedState(phpRes);
          } else {
            const localRes = runLocalAdminAction('deposit_action', { id, action });
            applyReturnedState(localRes);
          }
        }}
        onUpdateConfig={async (patch) => {
          await updateFirestoreConfig({ ...patch, platformName: FIXED_PLATFORM_NAME }).catch(() => undefined);
          const phpRes = await callPhpBridge('update_config', patch);
          if (phpRes?.ok) {
            applyReturnedState(phpRes);
          } else {
            const localRes = runLocalAdminAction('update_config', patch);
            applyReturnedState(localRes);
          }
          if (patch.adminPassword?.trim()) {
            const clean = patch.adminPassword.trim();
            setAdminPassword(clean);
            try {
              sessionStorage.setItem(ADMIN_SESSION_KEY, clean);
            } catch {
              // ignore
            }
          }
        }}
        onNotify={notify}
      />
      <ToastContainer
        toasts={toasts}
        position={state.settings.notificationPosition}
        onDismiss={(id) => setToasts((prev) => prev.filter((t) => t.id !== id))}
      />
    </>
  );
}
