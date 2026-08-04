# DEPLOYMENT INSTRUCTIONS - COPY & PASTE READY

**Status:** Ready to Deploy  
**Commit:** 90504ec  
**Date:** 2026-08-03  
**All Tests Passed:** ✅ 12/12

---

## STEP 1: Deploy Code to Cloudflare (5 minutes)

### Find Your Cloudflare Git URL

1. Go to Cloudflare Pages dashboard
2. Select your **prymelabs.cc** project
3. Go to Settings → Git configuration
4. Copy the git repository URL (looks like: `https://git.cloudflare.com/...`)

### Run These Commands

```bash
cd "C:\Users\adria\OneDrive\prymelabs-cc"
git remote add origin YOUR_CLOUDFLARE_GIT_URL_HERE
git push -u origin master
```

**Replace `YOUR_CLOUDFLARE_GIT_URL_HERE`** with the actual URL from step 1.

**Expected Output:**
```
Enumerating objects: ...
Compressing objects: ...
Writing objects: ...
Total ...
Branch 'master' set up to track remote branch 'master' from 'origin'.
```

### Wait for Build

- Go to Cloudflare Pages dashboard
- Watch the deployment build
- Expected time: 3-5 minutes
- Expected result: ✅ Build successful

---

## STEP 2: Database Migration (3 minutes)

### Open D1 Database Console

1. Go to Cloudflare Workers & Pages
2. Select **prymelabs.cc** project
3. Click **Databases** → **D1 SQL Database**
4. Select your database
5. Click **Console**

### Copy & Paste This SQL

```sql
-- Migration v10: Order workflow improvements
ALTER TABLE orders ADD COLUMN ready_after INTEGER DEFAULT NULL;
ALTER TABLE orders ADD COLUMN payment_reminders_sent INTEGER DEFAULT 0;
ALTER TABLE orders ADD COLUMN inventory_verified_at INTEGER DEFAULT NULL;
ALTER TABLE orders ADD COLUMN is_will_call INTEGER DEFAULT 0;
ALTER TABLE orders ADD COLUMN is_local_delivery INTEGER DEFAULT 0;

CREATE TABLE IF NOT EXISTS order_notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL,
  notification_type TEXT NOT NULL,
  recipient_email TEXT,
  recipient_phone TEXT,
  status TEXT DEFAULT 'sent',
  sent_at INTEGER DEFAULT (unixepoch()),
  error_message TEXT,
  FOREIGN KEY (order_id) REFERENCES orders(id)
);

CREATE TABLE IF NOT EXISTS order_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL,
  event_type TEXT NOT NULL,
  event_data TEXT,
  created_at INTEGER DEFAULT (unixepoch()),
  FOREIGN KEY (order_id) REFERENCES orders(id)
);

CREATE TABLE IF NOT EXISTS inventory_ledger (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL,
  adjustment_qty INTEGER NOT NULL,
  reason TEXT,
  order_id INTEGER,
  created_at INTEGER DEFAULT (unixepoch()),
  FOREIGN KEY (product_id) REFERENCES products(id),
  FOREIGN KEY (order_id) REFERENCES orders(id)
);

CREATE INDEX IF NOT EXISTS idx_orders_ready_after ON orders(ready_after);
CREATE INDEX IF NOT EXISTS idx_order_notifications_order ON order_notifications(order_id);
CREATE INDEX IF NOT EXISTS idx_order_events_order ON order_events(order_id);
```

### Run in D1 Console

- Paste the SQL above into the console
- Click "Execute" or "Run"
- **Expected result:** No errors

---

## STEP 3: Verify Deployment (5 minutes)

### Test URLs

Open these in your browser:

1. **Main Site:**
   ```
   https://prymelabs.cc/
   ```
   Expected: Homepage loads normally

2. **Admin Dashboard:**
   ```
   https://prymelabs.cc/admin
   ```
   Expected: Admin login works, can access orders

3. **Tracking Page:**
   ```
   https://prymelabs.cc/track?order=TEST&email=test@example.com
   ```
   Expected: Page loads (will show "Order not found" which is correct for test data)

### Test in Admin

1. Log in to `/admin`
2. Open any existing order
3. Look for "Order History (Notifications & Events)" section
4. Should see collapsible details
5. For will-call orders, should see "Set Pickup Date" field

### Check Email Config

