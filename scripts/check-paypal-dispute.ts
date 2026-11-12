import 'dotenv/config';
import { fetchDisputeDetail, deriveAllowedActions } from '../server/paypal/disputes';

async function main() {
  const d = await fetchDisputeDetail('PP-R-YYP-10198826');
  console.log('Status:', d.status);
  console.log('Stage:', d.dispute_life_cycle_stage);
  console.log('Allowed options:', JSON.stringify(d.allowed_response_options));
  console.log('Links:', JSON.stringify(d.links));
  console.log('Evidences count:', d.evidences?.length);
  console.log('Evidences:', JSON.stringify(d.evidences, null, 2));
  console.log('Derived actions:', deriveAllowedActions(d));
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
