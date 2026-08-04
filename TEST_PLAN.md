# Order Workflow Improvements - Test Plan

**Status:** Ready for Testing  
**Risk Level:** Medium (Database schema changes + new features)  
**Rollback Plan:** If issues, revert to 86700819 deployment

---

## Phase 1: Database & Core Functions ✅

### Database Migration
```sql
-- Run migrate_v10.sql
-- Adds: ready_after, payment_reminders_sent, is_will_call, is_local_delivery
-- Creates: order_notifications, order_events tables
```

**Test Steps:**
1. ✓ Verify new columns added to orders table
2. ✓ Verify new tables created (order_notifications, order_events)
3. ✓ Verify indexes created for performance
4. ✓ Verify no data loss in existing orders

**Expected Result:** Database should have no errors, existing orders intact

---

## Phase 2: Notification System Tests

### Test: Order Confirmation Email

**Setup:**
```javascript
// Create test order
const testOrder = {
  id: 99999,
  order_number: 'TEST-001',
  customer_name: 'John Doe',
  customer_email: 'test@example.com',
  items_json: '[{"name": "Peptide X", "qty": 1}]',
  order_total: 49.99
}
```

**Test Cases:**
1. ✓ Email sent successfully to customer
2. ✓ Notification logged in order_notifications table
3. ✓ Event logged in order_events table
4. ✓ Email contains order number and total
5. ✓ Spanish translation works for Spanish users

**Expected Result:** Email delivered, logged in DB, no errors

---

### Test: Payment Verification Notification

**Trigger:** Admin clicks "Verify Payment"

**Test Cases:**
1. ✓ Payment verified email sent
2. ✓ payment_verified notification logged
3. ✓ For will-call: message mentions "ready soon"
4. ✓ For shipping: message mentions "ship tracking"
5. ✓ Notification appears in customer history

**Expected Result:** Email sent, notification logged, no DB errors

---

### Test: Ready for Pickup Notification (Will Call)

**Trigger:** Admin clicks "Mark Ready for Pickup"

**Test Cases:**
1. ✓ Ready for pickup email sent
2. ✓ ready_after timestamp saved
3. ✓ Email includes pickup date
4. ✓ Order status changed to fulfilled
5. ✓ Notification logged with status 'sent'

**Expected Result:** Email sent, timestamp saved, status updated

---

## Phase 3: Inventory Verification Tests

### Test: Verify Inventory Before Fulfillment

**Setup:**
```javascript
// Create order with known products
const order = {
  items_json: '[
    {"code": "PEPTIDE-001", "qty": 2},
    {"code": "PEPTIDE-002", "qty": 1}
  ]'
}
```

**Test Cases:**
1. ✓ Verification passes if all items in stock
2. ✓ Verification fails if items out of stock
3. ✓ Verification fails if insufficient quantity
4. ✓ Error messages are clear and actionable
5. ✓ Inventory reserved on fulfill (stock decremented)
6. ✓ Inventory ledger updated for tracking

**Expected Result:** Inventory checked, reserved if valid, logged if invalid

---

### Test: Inventory Release (Cancellation)

**Trigger:** Admin cancels or refunds order

**Test Cases:**
1. ✓ Stock quantities restored
2. ✓ Inventory ledger updated with reversal
3. ✓ No negative stock levels
4. ✓ Order status changed to cancelled/refunded

**Expected Result:** Inventory restored, audit trail maintained

---

## Phase 4: Will Call Improvements Tests

### Test: Will Call Pickup Timeline

**Setup:**
```javascript
// When marking ready, set pickup date
const readyAfter = Math.floor(Date.now() / 1000) + (86400 * 2); // 2 days from now
```

**Test Cases:**
1. ✓ ready_after timestamp saved
2. ✓ Customer receives email with pickup date
3. ✓ Pickup date displays correctly in order details
4. ✓ Can change pickup date if needed
5. ✓ "Mark Picked Up" only appears after ready

**Expected Result:** Pickup timeline set and communicated

---

### Test: Will Call Pickup Reminder (3-5 days)

**Trigger:** Automated job runs (future feature)

**Test Cases:**
1. ✓ Reminder sent 3-5 days after ready
2. ✓ Reminder contains pickup date
3. ✓ Reminder sent only once
4. ✓ Customer email verified before sending

**Expected Result:** Reminder sent on schedule

---

## Phase 5: Payment Reminder Tracking Tests

### Test: Payment Reminder Counter

**Setup:**
```javascript
// Track how many reminders sent
// payment_reminders_sent counter in orders table
```

