/**
 * Siddhi Bangle Tracker — Daily Follow-up Summary Email
 * ══════════════════════════════════════════════════════════════════════════
 * Runs on a Cron Trigger (see wrangler.toml) every evening. Reads the same
 * Firebase Realtime Database the app writes to, and sends a summary email
 * built from two things the app already maintains:
 *
 *   - S.followUpLog        — every "Kya Bola?" response ever logged (who,
 *                             what they said, when). Filtered here to today.
 *   - S.followUpSnapshot    — a lightweight, pre-computed list of whatever's
 *                             CURRENTLY still due, refreshed by the app every
 *                             ~30 min (and on load / after each response).
 *
 * Deliberately does NOT re-implement the app's follow-up rules engine here —
 * that logic lives in bangle_v19.html and would drift out of sync if
 * duplicated. This worker only reads what the app already computed.
 *
 * Caveat, stated plainly: the snapshot is only as fresh as the last time
 * someone had the app open. If nobody opens it in the evening, "Abhi Bhi
 * Pending" reflects the last known state, not a live-recomputed one. Good
 * enough for a daily summary; not a real-time dashboard.
 * ══════════════════════════════════════════════════════════════════════════
 */

const FB_DATA = 'https://bangle-tracker-default-rtdb.firebaseio.com/appData.json';
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

function istDateStr(ms) {
  return new Date(ms + IST_OFFSET_MS).toISOString().split('T')[0];
}
function istTimeStr(ms) {
  return new Date(ms + IST_OFFSET_MS).toISOString().split('T')[1].slice(0, 5);
}
function fmtDateIST(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  if (isNaN(d.getTime())) return dateStr;
  return String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0') + '/' + d.getFullYear();
}
function esc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

async function fetchAppState() {
  const resp = await fetch(FB_DATA);
  if (!resp.ok) throw new Error('Firebase fetch failed: HTTP ' + resp.status);
  const envelope = await resp.json();
  if (!envelope || !envelope.data) throw new Error('Firebase payload missing "data" field');
  return JSON.parse(envelope.data);
}

