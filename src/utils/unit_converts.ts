import Big from 'big.js';

Big.NE = -31;
Big.PE = 39;

type UnitTicker = 'XNO' | 'NANUSD' | 'XRO' | 'ANA' | 'BAN' | 'XDG' | 'UNDEFINED';

interface UnitConfig {
  raw_in_mega: string | undefined;
  mega_in_raw: string | undefined;
}

const UNIT_TICKER: Record<UnitTicker, UnitConfig> = {
  XNO: {
    raw_in_mega: '1000000000000000000000000000000',
    mega_in_raw: '.000000000000000000000000000001',
  },
  NANUSD: {
    raw_in_mega: '1000000',
    mega_in_raw: '.000001',
  },
  XRO: {
    raw_in_mega: '1000000000000000000000000000000',
    mega_in_raw: '.000000000000000000000000000001',
  },
  ANA: {
    raw_in_mega: '10000000000000000000000000000',
    mega_in_raw: '0.0000000000000000000000000001',
  },
  BAN: {
    raw_in_mega: '100000000000000000000000000000',
    mega_in_raw: '0.00000000000000000000000000001',
  },
  XDG: {
    raw_in_mega: '100000000000000000000000000',
    mega_in_raw: '.00000000000000000000000001',
  },
  UNDEFINED: {
    raw_in_mega: undefined,
    mega_in_raw: undefined,
  },
};

const RAW_MIN_AMOUNT = new Big('1');
const RAW_MAX_AMOUNT = new Big('340282366920938463463374607431768211455');

export class Converter {
  chain: string;
  MEGA_IN_RAW: Big;

  constructor(chain: string) {
    this.chain = chain;

    if (!(chain in UNIT_TICKER)) {
      throw Error(`${this.chain} rawToMega unit convert is not implemented`);
    }

    const config = UNIT_TICKER[chain as UnitTicker];
    if (config.mega_in_raw === undefined) {
      throw Error(`${this.chain} rawToMega unit convert is not implemented`);
    }

    this.MEGA_IN_RAW = new Big(config.mega_in_raw);
  }

  rawToMega(raw: number | string): string | number {
    if (Number(raw) === 0) {
      return 0;
    }

    if (raw === undefined) {
      throw Error('The raw amount must be defined.');
    }

    if (typeof raw !== 'string' && typeof raw !== 'number') {
      throw TypeError('The raw amount must be a string or a number.');
    }

    let rawBig: Big;

    try {
      rawBig = new Big(raw);
    } catch (_error) {
      throw Error('The raw amount is invalid.');
    }

    if (rawBig.lt(0)) {
      throw Error('The raw amount must not be negative.');
    }

    if (rawBig.lt(RAW_MIN_AMOUNT)) {
      throw Error('The raw amount is too small.');
    }

    if (rawBig.gt(RAW_MAX_AMOUNT)) {
      throw Error('The raw amount is too large.');
    }

    return rawBig.times(this.MEGA_IN_RAW).toString();
  }

  megaToRaw(mega: number | string): string {
    if (!(this.chain in UNIT_TICKER)) {
      throw Error(`${this.chain} megaToRaw unit convert is not implemented`);
    }

    const config = UNIT_TICKER[this.chain as UnitTicker];
    if (config.raw_in_mega === undefined) {
      throw Error(`${this.chain} megaToRaw unit convert is not implemented`);
    }

    const MEGA_MIN_AMOUNT = this.MEGA_IN_RAW;
    const MEGA_MAX_AMOUNT = new Big(RAW_MAX_AMOUNT).times(this.MEGA_IN_RAW);
    const RAW_IN_MEGA = new Big(config.raw_in_mega);

    if (mega === undefined) {
      throw Error('The mega amount must be defined.');
    }

    if (typeof mega !== 'string' && typeof mega !== 'number') {
      throw TypeError('The mega amount must be a string or a number.');
    }

    let megaBig: Big;

    try {
      megaBig = new Big(mega);
    } catch (_error) {
      throw Error('The mega amount is invalid.');
    }

    if (megaBig.lt(0)) {
      throw Error('The mega amount must not be negative.');
    }

    if (megaBig.lt(MEGA_MIN_AMOUNT)) {
      throw Error('The mega amount is too small.');
    }

    if (megaBig.gt(MEGA_MAX_AMOUNT)) {
      throw Error('The mega amount is too large.');
    }

    return megaBig.times(RAW_IN_MEGA).toString();
  }
}
