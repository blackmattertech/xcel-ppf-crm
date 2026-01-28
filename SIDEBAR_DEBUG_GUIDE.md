# Sidebar Loading Debug Guide

## 🔍 Issue Being Investigated

Sidebar menu items showing skeleton loaders indefinitely after refresh.

---

## ✅ Fixes Applied

### 1. **Added Error Handling** (`components/AuthProvider.tsx`)
- ✅ Added `error` check in database query
- ✅ Added try-catch in auth state change listener
- ✅ Ensures `loading` is always set to `false` even on errors
- ✅ Added console.log for debugging

### 2. **Added Debug Logging** (`components/Sidebar.tsx` & `components/AuthProvider.tsx`)
- ✅ Logs when permissions are loaded
- ✅ Logs filtering process
- ✅ Shows permission count
- ✅ Shows filtered items count

---

## 🧪 How to Debug

### Step 1: Open Browser Console

1. Open your app in browser
2. Press **F12** (or Cmd+Option+I on Mac)
3. Go to **Console** tab
4. Refresh the page (F5)

### Step 2: Check Console Logs

You should see logs like this:

```
Auth state changed: INITIAL_SESSION user-id-here
Loaded permissions: ["leads.read", "leads.create", "followups.read", ...]
Loaded role: tele_caller
Filtering sidebar items: { loading: false, userId: "...", userRole: "tele_caller", permissionCount: 8 }
Filtered sidebar items count: 5
```

---

## 🔍 What to Look For

### ✅ Good Signs:
```
Loaded permissions: ["leads.read", "leads.create", ...]  ← Has permissions
Loaded role: tele_caller                                  ← Role loaded
Filtered sidebar items count: 5                           ← Found menu items
```

### ❌ Bad Signs:
```
Loaded permissions: []                                    ← NO permissions!
Loaded role: null                                         ← NO role!
Filtered sidebar items count: 0                           ← NO items!
```

### ❌ Error Signs:
```
Error fetching user data: { code: "PGRST116", message: "..." }
Error loading user data: ...
```

---

## 🐛 Common Issues & Solutions

### Issue 1: No Permissions Loaded
**Log shows:** `Loaded permissions: []`

**Possible causes:**
1. User has no role assigned
2. Role has no permissions assigned
3. Database query failing silently

**Solutions:**
```sql
-- Check if user has a role
SELECT id, name, email, role_id FROM users WHERE id = 'your-user-id';

-- Check if role has permissions
SELECT 
  r.name as role_name,
  p.name as permission_name
FROM roles r
JOIN role_permissions rp ON r.id = rp.role_id
JOIN permissions p ON rp.permission_id = p.id
WHERE r.id = 'role-id-from-above';
```

**Fix:** Assign permissions to the role in `/admin/roles` page

---

### Issue 2: No Role Loaded
**Log shows:** `Loaded role: null`

**Possible causes:**
1. User record doesn't exist in `users` table
2. User has no `role_id` set
3. Foreign key constraint issue

**Solutions:**
```sql
-- Check user record
SELECT * FROM users WHERE id = 'your-user-id';

-- If no user record, create one
INSERT INTO users (id, email, name, role_id)
VALUES (
  'auth-user-id',
  'user@example.com',
  'User Name',
  (SELECT id FROM roles WHERE name = 'tele_caller')
);
```

---

### Issue 3: Database Query Error
**Log shows:** `Error fetching user data: ...`

**Possible causes:**
1. Foreign key name mismatch
2. Table doesn't exist
3. Permission denied

**Check foreign key name:**
```sql
-- List all foreign keys on users table
SELECT
  tc.constraint_name,
  tc.table_name,
  kcu.column_name,
  ccu.table_name AS foreign_table_name,
  ccu.column_name AS foreign_column_name
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
WHERE tc.table_name = 'users' AND tc.constraint_type = 'FOREIGN KEY';
```

**Fix:** Update the foreign key name in AuthProvider query if different

---

### Issue 4: Loading Stuck at True
**Log shows:** Nothing (sidebar keeps showing skeletons)

**Possible cause:** Loading state never set to false

**Quick fix:**
```typescript
// Temporary: Force loading to false after 5 seconds
setTimeout(() => {
  if (loading) {
    console.warn('Force setting loading to false')
    setLoading(false)
  }
}, 5000)
```

---

## 🔧 Quick Fixes to Try

### Fix 1: Check Browser Console (RIGHT NOW)
Press **F12** and refresh the page. Look for the console logs mentioned above.

### Fix 2: Clear Everything
```javascript
// In browser console
localStorage.clear()
sessionStorage.clear()
location.reload()
```

### Fix 3: Check Network Tab
1. Open DevTools → Network tab
2. Refresh page
3. Look for requests to Supabase
4. Check if any are failing (red)

### Fix 4: Test with Simple Query
Add this temporarily to AuthProvider to test if basic queries work:

```typescript
// After line 46, add this test:
const { data: testData, error: testError } = await supabase
  .from('users')
  .select('id, name')
  .eq('id', userId)
  .single()

console.log('Test query result:', testData, testError)
```

---

## 📊 Expected Console Output (Working Correctly)

```
Auth state changed: INITIAL_SESSION abc-123-def-456
Loaded permissions: [
  "leads.read", 
  "leads.create",
  "followups.read",
  "customers.read"
]
Loaded role: tele_caller
Filtering sidebar items: {
  loading: false,
  userId: "abc-123-def-456",
  userRole: "tele_caller",
  permissionCount: 4
}
Filtered sidebar items count: 5
```

---

## 🚀 Next Steps

### After you check the console:

**If you see permissions loading:**
✅ Share the console logs with me, and I'll help diagnose

**If you see errors:**
✅ Share the error message, and I'll provide specific fixes

**If you see nothing:**
✅ The logs might be disabled - let me know and I'll add more visible debugging

---

## 🔥 Emergency Rollback

If the sidebar is completely broken, revert these changes:

```bash
git diff components/AuthProvider.tsx
git diff components/Sidebar.tsx
git checkout components/AuthProvider.tsx
git checkout components/Sidebar.tsx
```

Then manually refresh will work again (old behavior).

---

**Please check your browser console now and share what you see!** 

The console logs will tell us exactly what's happening with the permissions loading.