function buildEmailHtml(state, todayStr) {
  const log = state.followUpLog || [];
  const snapshot = state.followUpSnapshot || { totalPending: 0, items: [] };
  const todayLog = log.filter(e => istDateStr(e.loggedAt) === todayStr);

  const byUser = {};
  todayLog.forEach(e => { (byUser[e.loggedBy] = byUser[e.loggedBy] || []).push(e); });
  const userNames = Object.keys(byUser).sort((a, b) => byUser[b].length - byUser[a].length);

  const brokenPromises = (snapshot.items || []).filter(i => i.isBrokenPromise);
  const stillPending = snapshot.items || [];

  const dateLabel = new Date(todayStr + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  // ── Stat strip ──
  const statsHtml = `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">
      <tr>
        <td width="33%" align="center" style="padding:14px 8px;border-right:1px solid #E3E0F5">
          <div style="font-size:22px;font-weight:800;color:#0E7A5F;font-family:Arial,Helvetica,sans-serif">${todayLog.length}</div>
          <div style="font-size:10px;color:#726F8C;font-weight:600;text-transform:uppercase;letter-spacing:.04em;font-family:Arial,Helvetica,sans-serif;margin-top:4px">Follow-up Hua Aaj</div>
        </td>
        <td width="34%" align="center" style="padding:14px 8px;border-right:1px solid #E3E0F5">
          <div style="font-size:22px;font-weight:800;color:#A15E00;font-family:Arial,Helvetica,sans-serif">${stillPending.length}</div>
          <div style="font-size:10px;color:#726F8C;font-weight:600;text-transform:uppercase;letter-spacing:.04em;font-family:Arial,Helvetica,sans-serif;margin-top:4px">Abhi Bhi Pending</div>
        </td>
        <td width="33%" align="center" style="padding:14px 8px">
          <div style="font-size:22px;font-weight:800;color:#B23A3A;font-family:Arial,Helvetica,sans-serif">${brokenPromises.length}</div>
          <div style="font-size:9px;color:#726F8C;font-weight:600;text-transform:uppercase;letter-spacing:.03em;font-family:Arial,Helvetica,sans-serif;margin-top:4px;line-height:1.3">Maal Promise Kiya,<br>Diya Nahi</div>
        </td>
      </tr>
    </table>`;

  // ── Broken promises ──
  let brokenHtml = '';
  if (brokenPromises.length) {
    brokenHtml = `
    <div style="padding:18px 26px;border-top:1px solid #E3E0F5">
      <div style="font-size:13px;font-weight:800;color:#B23A3A;margin-bottom:10px;font-family:Arial,Helvetica,sans-serif">⚠️ Maal Promise Kiya But Diya Nahi (${brokenPromises.length})</div>
      ${brokenPromises.map(it => `
        <div style="background:#FCEBEB;border:1px solid #F0B7B7;border-radius:9px;padding:9px 10px;margin-bottom:6px;font-family:Arial,Helvetica,sans-serif">
          <div style="font-size:13px;font-weight:700;color:#2B2A3D">${esc(it.title)}${it.vendor ? ' · ' + esc(it.vendor) : ''}</div>
          <div style="font-size:12px;color:#726F8C;margin-top:2px">${it.promisedDate ? 'Promise kiya tha: <b>' + esc(fmtDateIST(it.promisedDate)) + '</b> — ' : ''}${it.overdueDays}d se pending hai</div>
        </div>`).join('')}
    </div>`;
  }

  // ── Completed today, grouped by user ──
  let completedHtml = '';
  if (todayLog.length) {
    completedHtml = `
    <div style="padding:18px 26px;border-top:1px solid #E3E0F5">
      <div style="font-size:13px;font-weight:800;color:#0E7A5F;margin-bottom:10px;font-family:Arial,Helvetica,sans-serif">✅ Follow-up Hua Aaj (${todayLog.length})</div>
      ${userNames.map(u => {
        const rows = [...byUser[u]].sort((a, b) => a.loggedAt - b.loggedAt);
        return `
        <div style="margin-bottom:12px">
          <div style="font-size:11.5px;font-weight:700;color:#3C3489;margin-bottom:6px;font-family:Arial,Helvetica,sans-serif">👤 ${esc(u)} <span style="font-size:10px;color:#726F8C;font-weight:600">(${rows.length})</span></div>
          ${rows.map(e => `
            <div style="background:#E5F6EF;border:1px solid #B9E6D3;border-radius:9px;padding:9px 10px;margin-bottom:6px;font-family:Arial,Helvetica,sans-serif">
              <div style="font-size:13px;font-weight:700;color:#2B2A3D">${esc(e.title)}${e.vendor ? ' · ' + esc(e.vendor) : ''}</div>
              <div style="font-size:12.5px;color:#2B2A3D;margin-top:3px;font-style:italic">🗣️ <b style="font-style:normal;color:#3C3489">${esc(e.reasonLabel)}</b>${e.detail && e.reasonKey !== 'no_pipe' && e.reasonKey !== 'no_pickup' ? ' — ' + esc(e.detail) : ''}</div>
              <div style="font-size:10.5px;color:#726F8C;margin-top:3px">${istTimeStr(e.loggedAt)}</div>
            </div>`).join('')}
        </div>`;
      }).join('')}
    </div>`;
  }

  // ── Still pending (everything not yet resolved, as of the last snapshot) ──
  let pendingHtml = '';
  if (stillPending.length) {
    pendingHtml = `
    <div style="padding:18px 26px;border-top:1px solid #E3E0F5">
      <div style="font-size:13px;font-weight:800;color:#A15E00;margin-bottom:10px;font-family:Arial,Helvetica,sans-serif">📦 Abhi Bhi Pending — Poore System Mein (${stillPending.length})</div>
      ${stillPending.slice(0, 25).map(it => `
        <div style="background:#FFF3E0;border:1px solid #F3CE94;border-radius:9px;padding:8px 10px;margin-bottom:5px;font-family:Arial,Helvetica,sans-serif">
          <div style="font-size:12.5px;font-weight:700;color:#2B2A3D">${it.ruleIcon || ''} ${esc(it.title)}${it.vendor ? ' · ' + esc(it.vendor) : ''}</div>
          <div style="font-size:11px;color:#726F8C;margin-top:2px">${esc(it.ruleLabel)} — ${it.overdueDays}d se pending</div>
        </div>`).join('')}
      ${stillPending.length > 25 ? `<div style="font-size:11px;color:#726F8C;margin-top:4px;font-family:Arial,Helvetica,sans-serif">…aur ${stillPending.length - 25} aur. Poori list app mein dekhein.</div>` : ''}
    </div>`;
  }

  const emptyHtml = (!todayLog.length && !stillPending.length) ? `
    <div style="padding:2.5rem 26px;text-align:center;color:#726F8C;font-family:Arial,Helvetica,sans-serif">
      <div style="font-size:32px;margin-bottom:8px">✅</div>Abhi kuch bhi pending nahi hai — badhiya kaam!
    </div>` : '';

  return `<!doctype html>
<html>
<body style="margin:0;background:#EDEAF8;padding:24px 12px;font-family:Arial,Helvetica,sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
    <table role="presentation" width="640" cellpadding="0" cellspacing="0" style="max-width:640px;width:100%;background:#FFFFFF;border-radius:14px;overflow:hidden;border:1px solid #E3E0F5">
      <tr><td style="background:#534AB7;background:linear-gradient(135deg,#534AB7,#3C3489);color:#ffffff;padding:22px 26px">
        <div style="font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;opacity:.85">Siddhi Bangle Tracker</div>
        <div style="font-size:20px;font-weight:800;margin:6px 0 3px">📋 Follow-up Summary</div>
        <div style="font-size:12.5px;opacity:.85">${dateLabel}</div>
      </td></tr>
      <tr><td>${statsHtml}</td></tr>
      <tr><td>${brokenHtml}${completedHtml}${pendingHtml}${emptyHtml}</td></tr>
      <tr><td style="padding:18px 26px 22px;text-align:center;background:#F7F6FD;border-top:1px solid #E3E0F5">
        <a href="https://bangle-tracker.pages.dev/bangle_v19" style="display:inline-block;background:#534AB7;color:#ffffff;text-decoration:none;font-size:12.5px;font-weight:700;padding:10px 22px;border-radius:8px">Poora Follow-up Log app mein dekhein →</a>
        <div style="font-size:10.5px;color:#726F8C;margin-top:10px;line-height:1.6">Ye summary automatically banti hai Siddhi Bangle Tracker se.<br>Snapshot ka time: ${snapshot.generatedAt ? istTimeStr(snapshot.generatedAt) + ' IST' : 'unknown'}.</div>
      </td></tr>
    </table>
  </td></tr></table>
</body>
</html>`;
}

async function sendEmail(env, html, todayStr) {
  const resp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + env.RESEND_API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: env.FROM_EMAIL || 'Siddhi Bangle Tracker <onboarding@resend.dev>',
      to: env.TO_EMAIL,
      subject: `📋 Follow-up Summary — ${fmtDateIST(todayStr)}`,
      html,
    }),
  });
  if (!resp.ok) {
    const body = await resp.text();
    throw new Error('Resend send failed: HTTP ' + resp.status + ' — ' + body);
  }
  return resp.json();
}

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil((async () => {
      try {
        const state = await fetchAppState();
        const todayStr = istDateStr(Date.now());
        const html = buildEmailHtml(state, todayStr);
        await sendEmail(env, html, todayStr);
        console.log('Daily follow-up email sent for', todayStr);
      } catch (err) {
        console.error('Daily follow-up email failed:', err.message);
      }
    })());
  },

  // Manual trigger for testing: visit the worker's URL with ?test=1
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.searchParams.get('test') !== '1') {
      return new Response('Siddhi Bangle Tracker — Daily Follow-up Email Worker. Add ?test=1 to send a test email now.', { status: 200 });
    }
    try {
      const state = await fetchAppState();
      const todayStr = istDateStr(Date.now());
      const html = buildEmailHtml(state, todayStr);
      if (url.searchParams.get('preview') === '1') {
        return new Response(html, { headers: { 'Content-Type': 'text/html' } });
      }
      const result = await sendEmail(env, html, todayStr);
      return new Response('Sent: ' + JSON.stringify(result), { status: 200 });
    } catch (err) {
      return new Response('Failed: ' + err.message, { status: 500 });
    }
  },
};
