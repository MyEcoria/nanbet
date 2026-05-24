import 'dotenv/config';
import walletsConfig from '../src/config/wallets';
import { sendFeeless } from '../src/utils/nanswap_wallet';

const destination = process.argv[2];
const amount = process.argv[3];

if (!destination || !amount) {
  process.exit(1);
}

const config = walletsConfig.XNO;
const rawAmount = config.converter.megaToRaw(amount);

await sendFeeless('XNO', config.mainAccountHot, destination, rawAmount);