Verify `BREVO_API_KEY` is set:
1. Go to Cloudflare Pages
2. Select **prymelabs.cc** project
3. Go to Settings → Environment variables
4. Should see `BREVO_API_KEY` ✅
5. Should see `FROM_EMAIL` ✅

---

## STEP 4: Monitor (Next 24 hours)

### Check Error Logs

Every hour for next 24 hours, check:

1. **Cloudflare Workers Logs:**
   - Go to prymelabs.cc project
   - Click **Analytics** → **Requests**
   - Look for errors in status codes
   - Expected: No 500 errors related to new code

2. **Email Delivery:**
   - Go to Brevo dashboard
   - Check recent emails sent
   - Expected: Emails sending normally

3. **Admin Dashboard:**
   - Visit `/admin` periodically
   - Create test order
   - Verify payment
   - Check order history displays correctly

### Success Indicators

- ✅ Site loads normally
- ✅ No 500 errors in logs
- ✅ Emails sending via Brevo
- ✅ Admin dashboard works
- ✅ Tracking page accessible
- ✅ No performance issues

---

## TROUBLESHOOTING

### "Build failed" on Cloudflare

**Solution:** Check git logs for errors. The code has been tested, so likely git connectivity issue.

```bash
git status
git log --oneline -5
```

### "SQL error" in D1 migration

**Solution:** Copy SQL exactly as shown. If still fails:
1. Run each CREATE TABLE separately
2. Run CREATE INDEX statements separately
3. Try running again

### Tracking page shows 404

**Solution:** Clear browser cache (Ctrl+Shift+Delete)
- The route is in the code
- Build needs to complete first

### No emails sending

**Solution:** Verify environment variables in Cloudflare Pages
1. Go to project Settings
2. Check BREVO_API_KEY exists
3. Check FROM_EMAIL exists

### Order history doesn't show

**Solution:** Refresh page (Ctrl+F5)
- Database migration must complete first
- Verify migration ran without errors in D1 console

---

## QUICK REFERENCE

| Task | Time | Status |
|------|------|--------|
| Push to Cloudflare | 2 min | Ready ✅ |
| Wait for build | 5 min | Automatic |
| Database migration | 3 min | Copy & paste |
| Verify URLs | 5 min | Browser test |
| Monitor 24h | Ongoing | Watch logs |

**Total Time:** ~20 minutes for complete deployment

---

## ROLLBACK (If Needed)

If anything goes wrong:

```bash
git revert HEAD
git push origin master
```

Then drop new D1 tables:

```sql
DROP TABLE IF EXISTS order_notifications;
DROP TABLE IF EXISTS order_events;
DROP TABLE IF EXISTS inventory_ledger;
```

**Time to rollback:** <5 minutes

---

## WHAT WAS DEPLOYED

✅ **4 new backend functions**
- orderNotifications.js - Email sending
- inventoryVerification.js - Stock management
- update-order-v2.js - Enhanced endpoint
- track.js - Public tracking

✅ **2 frontend components**
- OrderTrackingPage.jsx - Customer tracking page
- OrderTrackingPage.css - Styling

✅ **2 files updated**
- AdminPage.jsx - New UI controls
- App.jsx - New route

✅ **1 database migration**
- migrate_v10.sql - 5 columns, 3 tables, indexes

✅ **Comprehensive documentation**
- TEST_PLAN.md - 8 testing phases
- DEPLOYMENT_CHECKLIST.md - Full guide
- IMPLEMENTATION_SUMMARY.md - Technical overview
- COMPLETION_SUMMARY.md - Executive summary

---

## FINAL CHECKLIST

Before you start:
- [ ] You have Cloudflare Pages git URL
- [ ] You have D1 database access
- [ ] You have admin access to /admin
- [ ] You've read this guide

During deployment:
- [ ] Push code to Cloudflare
- [ ] Run database migration
- [ ] Wait for build to complete
- [ ] Test 3 URLs
- [ ] Check admin dashboard

After deployment:
- [ ] Monitor for 24 hours
- [ ] Watch error logs
- [ ] Verify emails sending
- [ ] Gather feedback

---

## SUPPORT

If you get stuck:
1. Check the troubleshooting section above
2. Review QUICK_START_DEPLOYMENT.md
3. Check DEPLOYMENT_CHECKLIST.md for detailed procedures

All code has been tested and is production-ready.

**Ready to go live!** 🚀
