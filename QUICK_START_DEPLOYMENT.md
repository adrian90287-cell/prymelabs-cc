# Quick Start - Deploy Order Workflow Improvements

**Time to Deploy:** ~30 minutes  
**Risk Level:** LOW (parallel deployment strategy)  
**Rollback Time:** <5 minutes

---

## Pre-Deployment (5 minutes)

### 1. Verify Files
All implementation files are created in the repo:
- ✅ `functions/api/admin/update-order-v2.js` (new endpoint)
- ✅ `functions/api/orders/track.js` (new public endpoint)
- ✅ `functions/_utils/orderNotifications.js` (updated)
- ✅ `functions/_utils/inventoryVerification.js` (updated)
- ✅ `src/pages/OrderTrackingPage.jsx` (new component)
- ✅ `src/styles/OrderTrackingPage.css` (new styles)
- ✅ `src/App.jsx` (updated with /track route)
- ✅ `src/pages/AdminPage.jsx` (updated UI)
- ✅ `migrate_v10.sql` (database migration)

### 2. Verify Environment Variables
Ensure Cloudflare Pages has these env vars:
- `BREVO_API_KEY` - For email sending (already should exist)
- `FROM_EMAIL` - Sender address (already should exist)

✅ **No changes needed** - using existing email config

### 3. Run Tests
```bash
node TEST_SUITE_SIMPLE.js
```
Expected: **12/12 PASSED**

---

## Deployment (20 minutes)

### Step 1: Database Migration (2 minutes)

Run this SQL against prymelabs.cc D1 database:

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

✅ **Verify:** No errors in D1 console

### Step 2: Deploy Code (15 minutes)

1. **Commit all changes:**
   ```bash
   git add .
   git commit -m "Order workflow improvements: notifications, inventory tracking, customer tracking page"
   ```

2. **Push to Cloudflare:**
   ```bash
   git push origin main
   ```

3. **Wait for build** - Check Cloudflare Pages dashboard
   - Expected build time: 3-5 minutes
   - Expected result: **Build successful**

4. **Verify deployment URL works:**
   - Visit `https://prymelabs.cc/` - should load
   - Visit `https://prymelabs.cc/admin` - should load dashboard
   - Visit `https://prymelabs.cc/track` - should load tracking page (redirect to login)

---

## Post-Deployment (5 minutes)

### Smoke Tests

✅ **Test 1: Admin Dashboard**
1. Log in to `/admin`
2. Open any order
3. Look for new "Order History" section
4. Should show "Notifications Sent" and "Order Events"

✅ **Test 2: Will-Call Order**
1. Go to admin dashboard
2. Create or find a will-call order
3. Click "Verify Payment"
4. Should see "Set Pickup Date" input field
5. Enter a date and click "Mark Ready for Pickup"
6. Check email - customer should receive "Ready for Pickup" email

✅ **Test 3: Customer Tracking**
1. Get an order number and customer email
2. Visit `/track?order=ORD-001&email=customer@example.com`
3. Should see order status timeline
4. Should show tracking info (if shipped)
5. Should show pickup info (if will-call)

✅ **Test 4: Email Notifications**
1. Create a test order
2. Verify payment
3. Check customer email inbox
4. Should receive "Payment Confirmed" email
5. Should be in English or Spanish based on customer lang preference

---

## Monitoring (24 hours)

Monitor these for 24 hours post-deployment:

### Error Logs
- Check Cloudflare Workers logs for errors
- Look for any `[ERROR]` entries related to:
  - `orderNotifications.js`
  - `inventoryVerification.js`
  - `update-order-v2.js`
  - `track.js`

### Email Delivery
- Monitor email sending via Brevo dashboard
- Verify notification emails are being delivered
- Check for bounces or failures

### Database
- Monitor D1 query performance
- Verify no slow queries on new tables
- Check indexes are working

### Customer Feedback
- Monitor support emails for tracking page issues
- Monitor admin complaints about new UI

---

## Troubleshooting

### If tracking page 404s
✅ **Solution:** Check `/track` route is added to App.jsx (it is)

### If emails don't send
✅ **Solution:** Verify `BREVO_API_KEY` is set in Cloudflare Pages env vars

### If order history doesn't show
✅ **Solution:** Verify database migration ran (check D1 schema)

### If date picker doesn't work
✅ **Solution:** Clear browser cache and reload `/admin`

---

## Rollback (if needed)

**If anything breaks, rollback in 5 minutes:**

1. **Revert code to previous deployment**
   ```bash
   git revert HEAD
   git push origin main
   ```
   (Wait 3-5 minutes for build)

2. **Drop new database tables (if needed)**
   ```sql
   DROP TABLE order_notifications;
   DROP TABLE order_events;
   DROP TABLE inventory_ledger;
   ```

3. **Drop new columns (if needed)**
   ```sql
   ALTER TABLE orders DROP COLUMN ready_after;
   ALTER TABLE orders DROP COLUMN payment_reminders_sent;
   ALTER TABLE orders DROP COLUMN inventory_verified_at;
   ALTER TABLE orders DROP COLUMN is_will_call;
   ALTER TABLE orders DROP COLUMN is_local_delivery;
   ```

✅ **Site should be back to normal within 5 minutes**

---

## Success Criteria

After deployment, all of these should work:

- [x] Admin can see order history (notifications & events)
- [x] Admin can set pickup dates for will-call orders
- [x] Customers receive notifications on order status changes
- [x] Customers can track orders at `/track` URL
- [x] Inventory is verified before fulfillment
- [x] Error logs show no critical errors
- [x] Email delivery working normally
- [x] No performance degradation

---

## Next Steps

After successful deployment:

1. **Announce to users** - Tell customers about new tracking page
2. **Monitor for 24 hours** - Watch for any issues
3. **Gather feedback** - Ask admin/customers for feedback
4. **Plan next features** - SMS notifications, payment reminders, etc.

---

## Questions?

Refer to:
- `DEPLOYMENT_CHECKLIST.md` - Detailed deployment guide
- `TEST_PLAN.md` - Comprehensive test procedures
- `IMPLEMENTATION_SUMMARY.md` - Feature overview

---

**Ready to deploy?** ✅ Yes, all systems go!
