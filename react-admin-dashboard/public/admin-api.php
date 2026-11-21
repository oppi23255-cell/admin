<?php
/**
 * Nexus Agency — Standalone React Admin PHP Persistence Bridge
 * Optional JSON API endpoint when deployed on Apache / Nginx / cPanel PHP hosting.
 * Stores data in ./data/hpay-db.json cleanly alongside Firebase (moorrcv).
 */
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate');

$dataDir = __DIR__ . '/data';
$dbFile = $dataDir . '/hpay-db.json';
if (!is_dir($dataDir)) {
    @mkdir($dataDir, 0775, true);
}

function default_db(): array {
    return [
        'config' => [
            'platformName' => 'Nexus Agency',
            'countryCode' => 'EG',
            'currencyCode' => 'EGP',
            'usdRate' => 49.85,
            'adminPassword' => 'admin123',
        ],
        'users' => [],
        'onlinePresence' => [],
        'deposits' => [],
        'withdrawals' => [],
        'messages' => [],
    ];
}

function load_db(string $file): array {
    if (!file_exists($file)) {
        $seed = default_db();
        @file_put_contents($file, json_encode($seed, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
        return $seed;
    }
    $raw = @file_get_contents($file);
    $parsed = $raw ? json_decode($raw, true) : null;
    if (!is_array($parsed) || !isset($parsed['config'])) {
        return default_db();
    }
    $parsed['config']['platformName'] = 'Nexus Agency';
    return $parsed;
}

function save_db(string $file, array $db): void {
    $db['config']['platformName'] = 'Nexus Agency';
    @file_put_contents($file, json_encode($db, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
}

function generate_player_id(array $users): string {
    $taken = [];
    foreach ($users as $u) {
        if (!empty($u['playerId'])) $taken[$u['playerId']] = true;
    }
    for ($i = 0; $i < 25; $i++) {
        $cand = 'PL-' . random_int(10000000, 99999999);
        if (!isset($taken[$cand])) return $cand;
    }
    return 'PL-' . substr((string)time(), -8);
}

$db = load_db($dbFile);
$action = $_GET['action'] ?? $_GET['api'] ?? 'state';
$rawBody = file_get_contents('php://input');
$body = $rawBody ? (json_decode($rawBody, true) ?: []) : [];
$adminPassHeader = trim((string)($_SERVER['HTTP_X_ADMIN_PASSWORD'] ?? ($body['password'] ?? '')));
$expectedPass = trim((string)($db['config']['adminPassword'] ?? 'admin123'));

if ($action === 'login') {
    $email = strtolower(trim((string)($body['email'] ?? '')));
    $pass = trim((string)($body['password'] ?? ''));
    foreach ($db['users'] as $u) {
        $uEmail = strtolower(trim((string)($u['email'] ?? '')));
        $uPass = trim((string)($u['password'] ?? ''));
        if ($uEmail === $email && $uPass === $pass) {
            if (empty($u['active'])) {
                echo json_encode(['ok' => false, 'error' => 'الحساب موقوف مؤقتاً من الإدارة'], JSON_UNESCAPED_UNICODE);
                exit;
            }
            $uid = $u['id'];
            $slice = [
                'config' => $db['config'],
                'deposits' => array_values(array_filter($db['deposits'] ?? [], fn($d) => ($d['userId'] ?? '') === $uid)),
                'withdrawals' => array_values(array_filter($db['withdrawals'] ?? [], fn($w) => ($w['userId'] ?? '') === $uid)),
                'messages' => array_values(array_filter($db['messages'] ?? [], fn($m) => ($m['userId'] ?? '') === $uid)),
            ];
            echo json_encode(['ok' => true, 'userId' => $uid, 'user' => $u, 'slice' => $slice], JSON_UNESCAPED_UNICODE);
            exit;
        }
    }
    echo json_encode(['ok' => false, 'error' => 'البريد الإلكتروني أو كلمة المرور غير صحيحة'], JSON_UNESCAPED_UNICODE);
    exit;
}

if ($action === 'auth') {
    if ($adminPassHeader === $expectedPass) {
        echo json_encode(['ok' => true, 'state' => $db], JSON_UNESCAPED_UNICODE);
    } else {
        echo json_encode(['ok' => false, 'error' => 'كلمة مرور الأدمن مش صح'], JSON_UNESCAPED_UNICODE);
    }
    exit;
}

// Require admin password header on admin endpoints
if ($adminPassHeader !== $expectedPass) {
    http_response_code(401);
    echo json_encode(['ok' => false, 'error' => 'Unauthorized'], JSON_UNESCAPED_UNICODE);
    exit;
}

switch ($action) {
    case 'state':
        echo json_encode(['ok' => true, 'state' => $db], JSON_UNESCAPED_UNICODE);
        break;

    case 'create_user':
        $email = trim((string)($body['email'] ?? ''));
        $pass = trim((string)($body['password'] ?? ''));
        if (!$email || !$pass) {
            echo json_encode(['ok' => false, 'error' => 'البريد وكلمة المرور مطلوبين'], JSON_UNESCAPED_UNICODE);
            exit;
        }
        foreach ($db['users'] as $u) {
            if (strtolower(trim((string)($u['email'] ?? ''))) === strtolower($email)) {
                echo json_encode(['ok' => false, 'error' => 'البريد الإلكتروني مسجل من قبل'], JSON_UNESCAPED_UNICODE);
                exit;
            }
        }
        $prefix = preg_replace('/[^a-zA-Z0-9_]/', '', explode('@', $email)[0]) ?: 'agent';
        $pid = !empty($body['playerId']) ? trim((string)$body['playerId']) : generate_player_id($db['users']);
        $newUser = [
            'id' => !empty($body['id']) ? trim((string)$body['id']) : ('usr_' . (int)(microtime(true) * 1000)),
            'playerId' => $pid,
            'uuid' => !empty($body['uuid']) ? trim((string)$body['uuid']) : sprintf('%08x-%04x-4533-a6f9-%012x', random_int(1, 0xffffffff), random_int(1, 0xffff), random_int(1, 0xffffffffffff)),
            'username' => trim((string)($body['username'] ?? ($prefix . '_egp'))),
            'displayName' => trim((string)($body['displayName'] ?? $prefix)),
            'email' => $email,
            'emailLower' => strtolower($email),
            'password' => $pass,
            'telegramHandle' => '@' . $prefix,
            'balanceEgp' => 0,
            'frozenEgp' => 0,
            'insuranceEgp' => null,
            'canTrade' => true,
            'active' => true,
            'depositFeePct' => 3.0,
            'withdrawalFeePct' => 1.8,
            'referralCode' => 'EG-' . str_replace('PL-', '', $pid),
            'referralRatePct' => 0.5,
            'twoFactorEnabled' => true,
            'trc20Address' => 'TY9xK8mPq7VwRz4nLp3JdXs2kF9aBc7eW1',
            'createdAt' => gmdate('c'),
        ];
        array_unshift($db['users'], $newUser);
        save_db($dbFile, $db);
        echo json_encode(['ok' => true, 'user' => $newUser, 'state' => $db], JSON_UNESCAPED_UNICODE);
        break;

    case 'update_user':
        $uid = (string)($body['userId'] ?? '');
        foreach ($db['users'] as &$u) {
            if ($u['id'] === $uid) {
                $patch = $body['patch'] ?? [];
                if (isset($patch['email'])) {
                    $u['email'] = trim((string)$patch['email']);
                    $u['emailLower'] = strtolower($u['email']);
                }
                if (isset($patch['password'])) $u['password'] = trim((string)$patch['password']);
                if (isset($patch['displayName'])) $u['displayName'] = trim((string)$patch['displayName']);
                if (isset($patch['balanceEgp'])) $u['balanceEgp'] = max(0, (float)$patch['balanceEgp']);
                if (isset($patch['active'])) $u['active'] = (bool)$patch['active'];
                save_db($dbFile, $db);
                echo json_encode(['ok' => true, 'user' => $u, 'state' => $db], JSON_UNESCAPED_UNICODE);
                exit;
            }
        }
        echo json_encode(['ok' => false, 'error' => 'اللاعب غير موجود'], JSON_UNESCAPED_UNICODE);
        break;

    case 'delete_user':
        $uid = (string)($body['userId'] ?? '');
        $db['users'] = array_values(array_filter($db['users'], fn($u) => ($u['id'] ?? '') !== $uid));
        save_db($dbFile, $db);
        echo json_encode(['ok' => true, 'state' => $db], JSON_UNESCAPED_UNICODE);
        break;

    case 'send_withdrawal':
        $uid = (string)($body['userId'] ?? '');
        $target = null;
        foreach ($db['users'] as $u) {
            if ($u['id'] === $uid) { $target = $u; break; }
        }
        if (!$target) {
            echo json_encode(['ok' => false, 'error' => 'اختر مستخدم صحيح أولاً'], JSON_UNESCAPED_UNICODE);
            exit;
        }
        $amount = max(1, (float)($body['amountEgp'] ?? 0));
        $rate = (float)($db['config']['usdRate'] ?? 49.85);
        $wdId = 'wd_' . (int)(microtime(true) * 1000);
        $orderId = 'WD-' . random_int(400000, 999999);
        $now = gmdate('c');
        $method = trim((string)($body['destinationMethod'] ?? 'فودافون كاش'));
        $reqNum = trim((string)($body['requisiteNumber'] ?? '01000000000'));
        $recName = trim((string)($body['recipientName'] ?? $target['displayName']));
        $wd = [
            'id' => $wdId,
            'userId' => $uid,
            'orderId' => $orderId,
            'accountId' => 'acc_' . $uid,
            'amountLocal' => $amount,
            'amountUsdt' => round($amount / $rate, 2),
            'incomeUsdt' => 0,
            'rate' => $rate,
            'destinationMethod' => $method,
            'requisiteNumber' => $reqNum,
            'recipientName' => $recName,
            'status' => 'awaiting_confirmation',
            'createdAt' => $now,
            'expiresAt' => gmdate('c', time() + 1800),
            'adminCreated' => true,
            'receiptFiles' => [],
        ];
        array_unshift($db['withdrawals'], $wd);
        $note = trim((string)($body['note'] ?? ''));
        $msg = [
            'id' => 'msg_' . (int)(microtime(true) * 1000),
            'userId' => $uid,
            'deviceId' => 'admin_desk',
            'deviceName' => 'إدارة المنصة',
            'sender' => 'طلب سحب من الإدارة',
            'body' => $note ?: "عندك طلب سحب بمبلغ " . number_format($amount) . " ج.م إلى {$method} ({$reqNum}). أكّد عشان يتخصم من رصيدك أو ارفض لو مش موافق.",
            'parsedAmount' => $amount,
            'currency' => 'EGP',
            'matchedDepositId' => null,
            'matchedOrderId' => $orderId,
            'withdrawalId' => $wdId,
            'withdrawalAmountEgp' => $amount,
            'withdrawalDestination' => "{$method} · {$reqNum}",
            'withdrawalRecipient' => $recName,
            'withdrawalActionStatus' => 'pending_confirmation',
            'status' => 'unmatched',
            'receivedAt' => $now,
        ];
        array_unshift($db['messages'], $msg);
        save_db($dbFile, $db);
        echo json_encode(['ok' => true, 'state' => $db], JSON_UNESCAPED_UNICODE);
        break;

    case 'send_message':
        $msg = [
            'id' => 'msg_' . (int)(microtime(true) * 1000),
            'userId' => (string)($body['userId'] ?? ''),
            'deviceId' => 'admin_desk',
            'deviceName' => 'لوحة الإدارة',
            'sender' => trim((string)($body['sender'] ?? 'إدارة المنصة')),
            'body' => trim((string)($body['body'] ?? '')),
            'parsedAmount' => null,
            'currency' => 'EGP',
            'matchedDepositId' => null,
            'matchedOrderId' => null,
            'status' => 'unmatched',
            'receivedAt' => gmdate('c'),
        ];
        array_unshift($db['messages'], $msg);
        save_db($dbFile, $db);
        echo json_encode(['ok' => true, 'state' => $db], JSON_UNESCAPED_UNICODE);
        break;

    case 'create_deposit':
        $targetId = trim((string)($body['userId'] ?? ''));
        $ident = strtolower(trim((string)($body['identifier'] ?? '')));
        $identNoAt = ltrim($ident, '@');
        $foundIndex = -1;
        foreach ($db['users'] as $i => $u) {
            $uEmail = strtolower(trim((string)($u['email'] ?? '')));
            $uUser = ltrim(strtolower(trim((string)($u['username'] ?? ''))), '@');
            $uPid = strtolower(trim((string)($u['playerId'] ?? '')));
            if (($targetId && $u['id'] === $targetId) || ($ident && ($uEmail === $ident || $uUser === $identNoAt || $uPid === $ident))) {
                $foundIndex = $i;
                break;
            }
        }
        if ($foundIndex < 0) {
            echo json_encode(['ok' => false, 'error' => 'لم يتم العثور على العميل بالبريد أو اليوزرنيم ده'], JSON_UNESCAPED_UNICODE);
            exit;
        }
        $amount = max(1, (float)($body['amountEgp'] ?? 0));
        $rate = (float)($db['config']['usdRate'] ?? 49.85);
        $autoCredit = ($body['autoCredit'] ?? true) !== false;
        $now = gmdate('c');
        if ($autoCredit) {
            $db['users'][$foundIndex]['balanceEgp'] = round((float)($db['users'][$foundIndex]['balanceEgp'] ?? 0) + $amount, 2);
        }
        $targetUser = $db['users'][$foundIndex];
        $depId = 'dep_' . (int)(microtime(true) * 1000);
        $orderId = 'EG-' . random_int(884200, 984199);
        $dep = [
            'id' => $depId,
            'userId' => $targetUser['id'],
            'orderId' => $orderId,
            'accountId' => 'acc_' . $targetUser['id'],
            'amountLocal' => $amount,
            'amountUsdt' => round($amount / $rate, 2),
            'incomeUsdt' => 0,
            'rate' => $rate,
            'requisiteId' => 'req_admin',
            'bankName' => trim((string)($body['bankName'] ?? '')) ?: 'إيداع فوري من الإدارة',
            'ownerName' => $targetUser['displayName'],
            'requisiteNumber' => $targetUser['username'],
            'status' => $autoCredit ? 'completed' : 'pending',
            'createdAt' => $now,
            'expiresAt' => gmdate('c', time() + 900),
            'confirmedAt' => $autoCredit ? $now : null,
            'customerNote' => trim((string)($body['note'] ?? '')),
        ];
        array_unshift($db['deposits'], $dep);
        save_db($dbFile, $db);
        echo json_encode(['ok' => true, 'user' => $targetUser, 'state' => $db], JSON_UNESCAPED_UNICODE);
        break;

    case 'deposit_action':
        $depId = (string)($body['id'] ?? '');
        $act = (string)($body['action'] ?? '');
        foreach ($db['deposits'] as &$d) {
            if ($d['id'] === $depId && $d['status'] === 'pending') {
                if ($act === 'confirm') {
                    $d['status'] = 'completed';
                    $d['confirmedAt'] = gmdate('c');
                    foreach ($db['users'] as &$u) {
                        if ($u['id'] === ($d['userId'] ?? '')) {
                            $u['balanceEgp'] = round((float)$u['balanceEgp'] + (float)$d['amountLocal'], 2);
                        }
                    }
                } elseif ($act === 'cancel') {
                    $d['status'] = 'cancelled';
                }
            }
        }
        save_db($dbFile, $db);
        echo json_encode(['ok' => true, 'state' => $db], JSON_UNESCAPED_UNICODE);
        break;

    case 'update_config':
        $db['config']['platformName'] = 'Nexus Agency';
        if (!empty($body['usdRate']) && (float)$body['usdRate'] > 0) {
            $db['config']['usdRate'] = (float)$body['usdRate'];
        }
        if (!empty($body['adminPassword'])) {
            $db['config']['adminPassword'] = trim((string)$body['adminPassword']);
        }
        save_db($dbFile, $db);
        echo json_encode(['ok' => true, 'state' => $db], JSON_UNESCAPED_UNICODE);
        break;

    default:
        echo json_encode(['ok' => true, 'state' => $db], JSON_UNESCAPED_UNICODE);
        break;
}