**Test Cases:**
1. ✓ Counter incremented each time reminder sent
2. ✓ Prevent duplicate reminders within 24 hours
3. ✓ Max 3 reminders before auto-cancel
4. ✓ Counter visible in admin panel

**Expected Result:** Reminders tracked, duplicates prevented

---

## Phase 6: Customer Tracking Page Tests

### Test: Public Order Status Page

**Setup:**
```
GET /api/orders/track?order_number=XXX&email=customer@example.com
```

**Test Cases:**
1. ✓ Requires both order_number and email
2. ✓ Shows current status
3. ✓ Shows tracking number for shipped orders
4. ✓ Shows pickup date for will-call orders
5. ✓ Shows estimated delivery if available
6. ✓ Hides sensitive info (payment, customer phone)
7. ✓ Works with Spanish language preference

**Expected Result:** Tracking page accessible, secure, informative

---

## Phase 7: Admin Dashboard Updates

### Test: Order History & Events

**Setup:**
- View existing order details
- Check notification history
- Check event log

**Test Cases:**
1. ✓ Notification history shows all sent emails
2. ✓ Event log shows status changes in chronological order
3. ✓ Can see why order was cancelled/refunded
4. ✓ Timestamps are accurate
5. ✓ No performance impact when viewing history

**Expected Result:** History accessible, performant, accurate

---

## Phase 8: End-to-End Workflow Tests

### Test: Complete Shipping Workflow

**Setup:** Create new order through checkout

**Steps:**
1. ✓ Order created (Pending) → confirmation email sent
2. ✓ Admin verifies payment → payment verified email sent
3. ✓ Admin checks inventory → verification passes
4. ✓ Admin marks fulfilled → inventory reserved
5. ✓ Admin gets shipping label → label printed
6. ✓ Admin marks shipped → tracking email sent to customer
7. ✓ Admin marks completed → completion email sent
8. ✓ All emails received and logged correctly

**Expected Result:** Complete workflow succeeds, all notifications sent

---

### Test: Complete Will Call Workflow

**Setup:** Create will-call order

**Steps:**
1. ✓ Order created → confirmation email sent
2. ✓ Payment verified → payment email sent
3. ✓ Admin sets ready date → ready email sent with date
4. ✓ Customer receives email with pickup instructions
5. ✓ Customer can view order status online
6. ✓ Admin marks picked up → completion email sent
7. ✓ All events logged correctly

**Expected Result:** Will call workflow succeeds

---

### Test: Complete Local Delivery Workflow

**Setup:** Create local delivery order

**Steps:**
1. ✓ Order created → confirmation email sent
2. ✓ Payment verified → payment email sent
3. ✓ Admin marks fulfilled → inventory reserved
4. ✓ Admin dispatches driver → dispatch notification
5. ✓ Driver picked up order
6. ✓ Order marked completed → delivery email sent

**Expected Result:** Local delivery workflow succeeds

---

## Performance Tests

### Test: Database Query Performance

**Cases:**
1. ✓ Retrieving order notifications < 100ms
2. ✓ Retrieving order events < 100ms
3. ✓ Inventory verification < 500ms
4. ✓ Retrieving 100 orders with history < 1s

**Expected Result:** All queries performant

---

### Test: Email Sending Performance

**Cases:**
1. ✓ Email sent in < 2 seconds
2. ✓ Multiple emails can queue without blocking
3. ✓ No memory leaks in notification system

**Expected Result:** Email system performant, reliable

---

## Rollback Tests

### Test: Rollback to 86700819

**Cases:**
1. ✓ Site still works after rollback
2. ✓ No data loss in original orders
3. ✓ No orphaned records in new tables

**Expected Result:** Seamless rollback possible

---

## Security Tests

### Test: Order Status Access

**Cases:**
1. ✓ Customer can only view own orders (email + order_number required)
2. ✓ Admin cannot see customer emails in tracking page
3. ✓ Payment details never exposed in tracking page
4. ✓ Phone numbers never exposed

**Expected Result:** Secure access, no data leaks

---

## Final Approval Checklist

- [ ] All Phase tests passed
- [ ] No performance degradation
- [ ] No data corruption
- [ ] No missing emails
- [ ] Rollback verified
- [ ] Ready to deploy

---

## Deployment Procedure

1. **Backup**: Take D1 database backup
2. **Test**: Run test suite locally
3. **Stage**: Deploy to staging environment
4. **Verify**: Run integration tests
5. **Production**: Deploy to 86700819 (rolled-back version)
6. **Monitor**: Watch for errors for 24 hours
7. **Confirm**: Mark as stable

**STOP Point:** Before step 3, get user approval to proceed

