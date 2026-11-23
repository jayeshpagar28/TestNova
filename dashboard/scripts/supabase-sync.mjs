// One full Supabase pass from the command line: the first upload of existing projects (backfill),
// or a catch-up while the dashboard is not running. Safe to repeat: unchanged data is skipped.
//   npm run supabase:sync
import { syncNow } from '../server/supabase.mjs';

const s = await syncNow();
console.log(JSON.stringify(s, null, 1));
process.exit(s.enabled && s.state === 'synced' ? 0 : 1);
