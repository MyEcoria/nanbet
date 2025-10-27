import 'dotenv/config';
import type { WalletsConfig } from '../types/wallet.types';
import { Converter } from '../utils/unit_converts';

const NODES_API_KEY = process.env.NODES_API_KEY || '';

const main: WalletsConfig = {
  XNO: {
    mainAccountHot: 'nano_1fhnfaone4wxc8ix94et63h9kr3cya7i786kjg34bttd48ce8y1gu18cwhoy',
    RPC: 'https://nodes.nanswap.com/XNO',
    WS: [`wss://nodes.nanswap.com/ws/?ticker=XNO&api=${NODES_API_KEY}`],
    converter: new Converter('XNO'),
    name: 'Nano',
    decimalsToShow: 8,
    prefix: 'nano',
    logo: 'https://nanswap.com/logo/XNO.svg',
    explorer: 'https://nanolooker.com/block/',
    maxBet: 130,
  },
  XRO: {
    mainAccountHot: 'xro_1fhnfaone4wxc8ix94et63h9kr3cya7i786kjg34bttd48ce8y1gu18cwhoy',
    RPC: 'https://nodes.nanswap.com/XRO',
    WS: [`wss://nodes.nanswap.com/ws/?ticker=XRO&api=${NODES_API_KEY}`],
    converter: new Converter('XRO'),
    name: 'RaiBlocksOne',
    decimalsToShow: 8,
    prefix: 'xro',
    logo: 'https://nanswap.com/logo/XNO.svg',
    explorer: 'https://nanolooker.com/block/',
    maxBet: 867398,
  },
  BAN: {
    mainAccountHot: 'ban_1fhnfaone4wxc8ix94et63h9kr3cya7i786kjg34bttd48ce8y1gu18cwhoy',
    RPC: 'https://nodes.nanswap.com/BAN',
    WS: [`wss://nodes.nanswap.com/ws/?ticker=BAN&api=${NODES_API_KEY}`],
    converter: new Converter('BAN'),
    name: 'Banano',
    decimalsToShow: 8,
    prefix: 'ban',
    logo: 'https://nanswap.com/logo/BAN.svg',
    explorer: 'https://bananolooker.com/block/',
    maxBet: 90000,
  },
  XDG: {
    mainAccountHot: 'xdg_1fhnfaone4wxc8ix94et63h9kr3cya7i786kjg34bttd48ce8y1gu18cwhoy',
    RPC: 'https://nodes.nanswap.com/XDG',
    WS: [`wss://nodes.nanswap.com/ws/?ticker=XDG&api=${NODES_API_KEY}`],
    converter: new Converter('XDG'),
    name: 'DogeNano',
    decimalsToShow: 8,
    prefix: 'xdg',
    logo: 'https://nanswap.com/logo/XDG.png',
    explorer: 'https://explorer.dogenano.io/block/',
    maxBet: 28352,
  },
  ANA: {
    mainAccountHot: 'ana_1fhnfaone4wxc8ix94et63h9kr3cya7i786kjg34bttd48ce8y1gu18cwhoy',
    RPC: 'https://nodes.nanswap.com/ANA',
    WS: [`wss://nodes.nanswap.com/ws/?ticker=ANA&api=${NODES_API_KEY}`],
    converter: new Converter('ANA'),
    name: 'Ananos',
    decimalsToShow: 8,
    prefix: 'ana',
    logo: 'https://nanswap.com/logo/ANA.png',
    explorer: 'https://ananault.lightcord.org/transaction/',
    maxBet: 53862940,
  },
  NANUSD: {
    mainAccountHot: 'usd_1fhnfaone4wxc8ix94et63h9kr3cya7i786kjg34bttd48ce8y1gu18cwhoy',
    RPC: 'https://nodes.nanswap.com/NANUSD',
    WS: [`wss://nodes.nanswap.com/ws/?ticker=NANUSD&api=${NODES_API_KEY}`],
    converter: new Converter('NANUSD'),
    name: 'nanUSD',
    decimalsToShow: 3,
    prefix: 'usd',
    logo: 'https://nanswap.com/logo/NANUSD.svg',
    explorer: 'https://nanolooker.com/block/',
    maxBet: 100,
  },
};

export default main;
