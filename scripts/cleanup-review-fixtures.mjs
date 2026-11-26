// Removes the local review accounts and their records created by
// scripts/review-capture.mjs and scripts/review-phase5.mjs.
// Local loopback Supabase only.
import { createClient } from '@supabase/supabase-js';

const URL = process.env.REVIEW_SUPABASE_URL;
const SERVICE = process.env.REVIEW_SUPABASE_SERVICE_KEY;
if (!URL || !SERVICE || !/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/?$/.test(URL)) {
  console.error('Cleanup needs a loopback REVIEW_SUPABASE_URL and service key.');
  process.exit(2);
}

const admin = createClient(URL, SERVICE, { auth: { persistSession: false } });

async function main() {
  const users = [];
  let page = 1;
  for (;;) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    users.push(...data.users);
    if (data.users.length < 200) break;
    page += 1;
  }

  const reviewUsers = users.filter((user) => /^review5?-/.test(user.email || ''));
  for (const user of reviewUsers) {
    const { data: listings } = await admin.from('scrap_listings').select('id').eq('consumer_id', user.id);
    const listingIds = (listings || []).map((row) => row.id);
    if (listingIds.length) {
      const { data: lots } = await admin.from('material_lots').select('id').in('source_listing_id', listingIds);
      const lotIds = (lots || []).map((row) => row.id);
      if (lotIds.length) await admin.from('transactions').delete().in('lot_id', lotIds);
      if (lotIds.length) await admin.from('material_lots').delete().in('id', lotIds);
    }
    const { data: facilities } = await admin.from('recyclers').select('id').eq('profile_id', user.id);
    const facilityIds = (facilities || []).map((row) => row.id);
    if (facilityIds.length) await admin.from('transactions').delete().in('recycler_id', facilityIds);
    await admin.from('recyclers').delete().eq('profile_id', user.id);
    await admin.from('material_lots').delete().eq('collector_id', user.id);
    await admin.from('scrap_listings').delete().eq('consumer_id', user.id);
    await admin.from('scrap_listings').delete().eq('collector_id', user.id);
    await admin.from('role_requests').delete().eq('user_id', user.id);
    await admin.auth.admin.deleteUser(user.id);
    console.log('Removed', user.email);
  }
  console.log(`Cleanup complete: ${reviewUsers.length} review account(s).`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
